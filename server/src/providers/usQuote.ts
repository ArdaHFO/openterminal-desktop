import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { parseFrames, resolveUsTicker } from './fiveDay.js';
import { search } from './tradingview.js';
import type { Quote } from './yahoo.js';

type Fields = Record<string, unknown>;
type UsQuote = Quote & { delayStatus: 'unknown'; instrumentNote: string };
const pending = new Map<string, Promise<UsQuote>>();
const listings = new Map<string, { ticker: string; expires: number }>();
let active = 0;
const waiters: Array<() => void> = [];

export function makeUsQuote(symbol: string, ticker: string, fields: Fields): UsQuote {
  const positive = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
  const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : null;
  const price = positive(fields.lp), time = positive(fields.lp_time);
  const [exchange, listedSymbol] = ticker.split(':');
  if (!['NASDAQ','NYSE','AMEX'].includes(exchange) || listedSymbol !== symbol || fields.pro_name !== ticker || !price || !time || !Number.isSafeInteger(time)) throw new Error('Invalid US quote identity, price or time');
  const sourceObj = fields.source2 as {name?: unknown} | undefined;
  const source = typeof sourceObj?.name === 'string' && sourceObj.name.trim() ? sourceObj.name.slice(0, 80) : 'TradingView';
  const name = typeof fields.description === 'string' ? fields.description.slice(0, 160) : symbol;
  const volume = finite(fields.volume);
  return {
    symbol, name, price, time, change:finite(fields.ch), changePercent:finite(fields.chp),
    open:positive(fields.open_price), high:positive(fields.high_price), low:positive(fields.low_price), previousClose:positive(fields.prev_close_price),
    // The stream has no separate bid/ask timestamps; don't mix potentially
    // after-hours quotes with a regular-session last trade.
    bid:null, ask:null, volume:volume !== null && volume >= 0 ? volume : null,
    avgVolume:null, marketCap:null, pe:null, eps:null, dividendYield:null, week52High:null, week52Low:null, beta:null, sharesOutstanding:null,
    currency:fields.currency_code === 'USD' ? 'USD' : null, exchange, marketState:null,
    source:source === 'TradingView' ? source : `TradingView / ${source}`, delayStatus:'unknown',
    instrumentNote:`${ticker}; regular-session price`,
  };
}

async function lookup(symbol: string): Promise<string> {
  const hit = listings.get(symbol);
  if (hit && hit.expires > Date.now()) return hit.ticker;
  const ticker = resolveUsTicker(symbol, await search(symbol));
  if (listings.size >= 200) listings.delete(listings.keys().next().value!);
  listings.set(symbol, {ticker, expires:Date.now()+6*60*60*1000});
  return ticker;
}

async function fetchUsQuote(symbol: string): Promise<UsQuote> {
  if (active >= 2) await new Promise<void>(resolve => waiters.push(resolve));
  else active++;
  try {
    const ticker = await lookup(symbol);
    return await new Promise<UsQuote>((resolve,reject) => {
      const socket = new WebSocket('wss://data.tradingview.com/socket.io/websocket?from=chart%2F&type=chart', {origin:'https://www.tradingview.com',handshakeTimeout:10_000,maxPayload:2*1024*1024});
      const session = 'qs_' + randomBytes(6).toString('hex');
      let buffer = Buffer.alloc(0), done = false; const fields: Fields = {};
      const timer = setTimeout(() => finish(new Error('US quote timed out')),12_000);
      function finish(error?: Error, value?: UsQuote) { if(done)return; done=true; clearTimeout(timer); socket.close(); if(error)reject(error); else resolve(value!); }
      const send = (method:string, params:unknown[]) => { const s=JSON.stringify({m:method,p:params}); socket.send(`~m~${Buffer.byteLength(s)}~m~${s}`); };
      socket.on('open',() => {
        send('set_auth_token',['unauthorized_user_token']); send('quote_create_session',[session]);
        send('quote_set_fields',[session,'pro_name','lp','lp_time','ch','chp','open_price','high_price','low_price','prev_close_price','volume','currency_code','description','source2']);
        send('quote_add_symbols',[session,ticker]);
      });
      socket.on('message',data => {
        try {
          const bytes=Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          buffer=Buffer.concat([buffer,bytes]); if(buffer.length>2*1024*1024)throw new Error('Oversized quote response');
          const parsed=parseFrames(buffer); buffer=Buffer.from(parsed.rest);
          for(const text of parsed.messages) {
            if(/^~h~\d+$/.test(text)) { socket.send(`~m~${Buffer.byteLength(text)}~m~${text}`); continue; }
            let msg:{m?:string;p?:unknown[]}; try {msg=JSON.parse(text)} catch {continue}
            const p=msg.p ?? []; if(p[0]!==session)continue;
            if(['critical_error','protocol_error'].includes(msg.m ?? '')) throw new Error('US quote rejected');
            if(msg.m==='qsd') { const result=p[1] as {n?:string;s?:string;v?:Fields}|undefined; if(result?.n!==ticker)continue; if(result.s==='error')throw new Error('US quote unavailable'); if(result.v && typeof result.v==='object')Object.assign(fields,result.v); }
            if(msg.m==='quote_completed' && p[1]===ticker)finish(undefined,makeUsQuote(symbol,ticker,fields));
          }
        } catch(e) {finish(e instanceof Error ? e : new Error('Invalid US quote response'));}
      });
      socket.on('error',()=>finish(new Error('US quote connection failed')));
      socket.on('close',()=>{if(!done)finish(new Error('US quote closed before completion'));});
    });
  } finally { const next = waiters.shift(); if (next) next(); else active--; }
}

export function usQuote(symbol: string): Promise<UsQuote> {
  const key=symbol.toUpperCase();
  if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(key)) return Promise.reject(new Error('Unsupported US symbol'));
  const existing=pending.get(key); if(existing)return existing;
  const promise=fetchUsQuote(key); pending.set(key,promise);
  promise.then(()=>pending.delete(key),()=>pending.delete(key));
  return promise;
}
