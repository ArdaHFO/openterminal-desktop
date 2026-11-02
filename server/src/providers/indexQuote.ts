import { fetchMetalQuoteFields, type Fields } from './spotQuote.js';
import type { Quote } from './yahoo.js';

type IndexQuote = Quote & { delayStatus:'delayed'|'unknown'; delaySeconds?:number; instrumentNote:string };
let pending:Promise<IndexQuote>|null = null;
export function makeVixQuote(fields: Fields): IndexQuote {
  const positive=(v:unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  const finite=(v:unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const price=positive(fields.lp), time=positive(fields.lp_time);
  if(fields.pro_name !== 'CBOE:VIX' || !price || !time || !Number.isSafeInteger(time)) throw new Error('Invalid VIX quote');
  const match=typeof fields.update_mode === 'string' ? /^delayed_streaming_(\d+)$/.exec(fields.update_mode) : null;
  const n=match ? Number(match[1]) : null;
  const delay=n !== null && n > 0 && n <= 86400 ? n : undefined;
  return {
    symbol:'^VIX',name:'CBOE Volatility Index',price,time,change:finite(fields.ch),changePercent:finite(fields.chp),
    open:positive(fields.open_price),high:positive(fields.high_price),low:positive(fields.low_price),previousClose:positive(fields.prev_close_price),
    bid:null,ask:null,volume:null,avgVolume:null,marketCap:null,pe:null,eps:null,dividendYield:null,week52High:null,week52Low:null,beta:null,sharesOutstanding:null,
    currency:'USD',exchange:'CBOE',marketState:null,source:'TradingView / Cboe',delayStatus:delay ? 'delayed' : 'unknown',...(delay ? {delaySeconds:delay} : {}),
    instrumentNote:'CBOE VIX index; volume unavailable',
  };
}
export function indexQuote(): Promise<IndexQuote> {
  if(pending)return pending;
  const promise=fetchMetalQuoteFields('CBOE:VIX').then(makeVixQuote);
  pending=promise;promise.then(()=>{pending=null},()=>{pending=null});return promise;
}
