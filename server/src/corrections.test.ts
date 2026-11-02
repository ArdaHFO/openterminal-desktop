import { describe, expect, it } from 'vitest';
import { rsi, vwap } from '../../web/lib/indicators.js';
import { rangeStart } from './ranges.js';
import { calculatePositions } from './ledger.js';
import { earningsMove } from './earnings.js';
import { nasdaqWallTimeToUtc } from './providers/nasdaq.js';

const candle = (time: number, value: number) => ({ time, open: value, high: value, low: value, close: value, volume: 10 });
describe('reported calculation defects', () => {
  it('starts YTD on January 1 UTC, including leap years', () => {
    expect(rangeStart('YTD', new Date('2026-10-27T12:00:00Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(rangeStart('YTD', new Date('2024-02-29T12:00:00Z')).toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });
  it('uses the report date or later, never earlier candles', () => {
    const candles = [candle(Date.parse('2026-07-27T00:00:00Z')/1000,100), candle(Date.parse('2026-07-30T00:00:00Z')/1000,110), candle(Date.parse('2026-07-31T00:00:00Z')/1000,121)];
    expect(earningsMove(candles, Date.parse('2026-07-30T00:00:00Z')/1000)).toBeCloseTo(10);
    expect(earningsMove(candles, Date.parse('2026-07-31T00:00:00Z')/1000)).toBeNull();
  });
  it('rejects oversells rather than silently discarding them', () => {
    expect(() => calculatePositions([{symbol:'AAPL',side:'SELL',quantity:5,price:100}])).toThrow(/insufficient/i);
    const p = calculatePositions([{symbol:'AAPL',side:'BUY',quantity:10,price:100},{symbol:'AAPL',side:'BUY',quantity:10,price:120},{symbol:'AAPL',side:'SELL',quantity:5,price:130}]);
    expect(p[0]).toMatchObject({quantity:15,avgCost:110,realizedPnl:100});
  });
  it('resets VWAP each UTC day for crypto and treats flat RSI neutrally', () => {
    expect(vwap([candle(0,100),candle(86400,200)], 'UTC').map(x=>x.value)).toEqual([100,200]);
    expect(rsi(Array.from({length:20},(_,i)=>candle(i*86400,10))).at(-1)?.value).toBe(50);
    expect(rsi(Array.from({length:20},(_,i)=>candle(i*86400,10+i))).at(-1)?.value).toBe(100);
    expect(rsi(Array.from({length:20},(_,i)=>candle(i*86400,30-i))).at(-1)?.value).toBe(0);
  });
  it('uses New York session dates instead of UTC midnight', () => {
    const a = Date.parse('2026-10-26T23:00:00Z') / 1000;
    const b = Date.parse('2026-10-27T01:00:00Z') / 1000;
    const c = Date.parse('2026-10-27T14:00:00Z') / 1000;
    expect(vwap([candle(a,100),candle(b,200),candle(c,300)], 'America/New_York').map(x => x.value)).toEqual([100,150,300]);
  });
  it('converts Nasdaq Eastern wall time across daylight saving', () => {
    expect(new Date(nasdaqWallTimeToUtc(Date.parse('2026-10-27T14:47:00Z'))).toISOString()).toBe('2026-10-27T18:47:00.000Z');
    expect(new Date(nasdaqWallTimeToUtc(Date.parse('2026-12-15T14:47:00Z'))).toISOString()).toBe('2026-12-15T19:47:00.000Z');
  });
});

describe('portfolio aliases and invalid ledger entries',()=>{
  it('aggregates legacy aliases without rewriting transaction records',()=>{
    const entries=[{symbol:'xau',side:'BUY',quantity:10,price:100},{symbol:'XAUUSD',side:'SELL',quantity:4,price:120}];
    expect(calculatePositions(entries)).toEqual([{symbol:'XAUUSD',quantity:6,avgCost:100,realizedPnl:80}]);expect(entries[0].symbol).toBe('xau');
  });
  it.each([{side:'HOLD',quantity:1,price:10},{side:'BUY',quantity:0,price:10},{side:'BUY',quantity:1,price:NaN},{side:'SELL',quantity:Infinity,price:10}])('rejects corrupt ledger inputs',entry=>expect(()=>calculatePositions([{symbol:'AAPL',...entry}])).toThrow('Invalid ledger'));
});
