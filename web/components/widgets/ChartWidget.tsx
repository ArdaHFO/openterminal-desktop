"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  AreaSeries,
  BarSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { apiGet, fmt, fmtPrice, fmtBig, type Candle } from "../../lib/api";
import { sma, ema, vwap, rsi, macd, bollinger, type Point } from "../../lib/indicators";
import { useChartTools, defaultSettings } from "../../store/chartTools";
import { validDrawing, type DrawingPoint, type Drawing } from "../../lib/research";
import { useWidgetSymbol, type WidgetInstance } from "../../store/terminal";

const RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"] as const;
const CHART_TYPES = ["candles", "bars", "line", "area"] as const;
const INDICATORS = ["SMA20", "SMA50", "SMA200", "EMA20", "VWAP", "BOLL", "RSI", "MACD"] as const;

type Range = (typeof RANGES)[number];
type ChartType = (typeof CHART_TYPES)[number];
type Indicator = (typeof INDICATORS)[number];

const ts = (t: number) => t as UTCTimestamp;
const toMap = (pts: Point[]) => new Map(pts.map((p) => [p.time, p.value]));

const INDICATOR_COLOR: Record<string, string> = {
  SMA20: "#ffd966", SMA50: "#4fc3f7", SMA200: "#ba68c8", EMA20: "#ff8a65",
  VWAP: "#80cbc4", RSI: "#ff9900", BOLL: "#ff9900", MACD: "#4fc3f7",
};

const EMPTY_DRAWINGS:Drawing[]=[];
export default function ChartWidget({ widget, candlesOverride, indicatorContextOverride, replayMode=false, replayTotalCandles }: { widget: WidgetInstance; candlesOverride?:Candle[]; indicatorContextOverride?:Candle[]; replayMode?:boolean; replayTotalCandles?:number }) {
  const symbol = useWidgetSymbol(widget);
  const drawings=useChartTools(s=>s.drawings[symbol]??EMPTY_DRAWINGS);
  const settings=useChartTools(s=>s.settings[widget.id]??defaultSettings);
  const addDrawing=useChartTools(s=>s.add);
  const removeDrawing=useChartTools(s=>s.remove);
  const configure=useChartTools(s=>s.configure);
  const [tool,setTool]=useState<'none'|'horizontal'|'trend'|'measure'>('none');
  const toolRef=useRef(tool);toolRef.current=tool;
  const pendingPoint=useRef<DrawingPoint|null>(null);
  const [drawNotice,setDrawNotice]=useState('');
  const [range, setRange] = useState<Range>("6M");
  useEffect(()=>{pendingPoint.current=null;setDrawNotice('');},[symbol,range,candlesOverride?.[0]?.timeframe]);
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [active, setActive] = useState<Set<Indicator>>(new Set(["SMA20"]));
  const [legend, setLegend] = useState<Candle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const warmup=Math.max(199,settings.smaFast-1,settings.smaSlow-1,settings.smaLong-1,settings.ema-1);
  const {data:history,error,isFetching}=useQuery({
    queryKey:['history',symbol,range,warmup],
    queryFn:()=>apiGet<Candle[]|{candles:Candle[];context:Candle[]}>(`/api/history/${encodeURIComponent(symbol)}?range=${range}&warmup=${warmup}`),
    refetchInterval:range==='1D'?8000:60000,enabled:candlesOverride===undefined,
  });
  const dataset=useMemo(()=>{
    const normalize=(p:Candle):Candle=>p.priceOnly?{...p,open:NaN,high:NaN,low:NaN,volume:null}:p;
    if(!history)return {visible:undefined,context:[] as Candle[]};
    const visible=(Array.isArray(history)?history:history.candles).map(normalize);
    const first=visible[0];const context=Array.isArray(history)?[]:history.context.filter(c=>first&&c.time<first.time&&c.timeframe===first.timeframe&&c.dataSource===first.dataSource).map(normalize);
    return {visible,context};
  },[history]);
  const candles=candlesOverride??dataset.visible;
  const calculationCandles=useMemo(()=>candlesOverride!==undefined?[...(indicatorContextOverride??[]).filter(c=>candlesOverride[0]&&c.time<candlesOverride[0].time),...candlesOverride]:[...dataset.context,...(dataset.visible??[])],[candlesOverride,indicatorContextOverride,dataset]);
  const drawingList=drawings.filter(d=>candlesOverride===undefined||d.points.every(p=>p.time<=(candles?.at(-1)?.time??0)));
  const priceOnly = !!candles?.some(c => c.priceOnly);
  const intraday=candles?.[0]?.timeframe?["5m","15m","1h","4h","6h"].includes(candles[0].timeframe):candlesOverride===undefined&&(range==="1D"||range==="5D");
  const tickVwap=candles?.[0]?.volumeType==='tick';

  // Fast time -> candle lookup for the crosshair legend, independent of chart type.
  const byTime = useMemo(() => {
    const m = new Map<number, Candle>();
    for (const c of candles ?? []) m.set(c.time, c);
    return m;
  }, [candles]);

  // Computed once per candles/active change, shared by both the chart overlays
  // below and the hover legend â€” avoids recomputing the same series twice.
  const indicatorData=useMemo(()=>{
    if(!candles?.length)return null;
    const visible=new Set(candles.map(c=>c.time));const clip=(p:Point[])=>p.filter(v=>visible.has(v.time));
    const b=active.has('BOLL')?bollinger(calculationCandles):null;
    const m=active.has('MACD')?macd(calculationCandles):null;
    return {
      SMA20:active.has('SMA20')?clip(sma(calculationCandles,settings.smaFast)):null,
      SMA50:active.has('SMA50')?clip(sma(calculationCandles,settings.smaSlow)):null,
      SMA200:active.has('SMA200')?clip(sma(calculationCandles,settings.smaLong)):null,
      EMA20:active.has('EMA20')?clip(ema(calculationCandles,settings.ema)):null,
      VWAP:active.has('VWAP')&&!priceOnly&&!candles[0].vwapUnavailable&&intraday?clip(vwap(calculationCandles,/^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|DOT|LINK|LTC|MATIC)$/.test(symbol)?'UTC':'America/New_York',candles[0].vwapSessionStart??0)):null,
      RSI:active.has('RSI')?clip(rsi(calculationCandles)):null,
      BOLL:b?{upper:clip(b.upper),middle:clip(b.middle),lower:clip(b.lower)}:null,
      MACD:m?{macd:clip(m.macd),signal:clip(m.signal),histogram:clip(m.histogram)}:null,
    };
  },[candles,calculationCandles,active,settings,priceOnly,intraday,symbol]);
  const indicatorMessages=useMemo(()=>{
    if(!candles?.length||!indicatorData)return [];
    let available=0;for(let i=calculationCandles.length-1;i>=0&&Number.isFinite(calculationCandles[i].close);i--)available++;
    const required:Array<[Indicator,string,number]>=[['SMA20',`SMA${settings.smaFast}`,settings.smaFast],['SMA50',`SMA${settings.smaSlow}`,settings.smaSlow],['SMA200',`SMA${settings.smaLong}`,settings.smaLong],['EMA20',`EMA${settings.ema}`,settings.ema],['RSI','RSI14',15],['BOLL','BOLL20',20],['MACD','MACD signal / histogram',34]];
    const notices=required.filter(([key,,need])=>active.has(key)&&available<need).map(([key,name,need])=>({key,text:`${name} requires ${need} candles; ${available} available.${replayMode?(replayTotalCandles!==undefined&&replayTotalCandles<need?` Loaded replay has only ${replayTotalCandles} candles; choose a longer history or shorter period.`:' Advance replay to calculate it.'):''}`}));
    if(active.has('VWAP')&&!priceOnly&&!candles[0].vwapUnavailable&&intraday&&!indicatorData.VWAP?.some(p=>p.time===candles.at(-1)!.time))notices.push({key:'VWAP',text:'VWAP unavailable for this session: volume is missing, invalid or zero.'});
    return notices;
  },[candles,calculationCandles,indicatorData,active,settings,candlesOverride,priceOnly,intraday,replayMode,replayTotalCandles]);

  const indicatorMaps = useMemo(() => {
    const maps: Record<string, Map<number, number>> = {};
    if (!indicatorData) return maps;
    if (indicatorData.SMA20) maps.SMA20 = toMap(indicatorData.SMA20);
    if (indicatorData.SMA50) maps.SMA50 = toMap(indicatorData.SMA50);
    if (indicatorData.SMA200) maps.SMA200 = toMap(indicatorData.SMA200);
    if (indicatorData.EMA20) maps.EMA20 = toMap(indicatorData.EMA20);
    if (indicatorData.VWAP) maps.VWAP = toMap(indicatorData.VWAP);
    if (indicatorData.RSI) maps.RSI = toMap(indicatorData.RSI);
    if (indicatorData.BOLL) {
      maps.BOLL_U = toMap(indicatorData.BOLL.upper);
      maps.BOLL_M = toMap(indicatorData.BOLL.middle);
      maps.BOLL_L = toMap(indicatorData.BOLL.lower);
    }
    if (indicatorData.MACD) {
      maps.MACD_M = toMap(indicatorData.MACD.macd);
      maps.MACD_S = toMap(indicatorData.MACD.signal);
      maps.MACD_H = toMap(indicatorData.MACD.histogram);
    }
    return maps;
  }, [indicatorData]);

  const indicatorRows = useMemo(() => {
    if (!legend) return [];
    const t = legend.time;
    const get = (key: string) => indicatorMaps[key]?.get(t);
    const rows: Array<{ key?:string; label: string; value: string; color: string }> = [];
    for (const key of ["SMA20", "SMA50", "SMA200", "EMA20", "VWAP"] as const) {
      const v = get(key);
      if (v !== undefined) rows.push({ key, label: key==='SMA20'?`SMA${settings.smaFast}`:key==='SMA50'?`SMA${settings.smaSlow}`:key==='SMA200'?`SMA${settings.smaLong}`:key==='EMA20'?`EMA${settings.ema}`:key==='VWAP'&&tickVwap?'Tick VWAP':key, value: fmtPrice(v), color: INDICATOR_COLOR[key] });
    }
    const rsiV = get("RSI");
    if (rsiV !== undefined) rows.push({ label: "RSI", value: fmt(rsiV, 1), color: INDICATOR_COLOR.RSI });
    const bollM = get("BOLL_M");
    if (bollM !== undefined) {
      rows.push({
        label: "BOLL",
        value: `${fmtPrice(get("BOLL_U"))} / ${fmtPrice(bollM)} / ${fmtPrice(get("BOLL_L"))}`,
        color: INDICATOR_COLOR.BOLL,
      });
    }
    const macdM = get("MACD_M");
    if (macdM !== undefined) {
      rows.push({
        label: "MACD",
        value: `${fmtPrice(macdM)} / ${fmtPrice(get("MACD_S"))} / ${fmtPrice(get("MACD_H"))}`,
        color: INDICATOR_COLOR.MACD,
      });
    }
    return rows;
  }, [legend, indicatorMaps, settings, tickVwap]);

  useEffect(() => {
    setLegend(candles && candles.length > 0 ? candles[candles.length - 1] : null);
  }, [candles]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !candles || candles.length === 0) return;

    const chart = createChart(el, {
      layout: { background: { color: "#0a0a0a" }, textColor: "#808080", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: "#1a1a1a" }, horzLines: { color: "#1a1a1a" } },
      crosshair: { mode: 0 },
      timeScale: { borderColor: "#262626", timeVisible: intraday },
      rightPriceScale: { borderColor: "#262626" },
      autoSize: true,
      // Mouse-wheel is left free for page scrolling â€” zoom via drag, pinch, or the range buttons instead.
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
    });
    chartRef.current = chart;

    const upColor = "#00c853";
    const downColor = "#ff3d3d";
    const precision = symbol === 'XAGUSD' ? 5 : symbol === 'SI=F' ? 3 : candles[candles.length - 1].close < 10 ? 6 : 2;
    const priceFormat = { type:'price' as const, precision, minMove:10 ** -precision };

    if (!priceOnly && chartType === "candles") {
      chart
        .addSeries(CandlestickSeries, {
          upColor, downColor, borderUpColor: upColor, borderDownColor: downColor,
          wickUpColor: upColor, wickDownColor: downColor, priceFormat,
        })
        .setData(candles.map((c) => ({ time: ts(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    } else if (!priceOnly && chartType === "bars") {
      chart
        .addSeries(BarSeries, { upColor, downColor, priceFormat })
        .setData(candles.map((c) => ({ time: ts(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    } else if (priceOnly || chartType === "line") {
      chart
        .addSeries(LineSeries, { color: "#ff9900", lineWidth: 1, priceFormat })
        .setData(candles.map((c) => ({ time: ts(c.time), value: c.close })));
    } else {
      chart
        .addSeries(AreaSeries, { lineColor: "#ff9900", topColor: "rgba(255,153,0,0.25)", bottomColor: "rgba(255,153,0,0)", priceFormat })
        .setData(candles.map((c) => ({ time: ts(c.time), value: c.close })));
    }

    // volume histogram on its own scale at the bottom of the main pane
    if (!priceOnly && !candles.some(c => c.volume === null || c.volumeUnavailable)) {
      const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      vol.setData(candles.map((c) => ({ time: ts(c.time), value: c.volume!, color: c.close >= c.open ? "rgba(0,200,83,0.4)" : "rgba(255,61,61,0.4)" })));
    }

    const seriesData=(points:Point[])=>{const values=new Map(points.map(p=>[p.time,p.value]));return candles.map(c=>values.has(c.time)?{time:ts(c.time),value:values.get(c.time)!}:{time:ts(c.time)});};
    const overlay=(points:Point[],color:string)=>{if(!points.length)return;chart.addSeries(LineSeries,{color,lineWidth:1,priceLineVisible:false,lastValueVisible:false,priceFormat,pointMarkersVisible:points.length===1,pointMarkersRadius:3}).setData(seriesData(points));};

    if (indicatorData?.SMA20) overlay(indicatorData.SMA20, INDICATOR_COLOR.SMA20);
    if (indicatorData?.SMA50) overlay(indicatorData.SMA50, INDICATOR_COLOR.SMA50);
    if (indicatorData?.SMA200) overlay(indicatorData.SMA200, INDICATOR_COLOR.SMA200);
    if (indicatorData?.EMA20) overlay(indicatorData.EMA20, INDICATOR_COLOR.EMA20);
    if (indicatorData?.VWAP) overlay(indicatorData.VWAP, INDICATOR_COLOR.VWAP);
    if (indicatorData?.BOLL) {
      overlay(indicatorData.BOLL.upper, "rgba(255,153,0,0.5)");
      overlay(indicatorData.BOLL.middle, "rgba(255,153,0,0.8)");
      overlay(indicatorData.BOLL.lower, "rgba(255,153,0,0.5)");
    }

    let paneIdx = 1;
    if (indicatorData?.RSI?.length) {
      const s=chart.addSeries(LineSeries,{color:INDICATOR_COLOR.RSI,lineWidth:1,pointMarkersVisible:indicatorData.RSI.length===1,autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})},paneIdx++);
      s.setData(seriesData(indicatorData.RSI));
      for(const price of [30,70])s.createPriceLine({price,color:'#555555',lineWidth:1,lineStyle:2,axisLabelVisible:false,title:''});
    }
    if (indicatorData?.MACD?.macd.length) {
      const m = indicatorData.MACD;
      const pane = paneIdx++;
      const macdPrecision = candles[candles.length - 1].close < 10 ? 8 : 4;
      const macdFormat = {type:'price' as const, precision:macdPrecision, minMove:10 ** -macdPrecision};
      chart.addSeries(HistogramSeries, { color: "#4fc3f7", priceFormat:macdFormat }, pane).setData(
        seriesData(m.histogram).map(p=>typeof p.value==='number'?{...p,color:p.value>=0?'rgba(0,200,83,0.6)':'rgba(255,61,61,0.6)'}:p)
      );
      chart.addSeries(LineSeries, { color: "#ff9900", lineWidth: 1, priceFormat:macdFormat,pointMarkersVisible:m.macd.length===1 }, pane).setData(
        seriesData(m.macd)
      );
      chart.addSeries(LineSeries, { color: "#ffffff", lineWidth: 1, priceFormat:macdFormat,pointMarkersVisible:m.signal.length===1 }, pane).setData(
        seriesData(m.signal)
      );
    }

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setLegend(candles[candles.length - 1]);
        return;
      }
      const hit = byTime.get(param.time as number);
      if (hit) setLegend(hit);
    });

    const primary=chart.panes()[0].getSeries()[0];
    const available=new Set(candles.map(c=>c.time));
    // Horizontal levels persist across ranges; trend/ruler anchors require their candles.
    for(const drawing of drawings.filter(validDrawing)) {
      if(candlesOverride!==undefined && drawing.points.some(p=>p.time>candles.at(-1)!.time))continue;
      if(drawing.kind==='horizontal') primary.createPriceLine({price:drawing.points[0].price,color:'#80cbc4',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'Level'});
      else if(drawing.points.every(p=>available.has(p.time))) {
        const points=[...drawing.points].sort((a,b)=>a.time-b.time);
        chart.addSeries(LineSeries,{color:drawing.kind==='measure'?'#ffffff':'#80cbc4',lineWidth:2,priceLineVisible:false,lastValueVisible:false}).setData(points.map(p=>({time:ts(p.time),value:p.price})));
      }
    }
    const drawClick=(event:MouseEvent)=>{
      const kind=toolRef.current;
      if(kind==='none')return;
      const rect=el.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
      if(y<0||y>chart.paneSize(0).height)return;
      const time=chart.timeScale().coordinateToTime(x);
      if(typeof time!=='number')return;
      const price=primary.coordinateToPrice(y);
      if(price===null||!Number.isFinite(price))return;
      const point={time:time as number,price};
      if(kind==='horizontal') {addDrawing(symbol,{id:crypto.randomUUID(),kind,points:[point]});setDrawNotice('Horizontal level saved');return;}
      if(!pendingPoint.current){pendingPoint.current=point;setDrawNotice('Select a second candle');return;}
      const first=pendingPoint.current;pendingPoint.current=null;
      const drawing:Drawing={id:crypto.randomUUID(),kind,points:[first,point]};
      if(!validDrawing(drawing)){setDrawNotice('Choose two different candles');return;}
      addDrawing(symbol,drawing);setDrawNotice('Drawing saved');
    };
    el.addEventListener('click',drawClick);
    chart.timeScale().fitContent();
    return () => {
      el.removeEventListener('click',drawClick);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, chartType, indicatorData, range, byTime, priceOnly, symbol, drawings, addDrawing, candlesOverride, intraday]);

  const toggleIndicator = (ind: Indicator) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind);
      else next.add(ind);
      return next;
    });

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 p-1 flex-wrap shrink-0">
        {candlesOverride===undefined && RANGES.map((r) => (
          <button key={r} disabled={candlesOverride !== undefined} className={`term-btn ${range === r ? "active" : ""}`} onClick={() => setRange(r)}>
            {r}
          </button>
        ))}
        <span className="w-2" />
        {CHART_TYPES.map((t) => (
          <button key={t} disabled={priceOnly && t !== 'line'} className={`term-btn ${(priceOnly ? t === 'line' : chartType === t) ? "active" : ""}`} onClick={() => setChartType(t)}>
            {t.toUpperCase()}
          </button>
        ))}
        <span className="w-2" />
        {INDICATORS.map((ind) => (
          <button key={ind} aria-label={ind} aria-pressed={active.has(ind)} className={`term-btn ${active.has(ind) ? "active" : ""}`} onClick={() => toggleIndicator(ind)}>
            {ind==='SMA20'?`SMA${settings.smaFast}`:ind==='SMA50'?`SMA${settings.smaSlow}`:ind==='SMA200'?`SMA${settings.smaLong}`:ind==='EMA20'?`EMA${settings.ema}`:ind==='VWAP'&&tickVwap?'Tick VWAP':ind}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 p-1 items-center" aria-label="Chart drawing tools">
        {(['none','horizontal','trend','measure'] as const).map(t=><button key={t} className={`term-btn ${tool===t?'active':''}`} onClick={()=>{setTool(t);pendingPoint.current=null;setDrawNotice(t==='none'?'':t==='horizontal'?'Click a price on the chart':'Click two different candles');}}>{({none:'Navigate',horizontal:'Horizontal level',trend:'Trend line',measure:'Measure'})[t]}</button>)}
        <span role="status" className="dim">{drawNotice}</span>
        <details><summary>Indicator settings / saved drawings ({drawingList.length})</summary>
          <div className="flex flex-wrap gap-2">{([['smaFast','Fast SMA'],['smaSlow','Slow SMA'],['smaLong','Long SMA'],['ema','EMA period']] as const).map(([key,label])=><label key={key}>{label}<input aria-label={label} className="w-16" type="number" min={2} max={500} value={settings[key]} onChange={e=>configure(widget.id,{...settings,[key]:Number(e.target.value)})}/></label>)}</div>
          {drawingList.map(d=><div key={d.id}>{d.kind} {d.points.map(p=>p.price.toFixed(4)).join(' → ')}{d.kind==='measure'&&d.points[0].price!==0?` (${((d.points[1].price/d.points[0].price-1)*100).toFixed(2)}%, ${Math.abs(d.points[1].time-d.points[0].time)/3600}h)`:''} <button className="term-btn" aria-label={`Delete drawing ${d.id}`} onClick={()=>removeDrawing(symbol,d.id)}>Delete drawing</button></div>)}
        </details>
      </div>
      {isFetching&&candlesOverride===undefined&&<div role="status" className="p-1 dim">Loading chart and indicator history…</div>}
      {candles?.length&&(candlesOverride===undefined||indicatorContextOverride!==undefined)?<div data-testid="chart-history-count" className="p-1 dim">{candles.length} visible candles · {indicatorContextOverride?.length??dataset.context.length} earlier candles for indicators</div>:null}
      {indicatorMessages.map(m=><div role="status" data-testid={`indicator-${m.key}-notice`} key={m.key} className="p-1 amber">{m.text}</div>)}
      {error && candlesOverride===undefined && <div className="p-2 down">{range === '1D' || range === '5D' ? 'Intraday data unavailable; daily candles are not substituted. ' : ''}Error: {(error as Error).message}</div>}
      {candles?.[0]?.dataSource && <div className="p-2 dim">{candles[0].dataSource} · {({'5m':'5-minute bars','15m':'15-minute bars','1h':'hourly bars','4h':'4-hour bars','6h':'6-hour bars','1d':'daily bars','1w':'weekly bars','1mo':'monthly bars'} as Record<string,string>)[candles[0].timeframe??'']??'bars'} · delay unknown · {candles[0].sessionLabel??'regular session'} · {candles[0].instrumentNote} · latest bar {new Date(candles[candles.length-1].time*1000).toLocaleString()}</div>}
      {priceOnly && <div className="p-2 dim">{candles?.[0]?.dataSource?.startsWith('Derived')?'Derived session closes. Line only; no synthetic OHLC or volume.':candles?.[0]?.dataSource==='FRED daily close'?'FRED daily closes. Line only; OHLC and volume unavailable.':'Nasdaq sampled intraday prices (may include extended hours). Line only; OHLC and volume are unavailable.'}</div>}
      {candles?.[0]?.vwapUnavailable && active.has('VWAP') && <div className="p-2 dim">Session VWAP unavailable for this feed.</div>}
      {priceOnly && active.has('VWAP') && <div className="p-2 dim">Session VWAP unavailable: the sampled price feed has no per-point volume.</div>}
      {active.has('VWAP') && !intraday && <div className="p-2 dim">Session VWAP requires intraday candles.</div>}
      {active.has('VWAP')&&intraday&&!priceOnly&&!candles?.[0]?.vwapUnavailable&&candles?.[0]?.vwapSessionStart!==undefined&&<div data-testid="vwap-method" className="p-1 dim">{tickVwap?'Tick VWAP — price-update counts, not traded volume.':'VWAP — traded contract volume.'} Session anchor {String(candles[0].vwapSessionStart).padStart(2,'0')}:00 America/New_York. HLC3 bar estimate.</div>}
      {replayMode&&active.has('VWAP')&&intraday&&candles?.[0]?.vwapSessionStart!==undefined&&<div className="p-1 dim">VWAP uses only replayed candles; the earliest session may be partial.</div>}
      <div className="relative flex-1 min-h-0">
        {legend && (
          <div className="absolute top-1 left-2 z-10 flex flex-col gap-0.5 text-[11px] pointer-events-none bg-[rgba(10,10,10,0.7)] px-2 py-1 rounded max-w-[95%]">
            <div className="flex gap-3">
              {!priceOnly && <><span className="dim">O <span className="text-[var(--text)]">{fmtPrice(legend.open)}</span></span>
              <span className="dim">H <span className="up">{fmtPrice(legend.high)}</span></span>
              <span className="dim">L <span className="down">{fmtPrice(legend.low)}</span></span>
              <span className="dim">C <span className={legend.close >= legend.open ? "up" : "down"}>{fmtPrice(legend.close)}</span></span>
              <span className="dim">{legend.volumeType==='tick'?'Tick vol':'Vol'} <span className="text-[var(--text)]">{fmtBig(legend.volume)}</span></span></>}
              {priceOnly && <span className="dim">Price <span className="text-[var(--text)]">{fmtPrice(legend.close)}</span></span>}
              <span className="dim" title="Time of the selected candle">{new Date(legend.time * 1000).toLocaleString()}</span>
            </div>
            {indicatorRows.length > 0 && (
              <div className="flex gap-3 flex-wrap">
                {indicatorRows.map((r) => (

                  <span key={r.key??r.label} data-testid={`indicator-${r.key==='VWAP'?'VWAP':r.label}-value`} className="dim">
                    {r.label} <span style={{ color: r.color }}>{r.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={containerRef} data-testid="price-chart" className="w-full h-full" />
      </div>
    </div>
  );
}
