// Opt-in captured-live outage matrix, independent Python expected values.
// Histories are REAL snapshots from the isolated 503 API. Other widgets are stubbed.
import {test,expect} from '@playwright/test';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve('outputs/indicator-outage');
const captures=readdirSync(resolve(out,'datasets')).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(readFileSync(resolve(out,'datasets',n),'utf8')));
if(captures.length!==56||captures.some(c=>!c.expected))throw new Error('Run the 56 live captures and independent Python oracle first');
const keys=['SMA20','SMA50','SMA200','EMA20','RSI','BOLL','MACD','VWAP'];
for(const capture of captures)test(`${capture.symbol} ${capture.range} all eight indicators during Yahoo+Nasdaq outage`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());const p=u.pathname;let body:any=[];
  if(p.startsWith('/api/history/'))body=capture.data;
  else if(p==='/api/status')body={ok:true,ai:false,providers:[]};
  else if(p==='/api/search')body=[{symbol:capture.symbol,name:'Outage capture '+capture.symbol,exchange:'AUDIT',type:'captured live'}];
  else if(p==='/api/quotes')body=(u.searchParams.get('symbols')??'').split(',').map(symbol=>({symbol,price:100,source:'Synthetic ancillary quote',name:symbol,currency:'USD'}));
  else if(p==='/api/macro')body={indexes:[],yields:[],vix:null,policyRate:null,inflation:null};
  else if(p.startsWith('/api/short-volume/'))body=null;
  await route.fulfill({json:body});
 });
 await page.goto('/');let panel=page.locator('[data-widget-id="w-chart"]');
 if(capture.symbol!=='AAPL'){
  await page.getByRole('button',{name:/search symbol/}).click();const input=page.getByPlaceholder(/Ticker, metal/);await input.fill(capture.symbol);
  await expect(page.getByText('Outage capture '+capture.symbol,{exact:true})).toBeVisible();await input.press('Enter');
  await expect(page.getByRole('button',{name:new RegExp(capture.symbol.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'.*search symbol')})).toBeVisible();
 }
 await panel.getByRole('button',{name:capture.range,exact:true}).click();
 await expect(panel.getByTestId('chart-history-count')).toHaveText(`${capture.data.candles.length} visible candles · ${capture.data.context.length} earlier candles for indicators`);
 await expect(panel.getByText(new RegExp(capture.data.candles[0].dataSource.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))).toBeVisible();
 await panel.getByRole('button',{name:'Maximize widget',exact:true}).click();panel=page.locator('.terminal-panel').filter({has:page.getByRole('button',{name:'Restore widget',exact:true})});
 const finalTime=capture.data.candles.at(-1).time;
 const last=(key:string)=>capture.expected[key].find((p:any)=>p.time===finalTime)?.value;
 for(const key of keys){
  const button=panel.getByRole('button',{name:key,exact:true});if(await button.getAttribute('aria-pressed')!=='true')await button.click();
  const seriesKeys=key==='BOLL'?['BOLL_U','BOLL_M','BOLL_L']:key==='MACD'?['MACD','SIGNAL','HIST']:[key];
  const expected=seriesKeys.map(last);const legend=panel.getByTestId(`indicator-${key}-value`);
  if(expected[0]===undefined){
   await expect(legend).toHaveCount(0);
   if(key==='VWAP'){
    if(capture.data.candles[0].vwapUnavailable)await expect(panel.getByText('Session VWAP unavailable for this feed.',{exact:true})).toBeVisible();
    else if(!capture.eligible)await expect(panel.getByText('Session VWAP requires intraday candles.',{exact:true})).toBeVisible();
    else await expect(panel.getByTestId('indicator-VWAP-notice')).toBeVisible();
   }else await expect(panel.getByTestId(`indicator-${key}-notice`)).toBeVisible();
  }else{
   await expect(legend).toBeVisible();const text=(await legend.innerText()).slice(key.length).replaceAll(',','');
   const actual=(text.match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
   expect(actual.length,key).toBe(expected.filter(v=>v!==undefined).length);
   expected.forEach((v:number|undefined,i:number)=>{if(v!==undefined)expect(Math.abs(actual[i]-v),`${capture.id} ${key} component ${i}`).toBeLessThan(key==='RSI'?0.051:0.0051);});
  }
  await expect(panel.getByTestId('price-chart').locator('canvas').first()).toBeVisible();
  await button.click();await expect(button).toHaveAttribute('aria-pressed','false');await expect(legend).toHaveCount(0);await button.click();
 }
 expect(errors).toEqual([]);
 if(['AAPL-6M','MSFT-1D','XAUUSD-6M','XAGUSD-1D','GC_F-6M','SI_F-1D'].includes(capture.id))await page.screenshot({path:resolve(out,`${info.project.name}-${capture.id}.png`)});
});
