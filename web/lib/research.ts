import type { Candle } from './api';

export type StrategySettings={fast:number;slow:number;cash:number;feeBps:number;slippageBps:number};
export type SimTrade={time:number;side:'BUY'|'SELL';price:number;quantity:number;fee:number};
export function backtest(bars:Candle[], settings:StrategySettings) {
  const {fast,slow,cash:initial,feeBps,slippageBps}=settings;
  if(!Number.isInteger(fast)||!Number.isInteger(slow)||fast<2||slow<=fast||slow>500||!Number.isFinite(initial)||initial<=0||![feeBps,slippageBps].every(x=>Number.isFinite(x)&&x>=0&&x<=1000))throw Error('Use 2 ≤ fast < slow ≤ 500, positive cash, and costs between 0 and 1000 bps.');
  if(bars.some((b,i)=>b.priceOnly||![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||(i>0&&b.time<=bars[i-1].time)))throw Error('Simulation requires ordered OHLC candles.');
  let cash=initial,units=0,peak=initial,maxDrawdown=0;
  const trades:SimTrade[]=[],equity:Array<{time:number;value:number}>=[];
  const avg=(end:number,n:number)=>bars.slice(end-n+1,end+1).reduce((v,b)=>v+b.close,0)/n;
  for(let i=0;i<bars.length;i++) {
    // Signal uses only fully closed previous candles; fill is at the next bar open.
    if(i>slow) {
      const previous=avg(i-2,fast)-avg(i-2,slow), current=avg(i-1,fast)-avg(i-1,slow);
      if(previous<=0&&current>0&&units===0) {
        const price=bars[i].open*(1+slippageBps/10000), quantity=cash/(price*(1+feeBps/10000)),fee=price*quantity*feeBps/10000;
        cash=0;units=quantity;trades.push({time:bars[i].time,side:'BUY',price,quantity,fee});
      } else if(previous>=0&&current<0&&units>0) {
        const price=bars[i].open*(1-slippageBps/10000), fee=price*units*feeBps/10000;
        cash=price*units-fee;trades.push({time:bars[i].time,side:'SELL',price,quantity:units,fee});units=0;
      }
    }
    const value=cash+units*bars[i].close;peak=Math.max(peak,value);maxDrawdown=Math.max(maxDrawdown,(peak-value)/peak);
    equity.push({time:bars[i].time,value});
  }
  const value=equity.at(-1)?.value??initial;
  return {value,returnPercent:(value/initial-1)*100,maxDrawdownPercent:maxDrawdown*100,trades,equity,openUnits:units,fees:trades.reduce((n,t)=>n+t.fee,0),benchmarkPercent:bars.length>1?(bars.at(-1)!.close/bars[0].close-1)*100:0};
}

export function tradingDate(time:number,sessionStart:number) {
  const d=new Date(time*1000);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(d));
  return new Date(Date.parse(date+'T00:00:00Z')+(hour>=sessionStart?86400000:0)).toISOString().slice(0,10);
}
export function derivedMetalHistory(a:Candle[],b:Candle[],operation:'ratio'|'spread',aStart:number,bStart:number):Candle[] {
  const right=new Map(b.map(c=>[tradingDate(c.time,bStart),c]));
  return a.flatMap(c=>{
    const d=right.get(tradingDate(c.time,aStart));
    if(!d||!Number.isFinite(c.close)||!Number.isFinite(d.close)||d.close<=0)return [];
    const value=operation==='ratio'?c.close/d.close:c.close-d.close;
    return [{time:Date.parse(tradingDate(c.time,aStart)+'T00:00:00Z')/1000,open:value,high:value,low:value,close:value,volume:null,priceOnly:true,dataSource:'Derived aligned session closes',timeframe:'1d',volumeUnavailable:true,vwapUnavailable:true}];
  }).sort((a,b)=>a.time-b.time);
}

export type DrawingPoint={time:number;price:number};
export type Drawing={id:string;kind:'horizontal'|'trend'|'measure';points:DrawingPoint[]};
export function validDrawing(d:Drawing):boolean {
  return ['horizontal','trend','measure'].includes(d.kind)&&d.points.length===(d.kind==='horizontal'?1:2)&&d.points.every(p=>Number.isFinite(p.price)&&Number.isSafeInteger(p.time)&&p.time>0)&&(d.kind==='horizontal'||d.points[0].time!==d.points[1].time);
}
