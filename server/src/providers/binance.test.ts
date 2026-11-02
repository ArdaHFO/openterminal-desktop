import { afterEach, describe, expect, it, vi } from "vitest";
import { history, orderBook, quote } from "./binance.js";

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("binance provider URL encoding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("encodes query-string-breaking characters in orderBook's symbol", async () => {
    const fetchMock = mockFetchOnce({ bids: [], asks: [] });
    await orderBook("AAA&limit=5000");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("&limit=5000USDT");
    expect(url).toContain("symbol=" + encodeURIComponent("AAA&limit=5000".toUpperCase() + "USDT"));
    // exactly one `&` (the intended separator before &limit=20) survives unescaped
    expect(url.split("&").length).toBe(2);
  });

  it("encodes the symbol in quote()", async () => {
    const fetchMock = mockFetchOnce({
      lastPrice: "1", priceChange: "0", priceChangePercent: "0", openPrice: "1",
      highPrice: "1", lowPrice: "1", prevClosePrice: "1", bidPrice: "1", askPrice: "1", volume: "1", closeTime:1793130000000,
    });
    const result = await quote("AAA#bogus");
    expect(result.currency).toBe('USDT');
    expect(result.time).toBe(1793130000);
    expect(result.instrumentNote).toContain('rolling 24h');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("AAA#bogus".toUpperCase() + "USDT"));
    expect(url).not.toContain("#bogus");
  });

  it("encodes the symbol in history()", async () => {
    const fetchMock = mockFetchOnce([]);
    await history("AAA&x=1", "6M");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("AAA&x=1".toUpperCase() + "USDT"));
    expect(url.split("&").length).toBe(3); // symbol, interval, limit only
  });

  it('trims YTD to January 1 and never asks for more than 1000 six-month candles', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
    const row = (date: string) => [Date.parse(date), '1', '1', '1', '1', '1'];
    const fetchMock = mockFetchOnce([row('2025-12-31T00:00:00Z'), row('2026-01-01T00:00:00Z')]);
    const result = await history('BTC','YTD');
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(Date.parse('2026-01-01T00:00:00Z')/1000);
    await history('BTC','6M');
    const u = new URL(fetchMock.mock.calls[1][0] as string);
    expect(Number(u.searchParams.get('limit'))).toBeLessThanOrEqual(1000);
  });
});
