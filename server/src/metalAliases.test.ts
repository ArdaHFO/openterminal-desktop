import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { normalizeSymbol, normalizeWorkspaceSymbols, symbolsParam } from '../../web/lib/symbol.js';
import { METAL_ALIASES, normalizeMetalSymbol, metalInstrument, searchMetals } from './providers/metalSymbols.js';
import { search } from './providers/tradingview.js';
import * as spot from './providers/spotQuote.js';
import * as history from './providers/fiveDay.js';
import * as yahoo from './providers/yahoo.js';
import * as nasdaq from './providers/nasdaq.js';
import * as stooq from './providers/stooq.js';
import * as news from './providers/news.js';
import * as tradingview from './providers/tradingview.js';

vi.mock('./cache.js', () => ({
  cached: (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  cacheGet: () => undefined, cacheStore: () => {}, staleGet: () => undefined,
}));
import { marketRouter } from './routes/market.js';

const response = () => ({status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis()}) as unknown as Response;
const handler = (path: string) => (marketRouter as any).stack.find((l: any) => l.route?.path === path).route.stack[0].handle;
afterEach(() => vi.restoreAllMocks());

describe('metal symbols across client and server', () => {
  it('canonicalizes every supported alias identically including case and whitespace', () => {
    for (const [alias, canonical] of Object.entries(METAL_ALIASES)) {
      expect(normalizeSymbol(' ' + alias.toLowerCase() + ' ')).toBe(canonical);
      expect(normalizeMetalSymbol(alias)).toBe(canonical);
      expect(metalInstrument(alias)).toEqual(metalInstrument(canonical));
    }
    expect(symbolsParam(['XAU','XAUUSD','XAG/USD','GC1!'])).toBe('XAUUSD,XAGUSD,GC%3DF');
  });
  it('does not redirect actual equities or unknown currency pairs to a metal', () => {
    for (const symbol of ['GOLD','GC','SI','XAU.TO','^XAU','GLD','SLV','XAUJPY']) {
      expect(normalizeSymbol(symbol)).toBe(symbol);
      expect(metalInstrument(symbol)).toBeUndefined();
    }
    expect(normalizeSymbol('UNKNOWN:XAUUSD')).toBeNull();
  });
  it('upgrades saved aliases and deduplicates the watchlist without resetting layout or widget links', () => {
    const saved = {activeSymbol:'XAU',watchlist:['AAPL','XAU','XAUUSD','XAG'],widgets:[{id:'own',symbol:'COMEX:GC1!',linked:false},{id:'linked',linked:true}],layout:[{i:'own',x:3,y:7}],other:'keep'};
    const snapshot = JSON.stringify(saved);
    expect(normalizeWorkspaceSymbols(saved)).toEqual({...saved,activeSymbol:'XAUUSD',watchlist:['AAPL','XAUUSD','XAGUSD'],widgets:[{id:'own',symbol:'GC=F',linked:false},{id:'linked',linked:true}]});
    expect(JSON.stringify(saved)).toBe(snapshot);
  });
  it('finds spot and futures in English and Turkish without requiring search availability', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    for (const [query, symbols] of [['XAU',['XAUUSD']],['XAG',['XAGUSD']],['altın',['XAUUSD','GC=F']],['gümüş',['XAGUSD','SI=F']],['metals',['XAUUSD','XAGUSD','GC=F','SI=F']]] as const) {
      expect(searchMetals(query).map(r=>r.symbol)).toEqual(symbols);
      const res = response();
      await handler('/search')({query:{q:query}}, res);
      expect(res.json).toHaveBeenCalledWith(searchMetals(query));
    }
    expect(await search('XAU')).toEqual(searchMetals('XAU'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('metal routes', () => {
  it('searches metal news by instrument instead of an ambiguous stock ticker', async () => {
    const top=vi.spyOn(news,'topNews').mockResolvedValue([]);
    const stock=vi.spyOn(news,'symbolNews');
    for (const [symbol,query] of [['XAU','gold price'],['XAG','silver price'],['GC=F','gold futures COMEX'],['SI=F','silver futures COMEX']]) {
      const res=response();
      await handler('/news')({query:{symbol}},res);
      expect(top).toHaveBeenLastCalledWith(query);
      expect(res.json).toHaveBeenCalledWith([]);
    }
    expect(stock).not.toHaveBeenCalled();
  });
  it('does not request corporate data or stock options for metals', async () => {
    const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('must not fetch'));
    for (const [path,expected] of [['/insider/:symbol',[]],['/earnings-history/:symbol',[]],['/short-volume/:symbol',null]] as const) {
      const res=response(); await handler(path)({params:{symbol:'XAU'}},res);
      expect(res.json).toHaveBeenCalledWith(expected);
    }
    const opts=response(); await handler('/options/:symbol')({params:{symbol:'SI=F'},query:{}},opts);
    expect(opts.status).toHaveBeenCalledWith(400);
    const cal=response(); await handler('/calendar')({query:{symbols:'XAU,XAG,GC=F,SI=F'}},cal);
    expect(cal.json).toHaveBeenCalledWith([]);
    expect(network).not.toHaveBeenCalled();
  });
  it('keeps actual companies in mixed earnings watchlists', async () => {
    const earnings=vi.spyOn(tradingview,'earningsCalendar').mockResolvedValue([]);
    await handler('/calendar')({query:{symbols:'XAU,AAPL,SI=F'}},response());
    expect(earnings).toHaveBeenCalledExactlyOnceWith(['AAPL']);
  });
  it('shares a single canonical quote for aliases and never asks stock providers for spot metals', async () => {
    const nas = vi.spyOn(nasdaq,'quote');
    const y = vi.spyOn(yahoo,'quotes');
    const st = vi.spyOn(stooq,'quote');
    const quote = spot.makeSpotQuote('XAU',{pro_name:'OANDA:XAUUSD',lp:4000,lp_time:1793188955});
    const tv = vi.spyOn(spot,'spotMetalQuote').mockResolvedValue(quote);
    const res = response();
    await handler('/quotes')({query:{symbols:'XAU,xauusd,OANDA:XAUUSD'}},res);
    expect(tv).toHaveBeenCalledExactlyOnceWith('XAUUSD');
    expect(res.json).toHaveBeenCalledWith([quote]);
    expect(nas).not.toHaveBeenCalled(); expect(y).not.toHaveBeenCalled(); expect(st).not.toHaveBeenCalled();
  });
  it('reports unavailable rather than returning an unrelated asset when the exact spot feed fails', async () => {
    vi.spyOn(spot,'spotMetalQuote').mockRejectedValue(new Error('offline'));
    const stock = vi.spyOn(nasdaq,'quote');
    const res = response();
    await handler('/quotes')({query:{symbols:'XAG'},path:'/quotes'},res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(stock).not.toHaveBeenCalled();
  });
  it('routes all eight metal ranges through the exact canonical instrument', async () => {
    const bar = {time:1793188800,open:4000,high:4001,low:3999,close:4000,volume:10,dataSource:'TradingView / OANDA',timeframe:'5m' as const,delayStatus:'unknown' as const};
    const tv = vi.spyOn(history,'tradingViewHistory').mockResolvedValue([bar]);
    const nas = vi.spyOn(nasdaq,'history');
    for (const range of ['1D','5D','1M','6M','YTD','1Y','5Y','MAX']) {
      const res = response();
      await handler('/history/:symbol')({params:{symbol:'xau'},query:{range}},res);
      expect(tv).toHaveBeenLastCalledWith('XAUUSD',range);
      expect(res.json).toHaveBeenCalledWith([bar]);
    }
    expect(nas).not.toHaveBeenCalled();
  });
  it('falls back from a failed futures feed to labelled Yahoo candles without querying stock history', async () => {
    vi.spyOn(history,'tradingViewHistory').mockRejectedValue(new Error('offline'));
    const y = vi.spyOn(yahoo,'history').mockResolvedValue([{time:1793188800,open:54,high:55,low:53,close:54,volume:20}]);
    const nas = vi.spyOn(nasdaq,'history');
    const res = response();
    await handler('/history/:symbol')({params:{symbol:'SI1!'},query:{range:'5D'}},res);
    expect(y).toHaveBeenCalledWith('SI=F','5d','15m');
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({dataSource:'Yahoo Finance (SI=F)',timeframe:'15m',volumeType:'contracts'})]);
    expect(nas).not.toHaveBeenCalled();
  });
});
