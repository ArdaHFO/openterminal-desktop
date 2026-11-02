import {test,expect,type Page} from '@playwright/test';
const symbols=['XAUUSD','XAGUSD','GC=F','SI=F'];
function data(symbol:string,range:string,missing=false){
 const tick=!symbol.includes('='),start=tick?17:18,base=Date.parse(`2026-10-28T${start+4}:00:00Z`)/1000;
 const intraday=['1D','5D','1M'].includes(range),timeframe=range==='1M'?'1h':range==='5D'?'15m':range==='1D'?'5m':'1d';
 return {candles:[100,200,300,400].map((close,i)=>({time:base+[0,5*3600,6*3600,7*3600][i],open:close,high:close+1,low:close-1,close,volume:missing&&i===1?null:[1,3,2,4][i],dataSource:tick?`TradingView / OANDA (OANDA:${symbol})`:'TradingView / COMEX',timeframe,volumeType:tick?'tick':'contracts',vwapUnavailable:false,vwapSessionStart:start})),context:[],requestedWarmup:199};
}
async function setup(page:Page,symbol:string,mode:{missing:boolean}){
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url()),p=u.pathname;let body:any=[];
  if(p==='/api/status')body={ok:true,providers:[],ai:false};
  else if(p==='/api/search')body=[{symbol,name:'Metal VWAP fixture '+symbol,exchange:'TEST',type:'commodity'}];
  else if(p.startsWith('/api/history/')){
   const range=u.searchParams.get('range')??'6M';
   if(!u.searchParams.has('warmup'))body=Array.from({length:240},(_,i)=>{const close=i<50?100:200;return {...data(symbol,'5D').candles[0],time:Date.parse('2026-10-26T22:00:00Z')/1000+i*900,open:close,high:close+1,low:close-1,close,volume:10,timeframe:u.searchParams.get('interval')??'1d'};});
   else body=data(symbol,range,mode.missing);
  }else if(p==='/api/quotes')body=(u.searchParams.get('symbols')??'').split(',').map(symbol=>({symbol,name:symbol,price:100,source:'Synthetic test quote',currency:'USD'}));
  else if(p==='/api/macro')body={indexes:[],yields:[],vix:null,policyRate:null,inflation:null};
  else if(p.startsWith('/api/short-volume/'))body=null;
  await route.fulfill({json:body});
 });
 await page.goto('/');await page.getByRole('button',{name:/search symbol/}).click();const input=page.getByPlaceholder(/Ticker, metal/);await input.fill(symbol);await expect(page.getByText('Metal VWAP fixture '+symbol,{exact:true})).toBeVisible();await input.press('Enter');
 await expect(page.locator('[data-widget-id="w-chart"]').getByTestId('chart-history-count')).toBeVisible();
}
for(const symbol of symbols)for(const range of ['1D','5D','1M'])test(`${symbol} ${range} uses its own volume and carries VWAP across midnight`,async({page})=>{
 await setup(page,symbol,{missing:false});const p=page.locator('[data-widget-id="w-chart"]');await p.getByRole('button',{name:range,exact:true}).click();await p.getByRole('button',{name:'VWAP',exact:true}).click();
 await expect(p.getByTestId('indicator-VWAP-value')).toHaveText(`${symbol.includes('=')?'VWAP':'Tick VWAP'} 290.00`);
 await expect(p.getByTestId('vwap-method')).toContainText(symbol.includes('=')?'traded contract volume':'price-update counts, not traded volume');
 await expect(p.getByTestId('vwap-method')).toContainText(symbol.includes('=')?'18:00 America/New_York':'17:00 America/New_York');
 await expect(p.getByTestId('indicator-VWAP-notice')).toHaveCount(0);await expect(p.getByTestId('price-chart').locator('canvas').first()).toBeVisible();
 await p.getByRole('button',{name:'VWAP',exact:true}).click();await expect(p.getByTestId('indicator-VWAP-value')).toHaveCount(0);
});
for(const symbol of symbols)test(`${symbol} missing volume withholds VWAP and later clean data recovers`,async({page})=>{
 const mode={missing:true};await setup(page,symbol,mode);const p=page.locator('[data-widget-id="w-chart"]');await p.getByRole('button',{name:'1D',exact:true}).click();await p.getByRole('button',{name:'VWAP',exact:true}).click();await expect(p.getByTestId('indicator-VWAP-notice')).toContainText('volume is missing, invalid or zero');await expect(p.getByTestId('indicator-VWAP-value')).toHaveCount(0);
 mode.missing=false;await p.getByRole('button',{name:'1M',exact:true}).click();await expect(p.getByTestId('indicator-VWAP-value')).toBeVisible();await p.getByRole('button',{name:'6M',exact:true}).click();await expect(p.getByText('Session VWAP requires intraday candles.',{exact:true})).toBeVisible();await expect(p.getByTestId('indicator-VWAP-value')).toHaveCount(0);
});
for(const symbol of ['XAUUSD','GC=F'])test(`${symbol} replay metal VWAP uses only the played prefix`,async({page})=>{
 await setup(page,symbol,{missing:false});await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();const p=page.locator('[data-widget-id]').last();await p.getByLabel('Replay candle interval').selectOption('15m');await expect(p.getByTestId('replay-counter')).toHaveText('50 / 240 candles');await p.getByRole('button',{name:'VWAP',exact:true}).click();await expect(p.getByTestId('indicator-VWAP-value')).toHaveText(`${symbol.includes('=')?'VWAP':'Tick VWAP'} 100.00`);await expect(p.getByText(/earliest session may be partial/)).toBeVisible();await p.getByLabel('Replay position').press('End');await expect(p.getByTestId('indicator-VWAP-value')).toHaveText(`${symbol.includes('=')?'VWAP':'Tick VWAP'} 200.00`);await p.getByRole('button',{name:'Reset replay',exact:true}).click();await expect(p.getByTestId('indicator-VWAP-value')).toHaveText(`${symbol.includes('=')?'VWAP':'Tick VWAP'} 100.00`);
});
