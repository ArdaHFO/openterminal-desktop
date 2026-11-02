import {test,expect,type Page} from '@playwright/test';
type Mode='normal'|'short'|'exact200'|'exact26'|'zeroVolume'|'missingVolume'|'metal'|'priceOnly'|'error';
let mode:Mode='normal';const requested:string[]=[];
function dataset(symbol:string,range:string,warmup:number){
 const intraday=range==='1D'||range==='5D',step=intraday?300:86400;const count=mode==='short'?126:mode==='exact200'?200:mode==='exact26'?26:126;
 const visibleStart=499;const time=(i:number)=>1704067200+i*step;
 const candle=(i:number)=>{
  const base=symbol==='XAUUSD'?4000:symbol==='XAGUSD'?50:symbol==='GC=F'?4010:symbol==='SI=F'?51:0;
  const value=base+(base?i/100:i+1);return {time:time(i),open:value,high:value+1,low:value-1,close:value,volume:mode==='zeroVolume'?0:mode==='missingVolume'?null:10,dataSource:mode==='priceOnly'?'FRED daily close':'Synthetic indicator reference',timeframe:intraday?'5m':'1d',...(mode==='metal'?{volumeType:'tick',vwapUnavailable:true}:{}),...(mode==='priceOnly'?{priceOnly:true,volume:null,vwapUnavailable:true}:{})};
 };
 if(mode==='short'||mode==='exact200'||mode==='exact26')return {candles:Array.from({length:count},(_,i)=>({...candle(i),close:i+1,open:i+1,high:i+2,low:i})),context:[],requestedWarmup:warmup};
 return {candles:Array.from({length:126},(_,i)=>candle(visibleStart+i)),context:Array.from({length:warmup},(_,i)=>candle(visibleStart-warmup+i)),requestedWarmup:warmup};
}
async function setup(page:Page){mode='normal';requested.length=0;
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url()),p=u.pathname;let body:any=[];
  if(p==='/api/status')body={ok:true,ai:false,providers:[]};
  else if(p.startsWith('/api/history/')){requested.push(u.search);if(mode==='error')return r.fulfill({status:502,json:{error:'Synthetic indicator history outage'}});const symbol=decodeURIComponent(p.split('/').at(-1)!);body=u.searchParams.has('warmup')?dataset(symbol,u.searchParams.get('range')??'6M',Number(u.searchParams.get('warmup'))):Array.from({length:mode==='short'?30:240},(_,i)=>({time:1704067200+i*86400,open:i+1,high:i+2,low:i,close:i+1,volume:10,dataSource:'Synthetic replay',timeframe:'1d'}));}
  else if(p==='/api/quotes')body=(u.searchParams.get('symbols')??'').split(',').map(symbol=>({symbol,name:symbol,price:symbol==='XAUUSD'?4000:symbol==='XAGUSD'?50:120,change:1,changePercent:1,volume:10,source:'Synthetic',currency:'USD',time:1793275200}));
  else if(p==='/api/macro')body={yields:[],indexes:[],vix:null,policyRate:null,inflation:null};
  else if(p.startsWith('/api/short-volume/'))body=null;
  await r.fulfill({json:body});
 });await page.goto('/');await expect(chart(page).locator('canvas').first()).toBeVisible();
}
const chart=(p:Page)=>p.locator('[data-widget-id="w-chart"]');
test.beforeEach(async({page})=>setup(page));
for(const [key,label,value] of [['SMA20','SMA20','615.50'],['SMA50','SMA50','600.50'],['SMA200','SMA200','525.50'],['EMA20','EMA20','615.50'],['RSI','RSI','100.0'],['BOLL','BOLL','615.50'],['MACD','MACD','7.00']])test(`${key} has the expected value on a 126-candle chart with prior context`,async({page})=>{
 const p=chart(page);if(key!=='SMA20')await p.getByRole('button',{name:key,exact:true}).click();await expect(p.getByTestId(`indicator-${label}-value`)).toContainText(value);await expect(p.getByTestId(`indicator-${key}-notice`)).toHaveCount(0);await expect(p.getByTestId('chart-history-count')).toHaveText('126 visible candles · 199 earlier candles for indicators');
 await p.getByRole('button',{name:key,exact:true}).click();await expect(p.getByTestId(`indicator-${label}-value`)).toHaveCount(0);await expect(p.getByRole('button',{name:key,exact:true})).toHaveAttribute('aria-pressed','false');
});
test('VWAP works with intraday volume and is explicit about daily unavailability',async({page})=>{
 const p=chart(page);await p.getByRole('button',{name:'VWAP',exact:true}).click();await expect(p.getByText('Session VWAP requires intraday candles.')).toBeVisible();await p.getByRole('button',{name:'1D',exact:true}).click();await expect(p.getByTestId('indicator-VWAP-value')).toBeVisible();await expect(p.getByTestId('indicator-VWAP-notice')).toHaveCount(0);
});
test('SMA200 with insufficient history reports the exact missing requirement',async({page})=>{
 mode='short';const p=chart(page);await p.getByRole('button',{name:'1Y',exact:true}).click();await p.getByRole('button',{name:'SMA200',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-notice')).toContainText('200 candles; 126 available');await expect(p.getByTestId('indicator-SMA200-value')).toHaveCount(0);await expect(p.locator('canvas').first()).toBeVisible();
});
test('exactly 200 candles produces a valid SMA200 single point',async({page})=>{
 mode='exact200';const p=chart(page);await p.getByRole('button',{name:'1Y',exact:true}).click();await p.getByRole('button',{name:'SMA200',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-value')).toHaveText('SMA200 100.50');await expect(p.getByTestId('indicator-SMA200-notice')).toHaveCount(0);await expect(p.locator('canvas').first()).toBeVisible();
});
test('SMA500 settings request 499 earlier candles and preserve visible prices',async({page})=>{
 const p=chart(page);await p.getByRole('button',{name:'SMA200',exact:true}).click();await p.getByText('Indicator settings / saved drawings (0)',{exact:true}).click();await p.getByLabel('Long SMA',{exact:true}).fill('500');await expect.poll(()=>requested.some(q=>q.includes('warmup=499'))).toBe(true);await expect(p.getByTestId('indicator-SMA500-value')).toHaveText('SMA500 375.50');await expect(p.getByTestId('chart-history-count')).toHaveText('126 visible candles · 499 earlier candles for indicators');
});
for(const selected of ['zeroVolume','missingVolume'] as const)test(`VWAP ${selected} never silently draws a made-up value`,async({page})=>{
 mode=selected;const p=chart(page);await p.getByRole('button',{name:'1D',exact:true}).click();await p.getByRole('button',{name:'VWAP',exact:true}).click();await expect(p.getByTestId('indicator-VWAP-notice')).toContainText('volume is missing, invalid or zero');await expect(p.getByTestId('indicator-VWAP-value')).toHaveCount(0);await p.getByRole('button',{name:'SMA200',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-value')).toBeVisible();
});
test('close-only index feeds support close-based indicators but do not invent VWAP',async({page})=>{
 mode='priceOnly';const p=chart(page);await p.getByRole('button',{name:'1Y',exact:true}).click();await p.getByRole('button',{name:'SMA200',exact:true}).click();await p.getByRole('button',{name:'RSI',exact:true}).click();await p.getByRole('button',{name:'VWAP',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-value')).toBeVisible();await expect(p.getByTestId('indicator-RSI-value')).toBeVisible();await expect(p.getByRole('button',{name:'CANDLES',exact:true})).toBeDisabled();await expect(p.getByText('Session VWAP unavailable: the sampled price feed has no per-point volume.')).toBeVisible();
});
test('replay SMA200 uses only the shown prefix and becomes ready after enough candles',async({page})=>{
 await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();const p=page.locator('[data-widget-id]').last();await expect(p.getByTestId('replay-counter')).toHaveText('50 / 240 candles');await p.getByRole('button',{name:'SMA200',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-notice')).toContainText('50 available. Advance replay');await expect(p.getByTestId('indicator-SMA200-value')).toHaveCount(0);await p.getByLabel('Replay position').press('End');await expect(p.getByTestId('replay-counter')).toHaveText('240 / 240 candles');await expect(p.getByTestId('indicator-SMA200-value')).toHaveText('SMA200 140.50');await p.getByRole('button',{name:'Reset replay',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-value')).toHaveCount(0);
});
test('metal derived ratios use prior aligned sessions for SMA200',async({page})=>{
 mode='metal';await page.getByRole('button',{name:'METAL ANALYSIS',exact:true}).click();const p=page.locator('[data-widget-id]').last();await p.getByRole('button',{name:'SMA200',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-value')).toBeVisible();await expect(p.getByTestId('chart-history-count')).toHaveText('126 visible candles · 499 earlier candles for indicators');await p.getByRole('button',{name:'VWAP',exact:true}).click();await expect(p.getByTestId('indicator-VWAP-value')).toHaveCount(0);
});
test('indicator history failures are explicit and range recovery works',async({page})=>{
 mode='error';const p=chart(page);await p.getByRole('button',{name:'1Y',exact:true}).click();await expect(p.getByText(/Synthetic indicator history outage/)).toBeVisible();mode='normal';await p.getByRole('button',{name:'5Y',exact:true}).click();await p.getByRole('button',{name:'SMA200',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-value')).toBeVisible();
});

test('a replay shorter than 200 bars explains that advancing alone cannot produce SMA200',async({page})=>{
 mode='short';await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();const p=page.locator('[data-widget-id]').last();await expect(p.getByTestId('replay-counter')).toHaveText('15 / 30 candles');await p.getByRole('button',{name:'SMA200',exact:true}).click();await expect(p.getByTestId('indicator-SMA200-notice')).toContainText('Loaded replay has only 30 candles; choose a longer history or shorter period');await p.getByLabel('Replay position').press('End');await expect(p.getByTestId('indicator-SMA200-value')).toHaveCount(0);
});
test('equal custom moving-average periods keep separate slots without duplicate React keys',async({page})=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});const p=chart(page);await p.getByRole('button',{name:'SMA50',exact:true}).click();await p.getByText('Indicator settings / saved drawings (0)',{exact:true}).click();await p.getByLabel('Slow SMA',{exact:true}).fill('20');await expect(p.getByTestId('indicator-SMA20-value')).toHaveCount(2);expect(errors.some(e=>e.includes('same key'))).toBe(false);
});

test('MACD first line point is distinct from the later signal warm-up',async({page})=>{
 mode='exact26';const p=chart(page);await p.getByRole('button',{name:'1Y',exact:true}).click();await p.getByRole('button',{name:'MACD',exact:true}).click();await expect(p.getByTestId('indicator-MACD-value')).toContainText('7.00 / — / —');await expect(p.getByTestId('indicator-MACD-notice')).toContainText('34 candles; 26 available');await expect(p.locator('canvas').first()).toBeVisible();
});
