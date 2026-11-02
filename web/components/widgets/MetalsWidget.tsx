"use client";
import {useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiGet,fmtPrice,quoteDelay,type Quote,type Candle} from '../../lib/api';
import {derivedMetalHistory,tradingDate} from '../../lib/research';
import {useTerminal,type WidgetInstance} from '../../store/terminal';
import ChartWidget from './ChartWidget';

const symbols=['XAUUSD','XAGUSD','GC=F','SI=F'];
const OUNCE_GRAMS=31.1034768;
export default function MetalsWidget({widget}:{widget:WidgetInstance}) {
  const setActive=useTerminal(s=>s.setActiveSymbol);
  const [fx,setFx]=useState(''),[mode,setMode]=useState<'ratio'|'gold'|'silver'>('ratio');
  const {data:quotes=[],error}=useQuery({queryKey:['metal-analysis-quotes'],queryFn:()=>apiGet<Quote[]>('/api/quotes?symbols=XAUUSD,XAGUSD,GC%3DF,SI%3DF'),refetchInterval:15000});
  const {data:histories,error:historyError}=useQuery({queryKey:['metal-analysis-history'],queryFn:async()=>{
    const results=await Promise.allSettled(symbols.map(s=>apiGet<Candle[]|{candles:Candle[];context:Candle[]}>(`/api/history/${encodeURIComponent(s)}?range=6M&warmup=499`)));
    if(results.every(r=>r.status==='rejected'))throw Error('All metal histories are unavailable');
    return Object.fromEntries(results.map((r,i)=>{const value=r.status==='fulfilled'?r.value:[];return [symbols[i],Array.isArray(value)?{candles:value,context:[] as Candle[]}:value];}));
  },staleTime:60000,refetchInterval:60000});
  const data=useMemo(()=>{
    if(!histories)return {visible:[] as Candle[],context:[] as Candle[]};
    const [a,b,aStart,bStart]=mode==='ratio'?['XAUUSD','XAGUSD',17,17] as const:mode==='gold'?['GC=F','XAUUSD',18,17] as const:['SI=F','XAGUSD',18,17] as const;
    const x=histories[a],y=histories[b];
    const all=derivedMetalHistory([...x.context,...x.candles],[...y.context,...y.candles],mode==='ratio'?'ratio':'spread',aStart,bStart);
    const from=x.candles.length&&y.candles.length?Math.max(Date.parse(tradingDate(x.candles[0].time,aStart)+'T00:00:00Z'),Date.parse(tradingDate(y.candles[0].time,bStart)+'T00:00:00Z'))/1000:Infinity;
    return {visible:all.filter(c=>c.time>=from),context:all.filter(c=>c.time<from)};
  },[histories,mode]);
  const q=(s:string)=>quotes.find(q=>q.symbol===s);
  const snapshot=(a:string,b:string,ratio=false)=>{
    const x=q(a),y=q(b);
    if(!x?.price||!y?.price||!x.time||!y.time)return 'Unavailable';
    const gap=Math.abs(x.time-y.time);
    if(gap>120)return `Not aligned (${Math.round(gap/60)} min between snapshots); see aligned session-close chart`;
    return fmtPrice(ratio?x.price/y.price:x.price-y.price)+(ratio?' ratio':' USD/troy oz')+' · indicative snapshots';
  };
  const fxRate=Number(fx),validFx=fx.trim()!==''&&Number.isFinite(fxRate)&&fxRate>0;
  return <div className="flex flex-col h-full min-h-0">
    <div className="p-2 dim">Spot = OANDA CFD, tick volume. Futures = Yahoo contract or COMEX continuous proxy. Prices are USD per troy ounce. Session-close calculations align New York trading dates; contract rollovers affect spreads.</div>
    {error&&<div role="alert" className="down p-2">{(error as Error).message}</div>}
    <table className="data-table"><thead><tr><th>Instrument</th><th>USD/oz</th><th>USD/gram</th><th>Source / time / delay</th></tr></thead><tbody>{symbols.map(s=>{const p=q(s);return <tr key={s} onClick={()=>setActive(s)}><td>{s}</td><td>{fmtPrice(p?.price)}</td><td>{fmtPrice(p?.price?p.price/OUNCE_GRAMS:null)}</td><td className="!whitespace-normal">{p?`${p.source} · ${p.time?new Date(p.time*1000).toLocaleString():'time unknown'} · ${quoteDelay(p)}`:'Unavailable'}</td></tr>;})}</tbody></table>
    <div className="p-2" data-testid="metal-snapshots">Gold/silver {snapshot('XAUUSD','XAGUSD',true)} · Gold futures − spot {snapshot('GC=F','XAUUSD')} · Silver futures − spot {snapshot('SI=F','XAGUSD')}</div>
    <label className="p-2">Manual USD/TRY <input aria-label="Manual USD TRY" type="number" min="0" step="any" value={fx} onChange={e=>setFx(e.target.value)}/> <span className="dim">User-entered FX; calculated TRY/gram, not a quoted retail price.</span></label>
    {fx!==''&&!validFx&&<div role="alert" className="down p-1">Enter a positive exchange rate.</div>}
    {validFx&&<div className="p-2" data-testid="metal-conversions">Gold {fmtPrice(q('XAUUSD')?.price?q('XAUUSD')!.price!*fxRate/OUNCE_GRAMS:null)} TRY/g · Silver {fmtPrice(q('XAGUSD')?.price?q('XAGUSD')!.price!*fxRate/OUNCE_GRAMS:null)} TRY/g (manual FX {fxRate})</div>}
    <label className="p-1">Aligned daily closes, last six months <select aria-label="Metal comparison" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="ratio">Gold / silver ratio</option><option value="gold">Gold futures − spot (USD/oz)</option><option value="silver">Silver futures − spot (USD/oz)</option></select></label>
    {historyError&&<div role="alert" className="down p-2">History unavailable: {(historyError as Error).message}</div>}
    {histories&&symbols.some(s=>!histories[s]?.candles.length)&&<div className="dim p-2">Some metal histories are unavailable. Available pairs remain usable.</div>}
    {!data.visible.length&&<div className="dim p-2">No matched session closes available yet.</div>}
    <div className="flex-1 min-h-[300px]"><ChartWidget widget={{...widget,id:widget.id+'-'+mode,symbol:'METAL-'+mode.toUpperCase(),linked:false}} candlesOverride={data.visible} indicatorContextOverride={data.context}/></div>
  </div>;
}
