import { describe, expect, it } from 'vitest';
import { makeSpotQuote } from './spotQuote.js';

describe('spot metal quote', () => {
  const fields = { pro_name:'OANDA:XAGUSD', lp:54.25, lp_time:1793131502, bid:54.24, ask:54.26, volume:1234, open_price:53, high_price:55, low_price:52, prev_close_price:53.5, ch:0.75, chp:1.4 };
  it('labels the instrument and tick volume and retains the provider timestamp', () => {
    expect(makeSpotQuote('XAGUSD', fields)).toMatchObject({symbol:'XAGUSD',price:54.25,time:1793131502,source:'TradingView / OANDA',volumeType:'tick',delayStatus:'unknown',bid:54.24,ask:54.26});
  });
  it('rejects mismatched instruments and missing or invalid prices and timestamps', () => {
    expect(() => makeSpotQuote('XAGUSD', {...fields, pro_name:'OANDA:XAUUSD'})).toThrow();
    expect(() => makeSpotQuote('XAGUSD', {...fields, lp:null})).toThrow();
    expect(() => makeSpotQuote('XAGUSD', {...fields, lp_time:0})).toThrow();
  });
  it('does not fabricate values when fields are absent or invalid', () => {
    expect(makeSpotQuote('XAGUSD',{pro_name:'OANDA:XAGUSD',lp:54,lp_time:1793131502,bid:-1,ask:'bad'})).toMatchObject({bid:null,ask:null,volume:null,previousClose:null,change:null});
  });
});
