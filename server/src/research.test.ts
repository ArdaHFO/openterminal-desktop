import {describe,it,expect} from 'vitest';
import {backtest,derivedMetalHistory,tradingDate,validDrawing} from '../../web/lib/research.js';
import {instruments,canonicalSymbol} from './catalog.js';
import {canonicalSymbol as clientCanonical} from '../../web/lib/instruments.js';
import {useTerminal} from '../../web/store/terminal.js';

const bar=(i:number,close:number)=>({time:1780272000+i*86400,open:close,high:close+1,low:close-1,close,volume:100});
const bars=Array.from({length:100},(_,i)=>bar(i,100+15*Math.sin(i/4)));
const settings={fast:3,slow:8,cash:10000,feeBps:10,slippageBps:5};
describe('central instrument catalogue',()=>{
  it('has unique canonical symbols and aliases with identical client/server resolution',()=>{
    const keys=new Set<string>();
    for(const r of instruments)for(const key of [r.symbol,...r.aliases]){expect(keys.has(key)).toBe(false);keys.add(key);expect(canonicalSymbol(key.toLowerCase())).toBe(r.symbol);expect(clientCanonical(key)).toBe(r.symbol);}
  });
  it('retains equity ambiguity boundaries and differentiates units/capabilities',()=>{
    for(const s of ['GOLD','GC','SI','XAU.TO'])expect(canonicalSymbol(s)).toBe(s);
    expect(instruments.find(r=>r.symbol==='XAUUSD')).toMatchObject({kind:'spot',unit:'USD/troy oz',volumeType:'tick',capabilities:{options:false,earnings:false}});
    expect(instruments.find(r=>r.symbol==='GC=F')).toMatchObject({kind:'futures',volumeType:'contracts'});
    expect(instruments.find(r=>r.symbol==='BTC')?.currency).toBe('USDT');
  });
});
describe('causal strategy simulation',()=>{
  it('returns starting cash for empty history and rejects invalid inputs',()=>{
    expect(backtest([],settings).value).toBe(10000);
    for(const bad of [{fast:1},{slow:2},{cash:0},{feeBps:-1},{slippageBps:1001}])expect(()=>backtest(bars,{...settings,...bad})).toThrow();
    expect(()=>backtest([...bars].reverse(),settings)).toThrow();
    expect(()=>backtest([{...bars[0],priceOnly:true}],settings)).toThrow();
  });
  it('executes at the next open with explicit fees and slippage',()=>{
    const result=backtest(bars,settings);expect(result.trades.length).toBeGreaterThan(0);
    const first=result.trades[0],source=bars.find(b=>b.time===first.time)!;
    expect(first.side).toBe('BUY');expect(first.price).toBeCloseTo(source.open*1.0005);
    expect(first.quantity*first.price+first.fee).toBeCloseTo(settings.cash);
    expect(result.fees).toBeGreaterThan(0);expect(result.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
  });
  it('never changes prior fills when unseen future prices change',()=>{
    const prefix=bars.slice(0,45),future=bars.map((b,i)=>i<45?b:{...b,open:b.open*10,high:b.high*10,low:b.low*10,close:b.close*10});
    const before=backtest(prefix,settings),after=backtest(future,settings);
    expect(after.trades.filter(t=>t.time<=prefix.at(-1)!.time)).toEqual(before.trades);
    expect(after.equity.slice(0,45)).toEqual(before.equity);
  });
  it('reduces performance when positive transaction costs are applied',()=>{
    const free=backtest(bars,{...settings,feeBps:0,slippageBps:0});
    expect(backtest(bars,settings).value).toBeLessThan(free.value);
  });
});
describe('derived metal closes',()=>{
  it('matches overnight CFD and futures sessions, including standard time',()=>{
    const a={...bar(0,4000),time:Date.parse('2026-11-02T22:00:00Z')/1000};
    const b={...bar(0,4010),time:Date.parse('2026-11-02T23:00:00Z')/1000};
    expect(tradingDate(a.time,17)).toBe(tradingDate(b.time,18));
    expect(derivedMetalHistory([b],[a],'spread',18,17)).toMatchObject([{close:10,priceOnly:true,volume:null}]);
  });
  it('does not invent missing sessions or divide by zero',()=>{
    expect(derivedMetalHistory([bar(0,4000)],[bar(1,50)],'ratio',17,17)).toEqual([]);
    expect(derivedMetalHistory([bar(0,4000)],[bar(0,0)],'ratio',17,17)).toEqual([]);
    expect(derivedMetalHistory([bar(0,4000)],[bar(0,50)],'ratio',17,17)[0].close).toBe(80);
  });
});
describe('saved workspaces',()=>{
  it('stores independent snapshots and restores symbols, links, layout and lock state',()=>{
    const st=useTerminal.getState();st.setActiveSymbol('XAU');st.setLayoutLocked(true);st.saveWorkspace('QA snapshot');
    const saved=useTerminal.getState().savedWorkspaces.at(-1)!;
    st.addWidget('replay');st.setActiveSymbol('BTC');st.setLayoutLocked(false);st.loadWorkspace(saved.id);
    expect(useTerminal.getState().activeSymbol).toBe('XAUUSD');expect(useTerminal.getState().layoutLocked).toBe(true);
    expect(useTerminal.getState().widgets).toEqual(saved.widgets);expect(useTerminal.getState().widgets).not.toBe(saved.widgets);
    st.renameWorkspace(saved.id,'QA renamed');expect(useTerminal.getState().savedWorkspaces.find(w=>w.id===saved.id)?.name).toBe('QA renamed');
    st.deleteWorkspace(saved.id);expect(useTerminal.getState().widgets).toEqual(saved.widgets);
  });
  it('generates unique widget identifiers during rapid additions',()=>{
    const st=useTerminal.getState();for(let i=0;i<10;i++)st.addWidget('chart');const ids=useTerminal.getState().widgets.map(w=>w.id);expect(new Set(ids).size).toBe(ids.length);
  });
});
describe('drawing validation',()=>{
  it('accepts a finite level and rejects invalid or equal-time trend anchors',()=>{
    expect(validDrawing({id:'a',kind:'horizontal',points:[{time:1780272000,price:20}]})).toBe(true);
    expect(validDrawing({id:'a',kind:'trend',points:[{time:1780272000,price:20},{time:1780272000,price:30}]})).toBe(false);
    expect(validDrawing({id:'a',kind:'measure',points:[{time:1780272000,price:NaN},{time:1780358400,price:30}]})).toBe(false);
  });
});
