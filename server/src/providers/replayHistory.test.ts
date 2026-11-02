import {afterEach,describe,it,expect,vi} from 'vitest';
import {REPLAY_SECONDS,validReplayRequest,closedReplayBars,replayHistory,binanceReplay,type ReplayInterval} from './replayHistory.js';
import * as tv from './fiveDay.js';
import * as yahoo from './yahoo.js';
const now=Date.parse('2026-10-29T12:00:00Z')/1000;
function bars(interval:ReplayInterval,count=80){const step=REPLAY_SECONDS[interval];return Array.from({length:count},(_,i)=>({time:now-(count-i)*step,open:100,high:102,low:99,close:101,volume:5,dataSource:'Synthetic test feed',timeframe:interval,delayStatus:'unknown' as const}));}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
describe('intraday replay safety and routing',()=>{
  it.each(['15m','1h','4h'])('accepts %s only with bounded history',interval=>{expect(validReplayRequest('1M',interval)).toBe(true);expect(validReplayRequest('5D',interval)).toBe(true);expect(validReplayRequest('MAX',interval)).toBe(false);expect(validReplayRequest('1Y',interval)).toBe(false);});
  it.each(['__proto__','1d','1m','60','', 'constructor'])('rejects an unsupported interval %s',interval=>expect(validReplayRequest('1M',interval)).toBe(false));
  it.each(['15m','1h','4h'] as const)('excludes unfinished %s bars and returns ascending unique validated candles',interval=>{
    const rows=bars(interval);const live={...rows.at(-1)!,time:now-1};
    const result=closedReplayBars([...rows.slice().reverse(),rows[0],live,{...rows[1],high:1}], '1M',interval,now);
    expect(result.at(-1)!.time+REPLAY_SECONDS[interval]).toBeLessThanOrEqual(now);
    expect(result).toHaveLength(rows.length);expect(new Set(result.map(c=>c.time)).size).toBe(result.length);
    expect(result.every((c,i)=>i===0||c.time>result[i-1].time)).toBe(true);
    expect(result.every(c=>c.high>=c.open&&c.low<=c.close&&c.timeframe===interval)).toBe(true);
  });
  it('rejects daily bars labelled hourly and overlapping finer bars',()=>{
    expect(()=>closedReplayBars(bars('1h').map((c,i)=>({...c,time:now-(80-i)*86400})),'1M','1h',now)).toThrow('spacing');
    expect(()=>closedReplayBars(bars('15m').map(c=>({...c,timeframe:'1h' as const})),'1M','1h',now)).toThrow('Overlapping');
  });
  it('does not invent OHLC for close-only data',()=>{expect(()=>closedReplayBars(bars('1h').map(c=>({...c,priceOnly:true})),'1M','1h',now)).toThrow('verified');});
  it.each(['15m','1h'] as const)('falls back from a Yahoo outage at %s to the same TradingView interval',async interval=>{
    vi.useFakeTimers();vi.setSystemTime(now*1000);vi.spyOn(yahoo,'history').mockRejectedValue(new Error('503'));
    const mock=vi.spyOn(tv,'tradingViewHistory').mockResolvedValue(bars(interval));
    const result=await replayHistory('AAPL','1M',interval);
    expect(mock).toHaveBeenCalledWith('AAPL','1M',interval);expect(result.every(c=>c.timeframe===interval)).toBe(true);
  });
  it('requests native 240-minute source without a fabricated Yahoo 4h interval',async()=>{
    vi.useFakeTimers();vi.setSystemTime(now*1000);const y=vi.spyOn(yahoo,'history');
    const mock=vi.spyOn(tv,'tradingViewHistory').mockResolvedValue(bars('4h'));
    await replayHistory('MSFT','1M','4h');expect(mock).toHaveBeenCalledWith('MSFT','1M','4h');expect(y).not.toHaveBeenCalled();
  });
  for(const symbol of ['XAUUSD','XAGUSD','GC=F','SI=F'])it.each(['15m','1h','4h'] as const)(`${symbol} preserves metal metadata at %s`,async interval=>{
    vi.useFakeTimers();vi.setSystemTime(now*1000);
    vi.spyOn(tv,'tradingViewHistory').mockResolvedValue(bars(interval).map(c=>({...c,volumeType:symbol.includes('=')?'contracts':'tick',vwapUnavailable:true,sessionLabel:'overnight session'})));
    const result=await replayHistory(symbol,'1M',interval);expect(result[0].volumeType).toBe(symbol.includes('=')?'contracts':'tick');expect(result[0].vwapUnavailable).toBe(true);
  });
  it('paginates a full month of 15-minute crypto bars without losing older pages',async()=>{
    const step=900000,start=(now-31*86400)*1000;const all=Array.from({length:2977},(_,i)=>[start+i*step,'100','102','99','101','5']);
    const fetcher=vi.fn(async(raw:string)=>{const u=new URL(raw),cursor=Number(u.searchParams.get('startTime'));return {ok:true,json:async()=>all.filter(r=>Number(r[0])>=cursor).slice(0,1000)};});vi.stubGlobal('fetch',fetcher);
    const result=await binanceReplay('BTC','1M','15m',now);expect(fetcher).toHaveBeenCalledTimes(3);expect(result).toHaveLength(2976);expect(result[0].time).toBe(start/1000);expect(result.at(-1)!.time).toBe(now-900);
  });
  it.each(['1h','4h'] as const)('uses native Binance %s with correct units and no current candle',async interval=>{
    vi.stubGlobal('fetch',vi.fn(async(raw:string)=>{expect(new URL(raw).searchParams.get('interval')).toBe(interval);return {ok:true,json:async()=>bars(interval,30).map(c=>[c.time*1000,c.open,c.high,c.low,c.close,c.volume])};}));
    const result=await binanceReplay('BTC','1M',interval,now);expect(result).toHaveLength(30);expect(result[0].timeframe).toBe(interval);expect(result[0].dataSource).toContain('BTC/USDT');
  });
  it('fails safely when pagination cannot advance or a provider fails',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>[[1,'100','102','99','101','5']]})));
    await expect(binanceReplay('BTC','1M','15m',now)).rejects.toThrow('did not advance');
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:503})));await expect(binanceReplay('BTC','1M','15m',now)).rejects.toThrow('503');
  });
});
