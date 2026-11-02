import {describe,it,expect} from 'vitest';
import {sma,ema,rsi,macd,bollinger,vwap} from '../../web/lib/indicators.js';
const bars=(values:number[],start=0)=>values.map((close,i)=>({time:start+i*300,open:close,high:close+1,low:close-1,close,volume:10 as number|null}));
const ramp=Array.from({length:325},(_,i)=>i+1);
describe('indicator numerical reference and boundaries',()=>{
 it('SMA200 waits for 200 actual observations then uses exactly the last 200',()=>{expect(sma(bars(ramp.slice(0,199)),200)).toEqual([]);expect(sma(bars(ramp.slice(0,200)),200)).toEqual([{time:199*300,value:100.5}]);expect(sma(bars(ramp.slice(0,201)),200).at(-1)!.value).toBe(101.5);expect(sma(bars(ramp),200).at(-1)!.value).toBe(225.5);});
 it('EMA seeds from the first full SMA rather than an arbitrary first observation',()=>{expect(ema(bars([1,2]),3)).toEqual([]);expect(ema(bars([1,2,3,4,8]),3).map(p=>p.value)).toEqual([2,3,5.5]);});
 it('MACD signal is an EMA of the MACD line with its own full warm-up',()=>{expect(macd(bars(ramp.slice(0,33))).signal).toEqual([]);const m=macd(bars(ramp.slice(0,34)));expect(m.macd).toHaveLength(9);expect(m.signal).toHaveLength(1);expect(m.histogram).toHaveLength(1);expect(m.macd[0].value).toBe(7);expect(m.signal[0].value).toBe(7);expect(m.histogram[0].value).toBe(0);});
 it('MACD fast=2 slow=3 signal=2 matches independent hand calculations',()=>{const m=macd(bars([1,2,3,8,4,10]),2,3,2);expect(m.macd.map(p=>p.value)).toEqual(expect.arrayContaining([expect.closeTo(0.5,10),expect.closeTo(7/6,10),expect.closeTo(2/9,10),expect.closeTo(107/108,10)]));expect(m.signal[0].value).toBeCloseTo(5/6,10);expect(m.histogram[0].value).toBeCloseTo(1/3,10);});
 it('RSI uses Wilder smoothing and handles flat/up/down limits',()=>{expect(rsi(bars([10,12,11,13]),2).map(p=>p.value)).toEqual([expect.closeTo(200/3,10),expect.closeTo(600/7,10)]);expect(rsi(bars(Array(20).fill(10))).at(-1)!.value).toBe(50);expect(rsi(bars(ramp)).at(-1)!.value).toBe(100);expect(rsi(bars([...ramp].reverse())).at(-1)!.value).toBe(0);});
 it('Bollinger uses population standard deviation and orders its bands',()=>{const b=bollinger(bars([1,2,3]),3,2);expect(b.middle[0].value).toBe(2);expect(b.upper[0].value).toBeCloseTo(2+2*Math.sqrt(2/3),10);expect(b.lower[0].value).toBeCloseTo(2-2*Math.sqrt(2/3),10);const flat=bollinger(bars(Array(20).fill(5)));expect(flat.upper[0].value).toBe(5);expect(flat.lower[0].value).toBe(5);});
 it('VWAP uses typical price and volume, withholds incomplete sessions and restarts next day',()=>{const c=bars([100,200,300,400],Date.parse('2026-10-29T12:00:00Z')/1000);c[1].volume=30;expect(vwap(c.slice(0,2))[1].value).toBe(175);c[1].volume=null;c[3].time=Date.parse('2026-10-30T12:00:00Z')/1000;expect(vwap(c).map(p=>p.value)).toEqual([100,400]);expect(vwap(c.map(p=>({...p,volume:0})))).toEqual([]);});
 it('COMEX VWAP carries across midnight and resets at the next 18:00 New York session',()=>{
  const times=['2026-10-29T22:00:00Z','2026-10-30T03:55:00Z','2026-10-30T04:05:00Z','2026-10-30T22:00:00Z'];
  const c=bars([100,200,300,400]).map((b,i)=>({...b,time:Date.parse(times[i])/1000,volume:i===1?30:10}));
  expect(vwap(c,'America/New_York',18).map(p=>p.value)).toEqual([100,175,200,400]);
 });
 it('spot tick weighting uses its own 17:00 anchor, not the COMEX anchor',()=>{
  const times=['2026-10-29T20:55:00Z','2026-10-29T21:00:00Z','2026-10-30T03:55:00Z','2026-10-30T04:05:00Z'];
  const c=bars([100,200,300,400]).map((b,i)=>({...b,time:Date.parse(times[i])/1000}));
  expect(vwap(c,'America/New_York',17).map(p=>p.value)).toEqual([100,200,250,300]);
 });
 it.each([['2026-10-29T21:55:00Z','2026-10-29T22:00:00Z'],['2026-11-02T22:55:00Z','2026-11-02T23:00:00Z']])('honors New York DST for a metal session boundary %s', (a,b)=>{
  const c=bars([100,200]).map((c,i)=>({...c,time:Date.parse([a,b][i])/1000}));expect(vwap(c,'America/New_York',18).map(p=>p.value)).toEqual([100,200]);
 });
 it('missing metal volume invalidates the session through midnight and recovers only at its anchor',()=>{
  const times=['2026-10-29T22:00:00Z','2026-10-30T03:55:00Z','2026-10-30T04:05:00Z','2026-10-30T22:00:00Z'];
  const c=bars([100,200,300,400]).map((b,i)=>({...b,time:Date.parse(times[i])/1000,volume:i===1?null:10}));expect(vwap(c,'America/New_York',18).map(p=>p.value)).toEqual([100,400]);
 });
 it.each([-1,24,1.5,NaN])('rejects an invalid VWAP session anchor %s',h=>{expect(()=>vwap(bars([1]),'America/New_York',h)).toThrow('session hour');});
 it('invalid observations restart warm-up without poisoning all future averages',()=>{const c=bars([1,2,3,NaN,5,6,7]);expect(sma(c,3).map(p=>p.value)).toEqual([2,6]);expect(ema(c,3).map(p=>p.value)).toEqual([2,6]);expect(bollinger(c,3).middle.map(p=>p.value)).toEqual([2,6]);expect(rsi(c,2)).toHaveLength(2);});
 for(const period of [0,-1,1.5,NaN,Infinity])it(`rejects invalid period ${period}`,()=>{for(const fn of [sma,ema,rsi,bollinger])expect(()=>fn(bars(ramp),period)).toThrow('period');});
 it('does not use future prices for any visible prefix',()=>{
  const input=bars(ramp.map((v,i)=>v+Math.sin(i)*5));const short=input.slice(0,220),end=short.at(-1)!.time;
  for(const n of [20,50,200]){expect(sma(short,n)).toEqual(sma(input,n).filter(p=>p.time<=end));expect(ema(short,n)).toEqual(ema(input,n).filter(p=>p.time<=end));}
  expect(rsi(short)).toEqual(rsi(input).filter(p=>p.time<=end));expect(bollinger(short).upper).toEqual(bollinger(input).upper.filter(p=>p.time<=end));const a=macd(short),b=macd(input);expect(a.signal).toEqual(b.signal.filter(p=>p.time<=end));expect(vwap(short)).toEqual(vwap(input).filter(p=>p.time<=end));
 });
});
