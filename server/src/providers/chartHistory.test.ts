import {describe,it,expect,vi,afterEach} from 'vitest';
import {chartHistory,chartResolution,splitChartHistory} from './chartHistory.js';
import * as nasdaq from './nasdaq.js';import * as yahoo from './yahoo.js';import * as tv from './fiveDay.js';
const now=Date.parse('2026-10-29T12:00:00Z');
const rows=Array.from({length:700},(_,i)=>({time:Math.floor(now/86400000)*86400-(699-i)*86400,open:101+i/100,high:102+i/100,low:100+i/100,close:101+i/100,volume:10,dataSource:'Synthetic',timeframe:'1d' as const,delayStatus:'unknown' as const}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
describe('indicator context keeps visible history and resolution separate',()=>{
 it('adds 199 strictly earlier daily candles without extending the six-month window',()=>{const r=splitChartHistory(rows,'AAPL','6M',199,new Date(now));expect(r.context).toHaveLength(199);expect(r.candles).toHaveLength(184);expect(r.context.at(-1)!.time).toBeLessThan(r.candles[0].time);expect(r.candles[0].time).toBe(rows.at(-184)!.time);});
 it('does not manufacture data before instrument inception',()=>{const r=splitChartHistory(rows.slice(-30),'AAPL','6M',199,new Date(now));expect(r.context).toEqual([]);expect(r.candles).toHaveLength(30);expect(r.requestedWarmup).toBe(199);});
 it('MAX shows the supplied full history and has no invented earlier context',()=>{const r=splitChartHistory(rows,'AAPL','MAX',199,new Date(now));expect(r.candles).toHaveLength(700);expect(r.context).toEqual([]);});
 it('cleans invalid OHLC, duplicate timestamps and future rows without relabelling prices',()=>{const result=splitChartHistory([...rows,rows[699],{...rows[699],time:now+86400},{...rows[698],high:1}], 'AAPL','6M',199,new Date(now));expect(result.candles).toHaveLength(184);expect(result.candles.every(c=>c.high>=c.close)).toBe(true);});
 it('uses daily equity bars, while retaining metal and crypto timeframe semantics',()=>{expect(chartResolution('AAPL','1M')).toBe('1d');expect(chartResolution('AAPL','5Y')).toBe('1d');expect(chartResolution('XAUUSD','1M')).toBe('1h');expect(chartResolution('XAUUSD','5Y')).toBe('1w');expect(chartResolution('BTC','6M')).toBe('6h');});
 it('uses one Nasdaq dataset for both price candles and indicator context',async()=>{vi.useFakeTimers();vi.setSystemTime(now);const n=vi.spyOn(nasdaq,'history').mockResolvedValue(rows);const result=await chartHistory('AAPL','6M',199);expect(n).toHaveBeenCalledWith('AAPL','5Y');expect(result.context).toHaveLength(199);expect(new Set([...result.context,...result.candles].map(c=>c.dataSource)).size).toBe(1);});
 it('requests a longer daily span for a five-year chart rather than switching to weekly bars',async()=>{vi.useFakeTimers();vi.setSystemTime(now);const n=vi.spyOn(nasdaq,'history').mockResolvedValue(rows);const result=await chartHistory('AAPL','5Y',199);expect(n).toHaveBeenCalledWith('AAPL','MAX');expect(result.candles[0].timeframe).toBe('1d');});
 it('Yahoo/Nasdaq outage preserves daily resolution and matching earlier TradingView bars',async()=>{vi.useFakeTimers();vi.setSystemTime(now);vi.spyOn(nasdaq,'history').mockRejectedValue(Error('503'));vi.spyOn(yahoo,'history').mockRejectedValue(Error('503'));const t=vi.spyOn(tv,'tradingViewHistory').mockResolvedValue(rows);const r=await chartHistory('AAPL','6M',199);expect(t).toHaveBeenCalledWith('AAPL','6M',undefined,{warmup:199,resolution:'1d'});expect(r.context).toHaveLength(199);});
 it.each(['GC=F','SI=F'])('retains contract volume and its VWAP session on the Yahoo fallback for %s',async symbol=>{
  vi.useFakeTimers();vi.setSystemTime(now);vi.spyOn(tv,'tradingViewHistory').mockRejectedValue(Error('503'));vi.spyOn(yahoo,'history').mockResolvedValue(rows);
  const r=await chartHistory(symbol,'6M',199);expect(r.candles[0]).toMatchObject({volumeType:'contracts',vwapSessionStart:18,vwapUnavailable:false});
 });
 it('crypto fetches earlier pages and still has a complete warm-up at the first visible hour',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);const all=Array.from({length:1300},(_,i)=>[now-(1299-i)*3600000,'100','102','99','101','5']);
  const f=vi.fn(async(raw:string)=>{const u=new URL(raw),end=Number(u.searchParams.get('endTime')),limit=Number(u.searchParams.get('limit'));return {ok:true,json:async()=>all.filter(r=>Number(r[0])<=end).slice(-limit)};});vi.stubGlobal('fetch',f);
  const r=await chartHistory('BTC','1M',499);expect(f).toHaveBeenCalledTimes(2);expect(r.context).toHaveLength(499);expect(r.candles).toHaveLength(745);expect(r.candles[0].timeframe).toBe('1h');expect(r.context.at(-1)!.time).toBeLessThan(r.candles[0].time);
 });
 it.each([0,500,-1,1.5,NaN])('rejects invalid warm-up count %s',async n=>{await expect(chartHistory('AAPL','6M',n)).rejects.toThrow('warm-up');});
});
