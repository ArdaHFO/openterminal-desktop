// Live native replay data, no future context. Opt-in isolated Yahoo/Nasdaq outage audit.
import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {replayIndicatorSeries} from './replay-indicator-series';
async function main(){
 const out=resolve('outputs/replay-indicators'),api='http://127.0.0.1:4118';await mkdir(resolve(out,'datasets'),{recursive:true});const results:any[]=[];
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}),hour=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'});
 for(const symbol of ['XAUUSD','XAGUSD','GC=F','SI=F'])for(const interval of ['15m','1h','4h'])for(const range of ['5D','1M']){
  const id=symbol.replace('=','_')+'-'+interval+'-'+range;
  try{
   const response=await fetch(`${api}/api/history/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,{signal:AbortSignal.timeout(65000)});if(!response.ok)throw Error(`${response.status} ${await response.text()}`);
   const bars=await response.json() as any[],fetchedAt=Date.now()/1000,seconds=({'15m':900,'1h':3600,'4h':14400} as any)[interval];
   if(!Array.isArray(bars)||bars.length<2)throw Error('Missing replay bars');
   const feed=symbol.includes('=')?(symbol==='GC=F'?'COMEX:GC1!':'COMEX:SI1!'):'OANDA:'+symbol;
   if(bars.some((c,i)=>!c.dataSource?.includes(feed)||c.timeframe!==interval||c.time+seconds>fetchedAt||i&&c.time-bars[i-1].time<seconds))throw Error('Wrong source, open bars, overlapping bars or resolution');
   const anchor=bars[0].vwapSessionStart;
   const session=(c:any)=>{const d=new Date(c.time*1000),key=day.format(d);return Number(hour.format(d))>=anchor?new Date(Date.parse(key+'T00:00:00Z')+86400000).toISOString().slice(0,10):key;};
   const boundaries=bars.flatMap((c,i)=>i&&session(c)!==session(bars[i-1])?[i]:[]),midnights=bars.flatMap((c,i)=>i&&day.format(new Date(c.time*1000))!==day.format(new Date(bars[i-1].time*1000))&&session(c)===session(bars[i-1])?[i]:[]);
   const positions=[...new Set([1,14,15,19,20,21,25,26,27,33,34,35,49,50,51,199,200,201,Math.min(50,Math.floor(bars.length/2)),bars.length,...boundaries.flatMap(i=>[i,i+1]),...midnights.flatMap(i=>[i,i+1])].filter(n=>n>0&&n<=bars.length))].sort((a,b)=>a-b);
   const actual=replayIndicatorSeries(bars);
   const prefixes=positions.map(position=>{
    const prefix=replayIndicatorSeries(bars.slice(0,position)),end=bars[position-1].time;
    for(const k of Object.keys(actual) as (keyof typeof actual)[])if(JSON.stringify(prefix[k])!==JSON.stringify(actual[k].filter(p=>p.time<=end)))throw Error(`${k} used future replay data`);
    return {position,last:Object.fromEntries(Object.entries(prefix).map(([k,pts])=>[k,pts.at(-1)?.time===end?pts.at(-1)!.value:null]))};
   });
   await writeFile(resolve(out,'datasets',id+'.json'),JSON.stringify({id,symbol,interval,range,fetchedAt,seconds,bars,actual,prefixes,boundaries,midnights},null,2));
   results.push({id,status:'passed',bars:bars.length,points:Object.values(actual).reduce((n,p)=>n+p.length,0),prefixes:prefixes.length,source:bars[0].dataSource,ready:Object.fromEntries(Object.entries(actual).map(([k,p])=>[k,p.at(-1)?.time===bars.at(-1).time]))});
  }catch(e){results.push({id,status:'failed',error:String(e)});}
  await writeFile(resolve(out,'collection.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
 }
 const probe=await fetch(api+'/api/history/AAPL?range=6M&warmup=199');if(!probe.ok)throw Error('Outage probe failed');
 const status:any=await (await fetch(api+'/api/status')).json(),stats=Object.fromEntries(status.providers.map((p:any)=>[p.name,p]));if(!stats['yahoo-chart-context']?.failed||!stats['nasdaq-chart-context']?.failed)throw Error('Outage not verified');
 await writeFile(resolve(out,'outage-proof.json'),JSON.stringify(status,null,2));if(results.some(r=>r.status==='failed'))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
