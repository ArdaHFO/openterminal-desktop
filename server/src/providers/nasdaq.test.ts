import { afterEach, expect, it, vi } from 'vitest';
import { intradayPrices, nasdaqQuoteTime } from './nasdaq.js';

afterEach(() => vi.unstubAllGlobals());
it('returns labelled sampled prices without inventing OHLC or volume', async () => {
  const mock = vi.fn().mockResolvedValueOnce({ok:true, json:async()=>({data:[{symbol:'TESTXYZ',asset:'STOCK'}]})})
    .mockResolvedValueOnce({ok:true, json:async()=>({data:{chart:[{x:Date.parse('2026-10-27T14:47:00Z'),y:123.45}]}})});
  vi.stubGlobal('fetch', mock);
  const points = await intradayPrices('TESTXYZ');
  expect(points).toEqual([{time:Date.parse('2026-10-27T18:47:00Z')/1000,close:123.45,priceOnly:true}]);
  expect(points[0]).not.toHaveProperty('open');
  expect(points[0]).not.toHaveProperty('volume');
});
it('converts Nasdaq Eastern quote timestamps, accounting for daylight saving', () => {
  expect(nasdaqQuoteTime('Oct 27, 2026 4:38 PM ET')).toBe(Date.parse('2026-10-27T20:38:00Z')/1000);
  expect(nasdaqQuoteTime('Jan 27, 2026 4:38 PM ET')).toBe(Date.parse('2026-01-27T21:38:00Z')/1000);
  expect(nasdaqQuoteTime('unknown')).toBeNull();
});
