// Opt-in live audit. Requires an isolated API with Yahoo/Nasdaq HTTP503 injection.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sma,ema,rsi,bollinger,macd,vwap} from '../../web/lib/indicators';
async function main(){
const out=resolve(process.env.AUDIT_DIR??'outputs/indicator-outage');
const base=process.env.AUDIT_API??'http://127.0.0.1:4114';
const symbols=process.env.AUDIT_SYMBOLS?.split(',')??['AAPL','MSFT','NVDA','XAUUSD','XAGUSD','GC=F','SI=F'];
const ranges=process.env.AUDIT_RANGES?.split(',')??['1D','5D','1M','6M','YTD','1Y','5Y','MAX'];
await mkdir(resolve(out,'datasets'),{recursive:true});
const results:any[]=[];
for(const symbol of symbols)for(const range of ranges){
 const id=symbol.replace('=','_')+'-'+range;
 try{
  const response=await fetch(`${base}/api/history/${encodeURIComponent(symbol)}?range=${range}&warmup=199`,{signal:AbortSignal.timeout(65000)});
  if(!response.ok)throw new Error(`${response.status} ${await response.text()}`);
  const data=await response.json() as any;
  const visible=data.candles,all=[...data.context,...visible];
  if(!visible.length||new Set(all.map(c=>c.dataSource+'|'+c.timeframe)).size!==1)throw new Error('Invalid or mixed history');
  if(!all.every((c,i)=>Number.isFinite(c.close)&&(!i||c.time>all[i-1].time)))throw new Error('Invalid candle sequence');
  if(!visible[0].dataSource.startsWith('TradingView'))throw new Error('Outage was bypassed');
  const times=new Set(visible.map(c=>c.time));const clip=(p:any[])=>p.filter(p=>times.has(p.time));
  const b=bollinger(all),m=macd(all);
  const eligible=['5m','15m','1h','4h','6h'].includes(visible[0].timeframe)&&!visible[0].vwapUnavailable&&!visible.some(c=>c.priceOnly);
  const series={SMA20:clip(sma(all,20)),SMA50:clip(sma(all,50)),SMA200:clip(sma(all,200)),EMA20:clip(ema(all,20)),RSI:clip(rsi(all)),BOLL_U:clip(b.upper),BOLL_M:clip(b.middle),BOLL_L:clip(b.lower),MACD:clip(m.macd),SIGNAL:clip(m.signal),HIST:clip(m.histogram),VWAP:eligible?clip(vwap(all,'America/New_York',visible[0].vwapSessionStart??0)):[]};
  await writeFile(resolve(out,'datasets',id+'.json'),JSON.stringify({id,symbol,range,data,series,eligible},null,2));
  results.push({id,symbol,range,status:'passed',source:visible[0].dataSource,timeframe:visible[0].timeframe,visible:visible.length,context:data.context.length});
 }catch(e){results.push({id,symbol,range,status:'failed',error:String(e)});}
 await writeFile(resolve(out,'collection.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.at(-1)));
}
await writeFile(resolve(out,'provider-status.json'),JSON.stringify(await (await fetch(base+'/api/status')).json(),null,2));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
