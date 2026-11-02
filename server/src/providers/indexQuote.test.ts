import { expect, it } from 'vitest';
import { makeVixQuote } from './indexQuote.js';
it('validates VIX identity and reports provider delay without fabricated volume', () => {
  const fields={pro_name:'CBOE:VIX',lp:17.52,lp_time:1793132101,update_mode:'delayed_streaming_900',volume:1e100};
  expect(makeVixQuote(fields)).toMatchObject({symbol:'^VIX',price:17.52,time:1793132101,volume:null,delayStatus:'delayed',delaySeconds:900});
  expect(()=>makeVixQuote({...fields,pro_name:'CBOE:OTHER'})).toThrow();
});
