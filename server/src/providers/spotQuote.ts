import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { parseFrames } from './fiveDay.js';
import { metalInstrument, normalizeMetalSymbol } from './metalSymbols.js';
import type { Quote } from './yahoo.js';

type SpotQuote = Quote & { volumeType: 'tick'; delayStatus: 'unknown'; instrumentNote: string };
export type Fields = Record<string, unknown>;
const pending = new Map<string, Promise<SpotQuote>>();

function spotInstrument(symbol: string) {
  const metal = metalInstrument(symbol);
  if (!metal || metal.type !== 'commodity' || metal.volumeType !== 'tick') throw new Error('Unsupported spot metal');
  return metal;
}

export function isSpotMetal(symbol: string): boolean {
  return metalInstrument(symbol)?.type === 'commodity';
}

export function makeSpotQuote(symbol: string, fields: Fields): SpotQuote {
  const metal = spotInstrument(symbol);
  const positive = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
  const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : null;
  const price = positive(fields.lp);
  const time = positive(fields.lp_time);
  if (fields.pro_name !== metal.ticker || !price || !time || !Number.isSafeInteger(time)) throw new Error('Invalid spot metal quote');
  const volume = finite(fields.volume);
  return {
    symbol: normalizeMetalSymbol(symbol), name: metal.name, price, time,
    change: finite(fields.ch), changePercent: finite(fields.chp),
    open: positive(fields.open_price), high: positive(fields.high_price), low: positive(fields.low_price),
    previousClose: positive(fields.prev_close_price), bid: positive(fields.bid), ask: positive(fields.ask),
    volume: volume !== null && volume >= 0 ? volume : null,
    avgVolume: null, marketCap: null, pe: null, eps: null, dividendYield: null,
    week52High: null, week52Low: null, beta: null, sharesOutstanding: null,
    currency: 'USD', exchange: 'OANDA', marketState: null, source: 'TradingView / OANDA',
    volumeType: 'tick', delayStatus: 'unknown', instrumentNote: 'OANDA spot CFD; USD per troy ounce; volume is tick count',
  };
}

/** Anonymous TradingView snapshot, shared by explicit metal mappings. */
export function fetchMetalQuoteFields(ticker: string): Promise<Fields> {
  return new Promise<Fields>((resolve, reject) => {
    const socket = new WebSocket('wss://data.tradingview.com/socket.io/websocket?from=chart%2F&type=chart', { origin:'https://www.tradingview.com', handshakeTimeout:10_000, maxPayload:2 * 1024 * 1024 });
    const session = 'qs_' + randomBytes(6).toString('hex');
    let buffer = Buffer.alloc(0); let done = false; const fields: Fields = {};
    const timer = setTimeout(() => finish(new Error('Spot quote timed out')), 12_000);
    function finish(error?: Error, quote?: Fields) {
      if (done) return;
      done = true; clearTimeout(timer); socket.close();
      if (error) reject(error); else resolve(quote!);
    }
    const send = (method: string, params: unknown[]) => {
      const message = JSON.stringify({m:method,p:params});
      socket.send(`~m~${Buffer.byteLength(message)}~m~${message}`);
    };
    socket.on('open', () => {
      send('set_auth_token',['unauthorized_user_token']);
      send('quote_create_session',[session]);
      send('quote_set_fields',[session,'pro_name','lp','lp_time','ch','chp','open_price','high_price','low_price','prev_close_price','bid','ask','volume','front_contract','update_mode']);
      send('quote_add_symbols',[session,ticker]);
    });
    socket.on('message', data => {
      try {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        buffer = Buffer.concat([buffer, bytes]);
        if (buffer.length > 2 * 1024 * 1024) throw new Error('Oversized quote response');
        const parsed = parseFrames(buffer); buffer = Buffer.from(parsed.rest);
        for (const text of parsed.messages) {
          if (/^~h~\d+$/.test(text)) { socket.send(`~m~${Buffer.byteLength(text)}~m~${text}`); continue; }
          let message: {m?: string; p?: unknown[]}; try { message = JSON.parse(text); } catch { continue; }
          const p = message.p ?? [];
          if (p[0] !== session) continue;
          if (['critical_error','protocol_error'].includes(message.m ?? '')) throw new Error('Spot quote request rejected');
          if (message.m === 'qsd') {
            const result = p[1] as {n?: string; s?: string; v?: Fields} | undefined;
            if (result?.n !== ticker) continue;
            if (result.s === 'error') throw new Error('Spot quote unavailable');
            if (result.v && typeof result.v === 'object') Object.assign(fields, result.v);
          }
          if (message.m === 'quote_completed' && p[1] === ticker) finish(undefined, fields);
        }
      } catch (error) { finish(error instanceof Error ? error : new Error('Invalid spot quote response')); }
    });
    socket.on('error', () => finish(new Error('Spot quote connection failed')));
    socket.on('close', () => { if (!done) finish(new Error('Spot quote closed before completion')); });
  });
}

/** Concurrent requests for the same spot symbol share a connection. */
export function spotMetalQuote(symbol: string): Promise<SpotQuote> {
  const key = normalizeMetalSymbol(symbol);
  const existing = pending.get(key);
  if (existing) return existing;
  const ticker = spotInstrument(key).ticker;
  const promise = fetchMetalQuoteFields(ticker).then(fields => makeSpotQuote(key, fields));
  pending.set(key, promise);
  promise.then(() => pending.delete(key), () => pending.delete(key));
  return promise;
}
