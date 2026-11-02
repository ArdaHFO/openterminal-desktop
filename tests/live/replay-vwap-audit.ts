// Opt-in live replay audit against an isolated fault-injected API.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {vwap} from '../../web/lib/indicators';
async function main(){
 const out=resolve(process.env.REPLAY_AUDIT_DIR??'outputs/replay-vwap');const api=process.env.REPLAY_AUDIT_API??'http://127.0.0.1:4117';
 await mkdir(resolve(out,'datasets'),{recursive:true});const results:any[]=[];
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
 const hour=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'});
 for(const symbol of ['XAUUSD','XAGUSD','GC=F','SI=F'])for(const interval of ['15m','1h','4h'])for(const range of ['5D','1M']){
  const id=symbol.replace('=','_')+'-'+interval+'-'+range;
  try{
   const response=await fetch(`${api}/api/history/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,{signal:AbortSignal.timeout(65000)});
   if(!response.ok)throw Error(`${response.status} ${await response.text()}`);
   const candles=await response.json() as any[];const fetchedAt=Date.now()/1000,seconds=({'15m':900,'1h':3600,'4h':14400} as any)[interval];
   if(!Array.isArray(candles)||candles.length<2)throw Error('Replay needs two real closed bars');
   const first=candles[0],anchor=first.vwapSessionStart;
   const expectedFeed=symbol.includes('=')?(symbol==='GC=F'?'COMEX:GC1!':'COMEX:SI1!'):'OANDA:'+symbol;
   if(!first.dataSource?.includes(expectedFeed)||first.volumeType!==(symbol.includes('=')?'contracts':'tick')||anchor!==(symbol.includes('=')?18:17)||first.vwapUnavailable)throw Error('Incorrect VWAP source metadata');
   if(candles.some((c,i)=>c.timeframe!==interval||c.time+seconds>fetchedAt||i>0&&c.time-candles[i-1].time<seconds))throw Error('Replay contains open, overlapping or incorrectly labelled bars');
   const sessionKey=(c:any)=>{const d=new Date(c.time*1000),key=day.format(d);return Number(hour.format(d))>=anchor?new Date(Date.parse(key+'T00:00:00Z')+86400000).toISOString().slice(0,10):key;};
   const boundaries=candles.flatMap((c,i)=>i&&sessionKey(c)!==sessionKey(candles[i-1])?[i]:[]);
   const midnights=candles.flatMap((c,i)=>i&&day.format(new Date(c.time*1000))!==day.format(new Date(candles[i-1].time*1000))&&sessionKey(c)===sessionKey(candles[i-1])?[i]:[]);
   const positions=[...new Set([1,Math.min(50,Math.max(1,Math.floor(candles.length/2))),Math.min(51,candles.length),candles.length,...boundaries.flatMap(i=>[i,i+1]),...midnights.flatMap(i=>[i,i+1])])].sort((a,b)=>a-b);
   const actual=vwap(candles,'America/New_York',anchor);
   const prefixes=positions.map(position=>{const prefix=vwap(candles.slice(0,position),'America/New_York',anchor),end=candles[position-1].time;const full=actual.filter(p=>p.time<=end);if(JSON.stringify(prefix)!==JSON.stringify(full))throw Error('Indicator used future replay candles');return {position,points:prefix.length,last:prefix.at(-1)?.time===end?prefix.at(-1)!.value:null};});
   await writeFile(resolve(out,'datasets',id+'.json'),JSON.stringify({id,symbol,interval,range,fetchedAt,seconds,candles,actual,prefixes,boundaries,midnights},null,2));
   results.push({id,status:'passed',bars:candles.length,points:actual.length,prefixes:prefixes.length,sessionTransitions:boundaries.length,midnightContinuations:midnights.length,source:first.dataSource,volumeType:first.volumeType});
  }catch(e){results.push({id,status:'failed',error:String(e)});}
  await writeFile(resolve(out,'collection.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
 }
 // A stock probe forces both blocked providers to be attempted, proving the fault injection is active.
 const probe=await fetch(api+'/api/history/AAPL?range=6M&warmup=199');if(!probe.ok)throw Error('Fallback probe failed');
 const status:any=await (await fetch(api+'/api/status')).json();const stats=Object.fromEntries(status.providers.map((p:any)=>[p.name,p]));
 if(!stats['yahoo-chart-context']?.failed||!stats['nasdaq-chart-context']?.failed)throw Error('Yahoo/Nasdaq outage was not verified');
 await writeFile(resolve(out,'outage-proof.json'),JSON.stringify(status,null,2));
 if(results.some(r=>r.status==='failed'))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
