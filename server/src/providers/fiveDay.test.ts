import { describe, expect, it } from 'vitest';
import { parseFrames, selectFiveSessions, selectLastSession, selectSixMonths, selectRange, validateBars, resolveUsTicker, metalInstrument } from './fiveDay.js';
import { search } from './tradingview.js';
import {metalVwapMetadata} from './metalSymbols.js';

describe('five-day stock fallback', () => {
  it('retains missing volume as null for VWAP instead of erasing the incomplete candle',()=>{
    expect(validateBars([[1000,10,11,9,10,100],[1900,10,11,9,10,null]],false,true)).toMatchObject([{time:1000,volume:100},{time:1900,volume:null}]);
    expect(validateBars([[1000,10,11,9,10,-2]],false,true)[0].volume).toBeNull();
  });
  it.each([['XAUUSD','tick',17],['XAGUSD','tick',17],['GC=F','contracts',18],['SI=F','contracts',18]])('preserves honest volume and VWAP anchor metadata for %s',(symbol,type,start)=>{
    expect(metalVwapMetadata(metalInstrument(symbol as string)!)).toEqual({volumeType:type,vwapSessionStart:start,vwapUnavailable:false});
  });
  it('preserves incomplete framed messages and parses adjacent unicode payloads', () => {
    const payload = Buffer.from('~m~2~m~{}~m~2~m~ok~m~4~m~x', 'utf8');
    const result = parseFrames(payload);
    expect(result.messages).toEqual(['{}','ok']);
    expect(result.rest.toString()).toBe('~m~4~m~x');
    expect(parseFrames(Buffer.from('~m~4~m')).rest.toString()).toBe('~m~4~m');
  });
  it('retains exactly the latest five Eastern trading dates, across weekends', () => {
    const days=['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-26','2026-10-27'];
    const bars=days.map((d,i)=>({time:Date.parse(d+'T14:00:00Z')/1000,open:100+i,high:101+i,low:99+i,close:100+i,volume:1}));
    const selected=selectFiveSessions(bars);
    expect(selected).toHaveLength(5);
    expect(new Date(selected[0].time*1000).toISOString().slice(0,10)).toBe('2026-10-21');
  });
  it('rejects fabricated/missing or inconsistent OHLCV', () => {
    expect(validateBars([[1000,10,11,9,10,100],[1900,10,11,9,10,null]])).toHaveLength(1);
    expect(validateBars([[1000,10,9,8,10,100]])).toHaveLength(0);
    expect(validateBars([[1000,10,11,9,10]], true)).toMatchObject([{time:1000,volume:null}]);
    expect(validateBars([[1000,10,11,9,10]])).toHaveLength(0);
  });
  it('rejects ambiguous or unsupported markets instead of guessing', () => {
    expect(resolveUsTicker('AAPL',[{symbol:'AAPL',exchange:'NASDAQ',type:'stock'}])).toBe('NASDAQ:AAPL');
    expect(resolveUsTicker('SPY',[{symbol:'SPY',exchange:'AMEX',type:'fund'}])).toBe('AMEX:SPY');
    expect(() => resolveUsTicker('AAPL',[{symbol:'AAPL',exchange:'NASDAQ',type:'stock'},{symbol:'AAPL',exchange:'NYSE',type:'stock'}])).toThrow();
    expect(() => resolveUsTicker('ABC.L',[{symbol:'ABC.L',exchange:'LSE',type:'stock'}])).toThrow();
  });
  it('maps only the explicitly supported metal symbols to identified instruments', () => {
    expect(metalInstrument('XAUUSD')?.ticker).toBe('OANDA:XAUUSD');
    expect(metalInstrument('XAGUSD')?.ticker).toBe('OANDA:XAGUSD');
    expect(metalInstrument('GC=F')?.ticker).toBe('COMEX:GC1!');
    expect(metalInstrument('SI=F')?.ticker).toBe('COMEX:SI1!');
    expect(metalInstrument('GCZ26')).toBeUndefined();
  });
  it('groups overnight metal bars by the New York session start, across weekends and DST', () => {
    const dates=['2026-10-22T20:45:00Z','2026-10-22T21:00:00Z','2026-10-25T21:00:00Z','2026-10-26T21:00:00Z','2026-10-27T21:00:00Z','2026-11-01T22:00:00Z','2026-11-02T21:45:00Z'];
    const bars=dates.map((d,i)=>({time:Date.parse(d)/1000,open:100,high:101,low:99,close:100,volume:i}));
    expect(selectFiveSessions(bars, 17).map(x=>x.volume)).toEqual([1,2,3,4,5,6]);
  });
  it('makes each supported symbol discoverable by exact search', async () => {
    for (const symbol of ['XAUUSD', 'XAGUSD', 'GC=F', 'SI=F']) {
      const rows = await search(symbol);
      expect(rows).toHaveLength(1);
      expect(rows[0].symbol).toBe(symbol);
      expect(rows[0].name).toMatch(/CFD|continuous proxy/);
    }
  });
  it('resolves exact VIX and crypto search to the instruments the routes actually use', async () => {
    expect(await search('VIX')).toEqual([{symbol:'^VIX',name:'CBOE Volatility Index',exchange:'CBOE',type:'index'}]);
    expect(await search('BTC')).toEqual([{symbol:'BTC',name:'BTC/USDT (Binance)',exchange:'Binance',type:'crypto'}]);
  });
  it('limits six-month daily data to the requested UTC date window', () => {
    const bars=['2026-04-26','2026-04-27','2026-10-27'].map((d,i)=>({time:Date.parse(d+'T00:00:00Z')/1000,open:1,high:1,low:1,close:1,volume:i}));
    expect(selectSixMonths(bars,new Date('2026-10-27T20:00:00Z')).map(c=>c.volume)).toEqual([1,2]);
  });
  it('selects the latest trading session, including overnight metal sessions', () => {
    const days=['2026-10-23T20:00:00Z','2026-10-25T21:00:00Z','2026-10-26T20:00:00Z'];
    const bars=days.map((d,i)=>({time:Date.parse(d)/1000,open:1,high:1,low:1,close:1,volume:i}));
    expect(selectLastSession(bars,17).map(c=>c.volume)).toEqual([1,2]);
  });
  it('trims YTD from the start of the calendar year', () => {
    const days=['2025-12-31T00:00:00Z','2026-01-01T00:00:00Z','2026-10-27T00:00:00Z'];
    const bars=days.map((d,i)=>({time:Date.parse(d)/1000,open:1,high:1,low:1,close:1,volume:i}));
    expect(selectRange(bars,'YTD',new Date('2026-10-27T20:00:00Z')).map(c=>c.volume)).toEqual([1,2]);
  });
});
