import { tradingViewHistory, validateBars, type SourcedCandle } from './fiveDay.js';
import { history as yahooHistory } from './yahoo.js';
import { CRYPTO_SYMBOLS } from './binance.js';
import { metalInstrument } from './metalSymbols.js';
import { withFallback } from './registry.js';
import { rangeStart } from '../ranges.js';

export const REPLAY_SECONDS = {'15m':900,'1h':3600,'4h':14400} as const;
export type ReplayInterval=keyof typeof REPLAY_SECONDS;
export function validReplayRequest(range:string,interval:string):boolean {
  return ['5D','1M'].includes(range)&&Object.hasOwn(REPLAY_SECONDS,interval);
}
/** Validate real OHLC, sort/dedupe, reject an incorrectly labelled resolution and hide live candles.
 * Four-hour exchange session-end bars are conservatively withheld until four hours after their open.
 */
export function closedReplayBars(rows:SourcedCandle[],range:string,interval:ReplayInterval,now=Date.now()/1000):SourcedCandle[] {
  const seconds=REPLAY_SECONDS[interval],start=rangeStart(range,new Date(now*1000)).getTime()/1000;
  const valid=validateBars(rows.map(c=>[c.time,c.open,c.high,c.low,c.close,c.volume]),rows.every(c=>c.volume===null),true);
  const metadata=new Map(rows.map(c=>[c.time,c]));
  const bars=valid.filter(c=>c.time>=start&&c.time+seconds<=now).map(c=>({...metadata.get(c.time)!,...c}));
  if(bars.length<2||bars.some(c=>c.timeframe!==interval||c.priceOnly))throw new Error('No verified closed candles at the requested replay interval');
  // Daily/hourly data must never silently masquerade as a finer intraday series.
  if(bars.some((c,i)=>i>0&&c.time-bars[i-1].time<seconds))throw new Error('Overlapping replay candles');
  if(!bars.some((c,i)=>i>0&&c.time-bars[i-1].time===seconds))throw new Error('Requested candle spacing was not confirmed');
  return bars;
}

export async function binanceReplay(symbol:string,range:string,interval:ReplayInterval,now=Date.now()/1000):Promise<SourcedCandle[]> {
  const end=Math.floor(now*1000),start=rangeStart(range,new Date(end)).getTime();
  const rows:unknown[][]=[];let cursor=Math.floor(start);
  // A month of 15-minute crypto candles needs four pages; hard cap prevents an unbounded fan-out.
  for(let page=0;page<4&&cursor<end;page++) {
    const params=new URLSearchParams({symbol:symbol+'USDT',interval,startTime:String(cursor),endTime:String(end),limit:'1000'});
    const res=await fetch('https://api.binance.com/api/v3/klines?'+params,{signal:AbortSignal.timeout(12000)});
    if(!res.ok)throw new Error(`binance replay ${res.status}`);
    const batch:unknown=await res.json();if(!Array.isArray(batch))throw new Error('Invalid Binance replay response');
    if(!batch.length)break;
    for(const row of batch)if(Array.isArray(row))rows.push(row);
    const last=Number(batch.at(-1)?.[0]);if(!Number.isFinite(last)||last<cursor)throw new Error('Binance replay pagination did not advance');
    cursor=last+REPLAY_SECONDS[interval]*1000;
    if(batch.length<1000)break;
  }
  const valid=validateBars(rows.map(r=>[Number(r[0])/1000,...r.slice(1,6).map(Number)]));
  return closedReplayBars(valid.map(c=>({...c,dataSource:`Binance (${symbol}/USDT)`,timeframe:interval,delayStatus:'unknown',sessionLabel:'24-hour market'})),range,interval,now);
}
export async function replayHistory(symbol:string,range:string,requested:string):Promise<SourcedCandle[]> {
  if(!validReplayRequest(range,requested))throw new Error('Unsupported replay request');
  const interval=requested as ReplayInterval;
  if(CRYPTO_SYMBOLS.has(symbol))return binanceReplay(symbol,range,interval);
  const metal=metalInstrument(symbol);
  const tv=async()=>closedReplayBars(await tradingViewHistory(symbol,range as '5D'|'1M',interval),range,interval);
  // Yahoo has no native 4h endpoint. Use genuine exchange-aggregated 240-minute bars instead of inventing bars across sessions.
  if(interval==='4h'||metal||symbol==='^VIX')return withFallback([['tradingview-replay',tv]]);
  return withFallback([
    ['yahoo-replay',async()=>{
      const rows=await yahooHistory(symbol,range==='5D'?'5d':'1mo',interval);
      return closedReplayBars(rows.map(c=>({...c,dataSource:`Yahoo Finance (${symbol})`,timeframe:interval,delayStatus:'unknown',sessionLabel:'regular session'})),range,interval);
    }],
    ['tradingview-replay',tv],
  ]);
}
