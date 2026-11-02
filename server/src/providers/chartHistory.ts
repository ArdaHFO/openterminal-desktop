import type {Candle} from './yahoo.js';
import * as yahoo from './yahoo.js';
import * as nasdaq from './nasdaq.js';
import * as fred from './fred.js';
import {CRYPTO_SYMBOLS} from './binance.js';
import {metalInstrument,selectRange,tradingViewHistory,type HistoryRange,type SourcedCandle} from './fiveDay.js';
import {withFallback} from './registry.js';
import {rangeStart} from '../ranges.js';
import {metalVwapMetadata} from './metalSymbols.js';
export type ChartHistory={candles:SourcedCandle[];context:SourcedCandle[];requestedWarmup:number};
export function chartResolution(symbol:string,range:HistoryRange):SourcedCandle['timeframe']{
 if(CRYPTO_SYMBOLS.has(symbol))return ({'1D':'5m','5D':'15m','1M':'1h','6M':'6h',YTD:'1d','1Y':'1d','5Y':'1w',MAX:'1mo'} as const)[range];
 if(metalInstrument(symbol)||symbol==='^VIX'||symbol==='VIX')return ({'1D':'5m','5D':'15m','1M':'1h','6M':'1d',YTD:'1d','1Y':'1d','5Y':'1w',MAX:'1mo'} as const)[range];
 return range==='1D'?'5m':range==='5D'?'15m':'1d';
}
export function splitChartHistory(rows:SourcedCandle[],symbol:string,range:HistoryRange,warmup:number,now=new Date()):ChartHistory{
 const valid=new Map<number,SourcedCandle>();
 for(const r of rows){if(!Number.isSafeInteger(r.time)||r.time>now.getTime()/1000||!Number.isFinite(r.close))continue;
  if(!r.priceOnly&&(![r.open,r.high,r.low].every(Number.isFinite)||r.high<Math.max(r.open,r.close,r.low)||r.low>Math.min(r.open,r.close)))continue;
  if(r.volume!==null&&(!Number.isFinite(r.volume)||r.volume<0))continue;
  valid.set(r.time,r);
 }
 const all=[...valid.values()].sort((a,b)=>a.time-b.time);const crypto=CRYPTO_SYMBOLS.has(symbol);
 const visible=crypto?(range==='MAX'?all:all.filter(c=>c.time>=rangeStart(range,now).getTime()/1000)):selectRange(all,range,now,metalInstrument(symbol)?.sessionStart) as SourcedCandle[];
 if(!visible.length)throw new Error('No chart candles in the requested display range');
 const first=visible[0].time;return {candles:visible,context:all.filter(c=>c.time<first).slice(-warmup),requestedWarmup:warmup};
}
async function cryptoHistory(symbol:string,range:HistoryRange,warmup:number):Promise<SourcedCandle[]>{
 const timeframe=chartResolution(symbol,range);const interval=timeframe==='1mo'?'1M':timeframe;
 const counts:Record<HistoryRange,number>={'1D':288,'5D':480,'1M':744,'6M':732,YTD:366,'1Y':366,'5Y':262,MAX:1000};
 const count=Math.min(2000,counts[range]+warmup+2);let end=Date.now();const rows:SourcedCandle[]=[];
 for(let page=0;rows.length<count&&page<2;page++){
  const limit=Math.min(1000,count-rows.length);const query=new URLSearchParams({symbol:symbol+'USDT',interval,limit:String(limit),endTime:String(end)});
  const res=await fetch('https://api.binance.com/api/v3/klines?'+query,{signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error(`Binance chart ${res.status}`);
  const batch:any=await res.json();if(!Array.isArray(batch))throw new Error('Invalid crypto chart data');if(!batch.length)break;
  rows.push(...batch.map((r:any[])=>({time:Number(r[0])/1000,open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:r[5]==null?null:Number(r[5]),dataSource:`Binance (${symbol}/USDT)`,timeframe,delayStatus:'unknown' as const,sessionLabel:'24-hour market'})));
  const next=Number(batch[0]?.[0])-1;if(!Number.isFinite(next)||next>=end)throw new Error('Crypto chart pagination did not advance');end=next;if(batch.length<limit)break;
 }return rows;
}
export async function chartHistory(symbol:string,range:HistoryRange,warmup:number):Promise<ChartHistory>{
 if(!Number.isInteger(warmup)||warmup<1||warmup>499)throw new Error('Invalid chart warm-up');
 const timeframe=chartResolution(symbol,range);const metal=metalInstrument(symbol),index=symbol==='^VIX'||symbol==='VIX';
 const result=(rows:SourcedCandle[])=>splitChartHistory(rows,symbol,range,warmup);
 const tv=async()=>result(await tradingViewHistory(symbol,range,undefined,{warmup,resolution:timeframe}));
 if(CRYPTO_SYMBOLS.has(symbol))return result(await cryptoHistory(symbol,range,warmup));
 if(metal)return withFallback([['tradingview-chart-context',tv],...(metal.type==='futures'?[['yahoo-chart-context',async()=>{
  const interval=({'5m':'5m','15m':'15m','1h':'1h','4h':'1h','6h':'1h','1d':'1d','1w':'1wk','1mo':'1mo'} as const)[timeframe];
  const extent=timeframe==='5m'||timeframe==='15m'?'1mo':timeframe==='1h'?'1y':'max';
  const rows=await yahoo.history(symbol,extent,interval);return result(rows.map(c=>({...c,dataSource:`Yahoo Finance (${symbol})`,timeframe,delayStatus:'unknown',sessionLabel:'overnight session',...metalVwapMetadata(metal)})));
 }] as [string,()=>Promise<ChartHistory>]]:[])]);
 if(index)return withFallback([['tradingview-chart-context',tv],...(timeframe==='1d'?[['fred-chart-context',async()=>{
  const points=await fred.series('VIXCLS',20000);return result(points.map(p=>({time:Date.parse(p.date+'T00:00:00Z')/1000,open:NaN,high:NaN,low:NaN,close:p.value,volume:null,priceOnly:true,dataSource:'FRED daily close',timeframe:'1d',delayStatus:'unknown',vwapUnavailable:true,volumeUnavailable:true,sessionLabel:'daily close'})));
 }] as [string,()=>Promise<ChartHistory>]]:[])]);
 const attempts:Array<[string,()=>Promise<ChartHistory>]>=[];
 if(timeframe==='1d')attempts.push(['nasdaq-chart-context',async()=>result((await nasdaq.history(symbol,range==='MAX'||range==='5Y'?'MAX':'5Y')).map(c=>({...c,dataSource:`Nasdaq (${symbol})`,timeframe,delayStatus:'unknown',sessionLabel:'regular session'})))]);
 attempts.push(['yahoo-chart-context',async()=>{
  const extent=timeframe==='5m'||timeframe==='15m'?'1mo':range==='MAX'?'max':range==='5Y'?'10y':'5y';
  return result((await yahoo.history(symbol,extent,timeframe)).map(c=>({...c,dataSource:`Yahoo Finance (${symbol})`,timeframe,delayStatus:'unknown',sessionLabel:'regular session'})));
 }],['tradingview-chart-context',tv]);
 return withFallback(attempts);
}
