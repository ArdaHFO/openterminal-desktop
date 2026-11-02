import type { Candle } from "./api";
export type Point={time:number;value:number};
function checkPeriod(period:number){if(!Number.isInteger(period)||period<1)throw new RangeError('Indicator period must be a positive integer');}
/** Invalid observations break warm-up; they are never compressed into a shorter fake window. */
function segments(candles:Candle[]):Candle[][]{
 const out:Candle[][]=[];let run:Candle[]=[];let last=-Infinity;
 for(const c of candles){if(!Number.isFinite(c.time)||c.time<=last||!Number.isFinite(c.close)){if(run.length)out.push(run);run=[];continue;}last=c.time;run.push(c);}if(run.length)out.push(run);return out;
}
export function sma(candles:Candle[],period:number):Point[]{
 checkPeriod(period);const out:Point[]=[];
 for(const run of segments(candles)){let sum=0;for(let i=0;i<run.length;i++){sum+=run[i].close;if(i>=period)sum-=run[i-period].close;if(i>=period-1)out.push({time:run[i].time,value:sum/period});}}return out;
}
/** SMA seed at the first complete window, then recursive EMA. */
export function ema(candles:Candle[],period:number):Point[]{
 checkPeriod(period);const out:Point[]=[];const k=2/(period+1);
 for(const run of segments(candles)){if(run.length<period)continue;let prev=run.slice(0,period).reduce((s,c)=>s+c.close,0)/period;out.push({time:run[period-1].time,value:prev});for(let i=period;i<run.length;i++){prev+=(run[i].close-prev)*k;out.push({time:run[i].time,value:prev});}}return out;
}
export function vwap(candles:Candle[],timeZone="America/New_York",sessionStart=0):Point[]{
 if(!Number.isInteger(sessionStart)||sessionStart<0||sessionStart>23)throw new RangeError('Invalid VWAP session hour');
 const out:Point[]=[];let pv=0,volume=0,session='',incomplete=false;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 const hour=new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',hourCycle:'h23'});
 for(const c of candles){if(!Number.isFinite(c.time))continue;const date=new Date(c.time*1000);const key=day.format(date);
  const next=sessionStart>0&&Number(hour.format(date))>=sessionStart?new Date(Date.parse(key+'T00:00:00Z')+86400000).toISOString().slice(0,10):key;
  if(next!==session){session=next;pv=0;volume=0;incomplete=false;}
  if(c.volume===null||!Number.isFinite(c.volume)||c.volume<0||![c.high,c.low,c.close].every(Number.isFinite)){incomplete=true;continue;}
  if(incomplete)continue;pv+=(c.high+c.low+c.close)/3*c.volume;volume+=c.volume;if(volume>0)out.push({time:c.time,value:pv/volume});
 }return out;
}
export function rsi(candles:Candle[],period=14):Point[]{
 checkPeriod(period);const out:Point[]=[];
 for(const run of segments(candles)){let gain=0,loss=0;for(let i=1;i<run.length;i++){const d=run[i].close-run[i-1].close,g=Math.max(d,0),l=Math.max(-d,0);if(i<=period){gain+=g/period;loss+=l/period;}else{gain=(gain*(period-1)+g)/period;loss=(loss*(period-1)+l)/period;}if(i>=period)out.push({time:run[i].time,value:loss===0?(gain===0?50:100):100-100/(1+gain/loss)});}}return out;
}
export function macd(candles:Candle[],fast=12,slow=26,signal=9):{macd:Point[];signal:Point[];histogram:Point[]}{
 checkPeriod(fast);checkPeriod(slow);checkPeriod(signal);if(fast>=slow)throw new RangeError('MACD fast period must be shorter than slow period');
 const line:Point[]=[],sig:Point[]=[],histogram:Point[]=[];
 for(const run of segments(candles)){const f=new Map(ema(run,fast).map(p=>[p.time,p.value]));const m=ema(run,slow).map(p=>({time:p.time,value:f.get(p.time)!-p.value}));
  const s=ema(m.map(p=>({time:p.time,open:p.value,high:p.value,low:p.value,close:p.value,volume:null})),signal);const byTime=new Map(m.map(p=>[p.time,p.value]));line.push(...m);sig.push(...s);histogram.push(...s.map(p=>({time:p.time,value:byTime.get(p.time)!-p.value})));
 }return {macd:line,signal:sig,histogram};
}
export function bollinger(candles:Candle[],period=20,mult=2):{upper:Point[];middle:Point[];lower:Point[]}{
 checkPeriod(period);if(!Number.isFinite(mult)||mult<0)throw new RangeError('Invalid Bollinger multiplier');const middle:Point[]=[],upper:Point[]=[],lower:Point[]=[];
 for(const run of segments(candles)){const means=sma(run,period);for(let i=period-1;i<run.length;i++){const mean=means[i-period+1].value;const variance=run.slice(i-period+1,i+1).reduce((sum,c)=>sum+(c.close-mean)**2,0)/period;const sd=Math.sqrt(variance);middle.push({time:run[i].time,value:mean});upper.push({time:run[i].time,value:mean+mult*sd});lower.push({time:run[i].time,value:mean-mult*sd});}}return {upper,middle,lower};
}
