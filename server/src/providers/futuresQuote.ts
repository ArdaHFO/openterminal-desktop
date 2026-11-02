import { metalInstrument, normalizeMetalSymbol } from './metalSymbols.js';
import { fetchMetalQuoteFields, type Fields } from './spotQuote.js';
import type { Quote } from './yahoo.js';

type FuturesQuote = Quote & { volumeType:'contracts'; delayStatus:'unknown'|'delayed'; delaySeconds?:number; instrumentNote:string };
const pending = new Map<string, Promise<FuturesQuote>>();

/** Yahoo snapshots lack separate bid/ask timestamps and a reliable delay field here. */
export function labelYahooFuturesQuote(quote: Quote): FuturesQuote {
  if (!isMetalFutures(quote.symbol) || !['yahoo','yahoo-chart'].includes(quote.source)) throw new Error('Not a Yahoo metal future');
  return {
    ...quote, bid:null, ask:null, volumeType:'contracts', delayStatus:'unknown',
    marketCap:null, pe:null, eps:null, dividendYield:null, beta:null, sharesOutstanding:null,
    instrumentNote:`Yahoo futures contract (${quote.name ?? quote.symbol}); USD per troy ounce; volume in contracts; may differ from the chart's continuous proxy`,
  };
}

export function isMetalFutures(symbol: string): boolean {
  return metalInstrument(symbol)?.type === 'futures';
}

export function makeFuturesQuote(symbol: string, fields: Fields): FuturesQuote {
  const key = normalizeMetalSymbol(symbol);
  const metal = metalInstrument(key);
  if (!isMetalFutures(key) || !metal || metal.type !== 'futures') throw new Error('Unsupported metal future');
  const positive = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
  const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x) ? x : null;
  const price=positive(fields.lp), time=positive(fields.lp_time);
  if (fields.pro_name !== metal.ticker || !price || !time || !Number.isSafeInteger(time)) throw new Error('Invalid metal futures quote');
  const root = key === 'SI=F' ? 'SI' : 'GC';
  const front = typeof fields.front_contract === 'string' && new RegExp(`^${root}[FGHJKMNQUVXZ]\\d{4}$`).test(fields.front_contract) ? fields.front_contract : null;
  const match = typeof fields.update_mode === 'string' ? /^delayed_streaming_(\d+)$/.exec(fields.update_mode) : null;
  const delay = match ? Number(match[1]) : null;
  const delaySeconds = delay !== null && delay > 0 && delay <= 86400 ? delay : undefined;
  const volume = finite(fields.volume);
  return {
    symbol:key, name:metal.name, price, time,
    change:finite(fields.ch),changePercent:finite(fields.chp),open:positive(fields.open_price),high:positive(fields.high_price),low:positive(fields.low_price),previousClose:positive(fields.prev_close_price),
    // Separate bid/ask timestamps are not supplied, so do not mix them with a delayed last trade.
    bid:null,ask:null,volume:volume !== null && volume >= 0 ? volume : null,
    avgVolume:null,marketCap:null,pe:null,eps:null,dividendYield:null,week52High:null,week52Low:null,beta:null,sharesOutstanding:null,
    currency:'USD',exchange:'COMEX',marketState:null,source:'TradingView / COMEX',
    volumeType:'contracts',
    delayStatus:delaySeconds ? 'delayed' : 'unknown', ...(delaySeconds ? {delaySeconds} : {}),
    instrumentNote:`${metal.ticker} continuous front-month proxy (${front ?? 'front contract unavailable'}); USD per troy ounce; volume in contracts; rollover may differ from Yahoo`,
  };
}

export function metalFuturesQuote(symbol: string): Promise<FuturesQuote> {
  const key=normalizeMetalSymbol(symbol);
  if (!isMetalFutures(key)) return Promise.reject(new Error('Unsupported metal future'));
  const existing=pending.get(key); if(existing)return existing;
  const ticker=metalInstrument(key)!.ticker;
  const promise=fetchMetalQuoteFields(ticker).then(fields=>makeFuturesQuote(key,fields));
  pending.set(key,promise); promise.then(()=>pending.delete(key),()=>pending.delete(key));
  return promise;
}
