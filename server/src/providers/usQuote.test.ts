import { describe, expect, it } from 'vitest';
import { makeUsQuote } from './usQuote.js';

describe('US equity fallback quote', () => {
  const fields = { pro_name:'NASDAQ:AAPL',lp:100,lp_time:1793131502,source2:{name:'Cboe One'},currency_code:'USD',ch:2,chp:2.04,open_price:99,high_price:101,low_price:98,prev_close_price:98,volume:1000 };
  it('keeps the verified listing, source, time and regular-session price', () => {
    expect(makeUsQuote('AAPL','NASDAQ:AAPL',fields)).toMatchObject({symbol:'AAPL',price:100,time:1793131502,source:'TradingView / Cboe One',exchange:'NASDAQ',delayStatus:'unknown'});
  });
  it('rejects a different symbol, missing price, and missing price timestamp', () => {
    expect(() => makeUsQuote('AAPL','NASDAQ:AAPL',{...fields,pro_name:'NASDAQ:MSFT'})).toThrow();
    expect(() => makeUsQuote('AAPL','NASDAQ:AAPL',{...fields,lp:null})).toThrow();
    expect(() => makeUsQuote('AAPL','NASDAQ:AAPL',{...fields,lp_time:0})).toThrow();
  });
  it('does not substitute an after-hours quote or invent unavailable fields', () => {
    const q=makeUsQuote('AAPL','NASDAQ:AAPL',{pro_name:'NASDAQ:AAPL',lp:100,lp_time:1793131502,rtc:104,bid:-2});
    expect(q).toMatchObject({price:100,bid:null,ask:null,volume:null,change:null});
    expect(makeUsQuote('AAPL','NASDAQ:AAPL',{...fields,bid:101,ask:102})).toMatchObject({bid:null,ask:null});
  });
});
