import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { marketRouter, buildRecapSummary } from "./market.js";
import * as yahoo from '../providers/yahoo.js';
import * as fallback from '../providers/fiveDay.js';
import * as spot from '../providers/spotQuote.js';
import * as stooq from '../providers/stooq.js';
import * as nasdaq from '../providers/nasdaq.js';
import * as us from '../providers/usQuote.js';
import * as futures from '../providers/futuresQuote.js';

function fakeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function getHandler(path: string) {
  const layer = (marketRouter as any).stack.find((l: any) => l.route?.path === path);
  if (!layer) throw new Error(`no route registered for ${path}`);
  return layer.route.stack[0].handle as (req: Request, res: Response, next: () => void) => unknown;
}

describe("GET /crypto/orderbook/:symbol", () => {
  it("rejects a symbol outside the supported crypto whitelist with 400, before touching the network", async () => {
    const handler = getHandler("/crypto/orderbook/:symbol");
    const req = { params: { symbol: "AAA&limit=5000" } } as unknown as Request;
    const res = fakeRes();

    await handler(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "unsupported crypto symbol" });
  });

  it("accepts a whitelisted symbol (case-insensitive) and proceeds past validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bids: [], asks: [] }) })
    );
    try {
      const handler = getHandler("/crypto/orderbook/:symbol");
      const req = { params: { symbol: "btc" } } as unknown as Request;
      const res = fakeRes();

      await handler(req, res, () => {});

      expect(res.status).not.toHaveBeenCalledWith(400);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('5D stock fallback', () => {
  it('uses the labelled 15-minute fallback when Yahoo is rate-limited', async () => {
    const y = vi.spyOn(yahoo, 'history').mockRejectedValue(new Error('429'));
    const candle = {time:1793129400,open:10,high:11,low:9,close:10,volume:50,dataSource:'TradingView / Cboe One',timeframe:'15m' as const,delayStatus:'unknown' as const};
    const f = vi.spyOn(fallback, 'fiveDayHistory').mockResolvedValue([candle]);
    try {
      const res = fakeRes();
      await getHandler('/history/:symbol')({params:{symbol:'FALLBACK_TEST'},query:{range:'5D'}} as unknown as Request,res,()=>{});
      expect(f).toHaveBeenCalledWith('FALLBACK_TEST');
      expect(res.json).toHaveBeenCalledWith([candle]);
    } finally { y.mockRestore(); f.mockRestore(); }
  });
});

describe('6M history fallback', () => {
  it('uses daily TradingView data when Nasdaq returns no bars and Yahoo fails', async () => {
    const n = vi.spyOn(nasdaq, 'history').mockResolvedValue([]);
    const y = vi.spyOn(yahoo, 'history').mockRejectedValue(new Error('503'));
    const candle = {time:1793068800,open:10,high:11,low:9,close:10,volume:50,dataSource:'TradingView / Cboe One',timeframe:'1d' as const,delayStatus:'unknown' as const};
    const tv = vi.spyOn(fallback, 'sixMonthHistory').mockResolvedValue([candle]);
    try {
      const res = fakeRes();
      await getHandler('/history/:symbol')({params:{symbol:'SIXMONTH_TEST'},query:{range:'6M'}} as unknown as Request,res,()=>{});
      expect(tv).toHaveBeenCalledWith('SIXMONTH_TEST');
      expect(res.json).toHaveBeenCalledWith([candle]);
    } finally { n.mockRestore(); y.mockRestore(); tv.mockRestore(); }
  });
});

describe('spot metal quote feed', () => {
  it('uses the exact OANDA quote without misrouting through stock providers', async () => {
    const batch = vi.spyOn(yahoo, 'quotes').mockRejectedValue(new Error('503'));
    const chart = vi.spyOn(yahoo, 'quoteFromChart').mockRejectedValue(new Error('503'));
    const nas = vi.spyOn(nasdaq, 'quote');
    const st = vi.spyOn(stooq, 'quote');
    const quote = spot.makeSpotQuote('XAGUSD', {pro_name:'OANDA:XAGUSD',lp:54.25,lp_time:1793131502});
    const metal = vi.spyOn(spot, 'spotMetalQuote').mockResolvedValue(quote);
    try {
      const res = fakeRes();
      await getHandler('/quotes')({query:{symbols:'XAGUSD'}} as unknown as Request,res,()=>{});
      expect(batch).not.toHaveBeenCalled();
      expect(chart).not.toHaveBeenCalled();
      expect(metal).toHaveBeenCalledWith('XAGUSD');
      expect(nas).not.toHaveBeenCalled();
      expect(st).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith([quote]);
    } finally { batch.mockRestore(); chart.mockRestore(); nas.mockRestore(); st.mockRestore(); metal.mockRestore(); }
  });
});

describe('US stock quote fallback', () => {
  it('falls back when Nasdaq has no price and Yahoo fails, including a batch', async () => {
    const nas = vi.spyOn(nasdaq, 'quote').mockImplementation(async symbol => ({symbol, price:null} as yahoo.Quote));
    const batch = vi.spyOn(yahoo, 'quotes').mockRejectedValue(new Error('503'));
    const chart = vi.spyOn(yahoo, 'quoteFromChart').mockRejectedValue(new Error('503'));
    const st = vi.spyOn(stooq, 'quote');
    const quotes = ['AAPL','MSFT'].map(symbol => us.makeUsQuote(symbol, `NASDAQ:${symbol}`, {pro_name:`NASDAQ:${symbol}`,lp:100,lp_time:1793131502}));
    const tv = vi.spyOn(us, 'usQuote').mockImplementation(async symbol => quotes.find(q=>q.symbol===symbol)!);
    try {
      const res = fakeRes();
      await getHandler('/quotes')({query:{symbols:'AAPL,MSFT'}} as unknown as Request,res,()=>{});
      expect(tv).toHaveBeenCalledTimes(2);
      expect(st).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(quotes);
    } finally { nas.mockRestore(); batch.mockRestore(); chart.mockRestore(); st.mockRestore(); tv.mockRestore(); }
  });
});

describe('metal futures quote fallback', () => {
  it('uses the identified COMEX proxy when Yahoo fails', async () => {
    const y = vi.spyOn(yahoo,'quotes').mockRejectedValue(new Error('503'));
    const yc = vi.spyOn(yahoo,'quoteFromChart').mockRejectedValue(new Error('503'));
    const nas = vi.spyOn(nasdaq,'quote');
    const st = vi.spyOn(stooq,'quote');
    const quote=futures.makeFuturesQuote('SI=F',{pro_name:'COMEX:SI1!',lp:54,lp_time:1793133660});
    const f=vi.spyOn(futures,'metalFuturesQuote').mockResolvedValue(quote);
    try {
      const res=fakeRes();
      await getHandler('/quotes')({query:{symbols:'SI=F'}} as unknown as Request,res,()=>{});
      expect(f).toHaveBeenCalledWith('SI=F');
      expect(nas).not.toHaveBeenCalled();
      expect(st).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith([quote]);
    } finally {y.mockRestore();yc.mockRestore();nas.mockRestore();st.mockRestore();f.mockRestore();}
  });
  it('does not substitute an unrelated quote when the metal proxy also fails', async () => {
    const y = vi.spyOn(yahoo,'quotes').mockRejectedValue(new Error('503'));
    const yc = vi.spyOn(yahoo,'quoteFromChart').mockRejectedValue(new Error('503'));
    const st = vi.spyOn(stooq,'quote');
    const f = vi.spyOn(futures,'metalFuturesQuote').mockRejectedValue(new Error('unavailable'));
    try {
      const res=fakeRes();
      await getHandler('/quotes')({query:{symbols:'GC=F'},path:'/quotes'} as unknown as Request,res,()=>{});
      expect(st).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(502);
    } finally {y.mockRestore();yc.mockRestore();st.mockRestore();f.mockRestore();}
  });
});

describe('intraday replay request validation',()=>{
  it.each([['1Y','15m'],['MAX','4h'],['1M','1d'],['1M','__proto__']])('rejects range %s interval %s before provider access',async(range,interval)=>{
    const res=fakeRes();await getHandler('/history/:symbol')({params:{symbol:'AAPL'},query:{range,interval}} as unknown as Request,res,()=>{});
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('screener parameter and recap missing-data handling',()=>{
  it.each([{volumeMin:'NaN'},{marketCapMin:'-1'},{changeMin:'abc'},{sort:'invalid'},{dir:'invalid'}])('rejects invalid filters before calling providers',async query=>{const res=fakeRes();await getHandler('/screener')({query} as unknown as Request,res,()=>{});expect(res.status).toHaveBeenCalledWith(400);});
  it('does not describe missing index prices as flat performance',()=>{const summary=buildRecapSummary({indexes:[],gainers:[],losers:[],vix:null});expect(summary).toContain('unavailable');expect(summary).not.toContain('flat');expect(summary).not.toContain('little changed');});
});
