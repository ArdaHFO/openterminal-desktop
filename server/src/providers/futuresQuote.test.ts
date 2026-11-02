import { describe, expect, it } from 'vitest';
import { makeFuturesQuote, labelYahooFuturesQuote } from './futuresQuote.js';

describe('metal futures quote', () => {
  it('labels Yahoo contracts without pretending to know the delay or mixing bid/ask snapshots', () => {
    const q=makeFuturesQuote('GC=F',{pro_name:'COMEX:GC1!',lp:4000,lp_time:1793188955});
    const result=labelYahooFuturesQuote({...q,name:'Gold Dec 26',source:'yahoo',bid:3999,ask:4001,marketCap:123,pe:5});
    expect(result).toMatchObject({symbol:'GC=F',source:'yahoo',name:'Gold Dec 26',price:4000,time:1793188955,volumeType:'contracts',delayStatus:'unknown',bid:null,ask:null,marketCap:null,pe:null});
    expect(result.instrumentNote).toContain('Gold Dec 26');
    expect(result.instrumentNote).toContain('USD per troy ounce');
  });
  const data = {pro_name:'COMEX:SI1!',lp:54.515,lp_time:1793133660,front_contract:'SIZ2026',update_mode:'delayed_streaming_600',volume:39083,open_price:54.075,high_price:54.64,low_price:52.71,bid:54.51,ask:54.52};
  it('identifies the proxy, front contract, delay and original timestamp', () => {
    expect(makeFuturesQuote('SI=F',data)).toMatchObject({symbol:'SI=F',price:54.515,time:1793133660,source:'TradingView / COMEX',delayStatus:'delayed',delaySeconds:600,volume:39083,bid:null,ask:null});
    expect(makeFuturesQuote('SI=F',data).instrumentNote).toContain('SIZ2026');
  });
  it('rejects wrong identity and invalid price or timestamp', () => {
    expect(() => makeFuturesQuote('SI=F',{...data,pro_name:'COMEX:GC1!'})).toThrow();
    expect(() => makeFuturesQuote('SI=F',{...data,lp:null})).toThrow();
    expect(() => makeFuturesQuote('SI=F',{...data,lp_time:0})).toThrow();
  });
  it('does not invent a contract or delay when not supplied', () => {
    const q=makeFuturesQuote('SI=F',{pro_name:'COMEX:SI1!',lp:50,lp_time:1793133660,front_contract:'GCZ2026'});
    expect(q.instrumentNote).toContain('front contract unavailable');
    expect(q.delayStatus).toBe('unknown');
    expect(q.delaySeconds).toBeUndefined();
  });
});
