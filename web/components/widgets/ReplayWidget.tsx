"use client";
import {useEffect,useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiGet,fmt,type Candle} from '../../lib/api';
import {backtest} from '../../lib/research';
import {useWidgetSymbol,type WidgetInstance} from '../../store/terminal';
import ChartWidget from './ChartWidget';

type ReplayState={interval:string;period:string;cursor:number;speed:number;fast:number;slow:number;cash:number;fee:number;slip:number;historyKey:string};
// Keep transient replay position across the workspace portal's maximize/restore remount.
const sessions=new Map<string,ReplayState>();
export default function ReplayWidget({widget}:{widget:WidgetInstance}) {
  const symbol=useWidgetSymbol(widget);
  const saved=sessions.get(widget.id);
  const [interval,setIntervalValue]=useState(saved?.interval??'auto');
  const [loadedKey,setLoadedKey]=useState(saved?.historyKey??'');
  const [period,setPeriod]=useState(saved?.period??'1Y'),[cursor,setCursor]=useState(saved?.cursor??1),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(saved?.speed??2);
  const [fast,setFast]=useState(saved?.fast??10),[slow,setSlow]=useState(saved?.slow??30),[cash,setCash]=useState(saved?.cash??10000),[fee,setFee]=useState(saved?.fee??10),[slip,setSlip]=useState(saved?.slip??5);
  const requestKey=`${symbol}:${period}:${interval}`;
  const {data:bars=[],error,isFetching,refetch}=useQuery({queryKey:['replay-history',symbol,period,interval],queryFn:()=>apiGet<Candle[]>(`/api/history/${encodeURIComponent(symbol)}?range=${period}${interval==='auto'?'':`&interval=${interval}`}`),staleTime:Infinity,refetchOnWindowFocus:false,retry:1});
  const ready=bars.length>0&&loadedKey===requestKey&&!error&&!isFetching;
  useEffect(()=>{if(!bars.length||loadedKey===requestKey)return;setLoadedKey(requestKey);setPlaying(false);setCursor(Math.min(50,Math.max(1,Math.floor(bars.length/2))));},[requestKey,loadedKey,bars]);
  useEffect(()=>{if(!ready)setPlaying(false);},[ready,requestKey]);
  useEffect(()=>{sessions.set(widget.id,{interval,period,cursor,speed,fast,slow,cash,fee,slip,historyKey:loadedKey});},[widget.id,interval,period,cursor,speed,fast,slow,cash,fee,slip,loadedKey]);
  useEffect(()=>{if(!playing||!ready)return;const timer=setInterval(()=>setCursor(n=>{if(n>=bars.length){setPlaying(false);return n;}return n+1;}),1000/speed);return()=>clearInterval(timer);},[playing,ready,speed,bars.length,requestKey]);
  const shown=useMemo(()=>ready?bars.slice(0,cursor):[],[bars,cursor,ready]);
  const simulation=useMemo(()=>{try{return {result:backtest(shown,{fast,slow,cash,feeBps:fee,slippageBps:slip}),error:null};}catch(e){return {result:null,error:(e as Error).message};}},[shown,fast,slow,cash,fee,slip]);
  const result=simulation.result;
  return <div className="flex flex-col h-full min-h-0">
    <div className="p-2 dim">Historical replay / simulation only. Other quote widgets remain live. Signals use closed bars; fills use the next open. Long-only, no leverage or contract multipliers.</div>
    <div className="flex flex-wrap gap-2 p-1 items-center">
      <label>Candle interval <select aria-label="Replay candle interval" value={interval} onChange={e=>{setPlaying(false);setCursor(1);setIntervalValue(e.target.value);setPeriod(e.target.value==='auto'?'1Y':'1M');}}><option value="auto">Automatic</option><option value="15m">15 minutes</option><option value="1h">1 hour</option><option value="4h">4 hours</option></select></label>
      <label>History <select aria-label="Replay period" value={period} onChange={e=>{setPlaying(false);setCursor(1);setPeriod(e.target.value);}}>{(interval==='auto'?['6M','1Y','5Y','MAX']:['5D','1M']).map(r=><option key={r}>{r}</option>)}</select></label>
      <button className="term-btn" disabled={!ready||cursor>=bars.length} onClick={()=>setPlaying(!playing)}>{playing?'Pause replay':'Play replay'}</button>
      <button className="term-btn" disabled={!ready} onClick={()=>{setPlaying(false);setCursor(n=>Math.min(bars.length,n+1));}}>Next candle</button>
      <button className="term-btn" disabled={!ready} onClick={()=>{setPlaying(false);setCursor(1);}}>Reset replay</button>
      <label>Speed <select aria-label="Replay speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[1,2,5,10].map(n=><option key={n}>{n}</option>)}</select></label>
      <input aria-label="Replay position" type="range" disabled={!ready} min={1} max={Math.max(1,bars.length)} value={Math.min(cursor,Math.max(1,bars.length))} onChange={e=>{setPlaying(false);setCursor(Number(e.target.value));}}/>
      <span data-testid="replay-counter">{ready?Math.min(cursor,bars.length):0} / {ready?bars.length:0} candles</span>
    </div>
    <div className="flex flex-wrap gap-2 p-1">{([['Fast SMA',fast,setFast],['Slow SMA',slow,setSlow],['Initial cash',cash,setCash],['Fee bps',fee,setFee],['Slippage bps',slip,setSlip]] as const).map(([label,value,set])=><label key={label}>{label} <input className="w-20" aria-label={label} type="number" value={value} onChange={e=>set(Number(e.target.value))}/></label>)}</div>
    {interval!=='auto'&&<div className="p-1 dim">Closed {interval} candles only. Intraday history is limited to 5 calendar days or 31 days. Exchange sessions can create gaps and shorter final bars. Four-hour session-end bars are conservatively withheld until four hours after their open.</div>}
    {isFetching&&<div role="status" className="p-2 dim">Loading replay history…</div>}
    {error&&<div role="alert" className="down p-2">{(error as Error).message} <button className="term-btn" onClick={()=>{setPlaying(false);setCursor(1);setLoadedKey('');void refetch();}}>Retry replay history</button></div>}
    {simulation.error&&<div role="alert" className="down p-2">{simulation.error}</div>}
    {result&&ready&&<div className="p-2" data-testid="strategy-result">Simulation equity {fmt(result.value)} · Return {fmt(result.returnPercent)}% · Max drawdown {fmt(result.maxDrawdownPercent)}% · Fees {fmt(result.fees)} · Trades {result.trades.length} · Buy & hold {fmt(result.benchmarkPercent)}%{result.openUnits>0?' · Open position marked to last shown close':''}{shown.length<=slow?' · More closed candles required for signals':''}</div>}
    <div className="min-h-[320px] flex-1"><ChartWidget widget={widget} candlesOverride={shown} replayMode replayTotalCandles={bars.length}/></div>
    <details className="p-2"><summary>Simulated fills</summary><table className="data-table"><thead><tr><th>Time</th><th>Side</th><th>Price</th><th>Quantity</th><th>Fee</th></tr></thead><tbody>{result?.trades.map((t,i)=><tr key={i}><td>{new Date(t.time*1000).toLocaleString()}</td><td>{t.side}</td><td>{fmt(t.price,4)}</td><td>{fmt(t.quantity,4)}</td><td>{fmt(t.fee)}</td></tr>)}</tbody></table></details>
  </div>;
}
