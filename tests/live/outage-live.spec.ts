// Fully integrated history requests: browser -> Next proxy -> isolated HTTP503 API -> live fallback.
// Ancillary widgets and search suggestions are stubbed to keep this indicator audit bounded.
import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const symbols=process.env.LIVE_SYMBOLS?.split(',')??['AAPL','MSFT','NVDA','XAUUSD','XAGUSD','GC=F','SI=F'];
const ranges=process.env.LIVE_RANGES?.split(',')??['6M'];
const out=resolve(process.env.LIVE_AUDIT_DIR??'outputs/indicator-outage');
for(const symbol of symbols)for(const range of ranges)test(`${symbol} ${range} direct live outage chart`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(p.startsWith('/api/history/')||p==='/api/status')return route.continue();
  let body:any=[];
  if(p==='/api/search')body=[{symbol,name:'Live audit '+symbol,exchange:'AUDIT',type:'test suggestion'}];
  else if(p==='/api/quotes')body=(url.searchParams.get('symbols')??'').split(',').map(symbol=>({symbol,price:100,source:'Synthetic ancillary quote',name:symbol,currency:'USD'}));
  else if(p==='/api/macro')body={indexes:[],yields:[],vix:null,policyRate:null,inflation:null};
  else if(p.startsWith('/api/short-volume/'))body=null;
  return route.fulfill({json:body});
 });
 const history=page.waitForResponse(r=>{const u=new URL(r.url());return decodeURIComponent(u.pathname)==='/api/history/'+symbol&&u.searchParams.get('range')===range&&r.ok();});
 await page.goto('/');
 if(symbol!=='AAPL'){
  await page.getByRole('button',{name:/search symbol/}).click();const input=page.getByPlaceholder(/Ticker, metal/);await input.fill(symbol);
  await expect(page.getByText('Live audit '+symbol,{exact:true})).toBeVisible();await input.press('Enter');
 }
 let panel=page.locator('[data-widget-id="w-chart"]');if(range!=='6M')await panel.getByRole('button',{name:range,exact:true}).click();
 const data=await (await history).json();expect(data.candles[0].dataSource).toContain('TradingView');expect(data.context).toHaveLength(199);
 await expect(panel.getByTestId('chart-history-count')).toHaveText(`${data.candles.length} visible candles · 199 earlier candles for indicators`);
 await panel.getByRole('button',{name:'Maximize widget',exact:true}).click();panel=page.locator('.terminal-panel').filter({has:page.getByRole('button',{name:'Restore widget',exact:true})});
 for(const key of ['SMA20','SMA50','SMA200','EMA20','RSI','BOLL','MACD']){
  const b=panel.getByRole('button',{name:key,exact:true});if(await b.getAttribute('aria-pressed')!=='true')await b.click();
  await expect(panel.getByTestId(`indicator-${key}-value`)).toBeVisible();await expect(panel.getByTestId(`indicator-${key}-notice`)).toHaveCount(0);
 }
 const id=symbol.replace('=','_')+'-'+range,responseFile=resolve(out,`live-${id}-response.json`);writeFileSync(responseFile,JSON.stringify(data,null,2));
 await panel.getByRole('button',{name:'VWAP',exact:true}).click();
 if(['5m','15m','1h','4h','6h'].includes(data.candles[0].timeframe)&&!data.candles[0].vwapUnavailable){
  const reference=JSON.parse(execFileSync('python',['tests/live/vwap-oracle.py',responseFile],{encoding:'utf8'}));expect(reference.last).not.toBeNull();
  const legend=panel.getByTestId('indicator-VWAP-value');await expect(legend).toBeVisible();const text=await legend.innerText();const value=Number(text.replace(/^Tick VWAP\s*|^VWAP\s*/,'').replaceAll(',',''));expect(Math.abs(value-reference.last)).toBeLessThan(0.0051);
  if(data.candles[0].volumeType==='tick'){expect(text).toMatch(/^Tick VWAP /);await expect(panel.getByTestId('vwap-method')).toContainText('not traded volume');}
  else if(data.candles[0].volumeType==='contracts')await expect(panel.getByTestId('vwap-method')).toContainText('traded contract volume');
  writeFileSync(resolve(out,`live-${id}-oracle.json`),JSON.stringify({...reference,displayed:value},null,2));
 }else{await expect(panel.getByTestId('indicator-VWAP-value')).toHaveCount(0);await expect(panel.getByText('Session VWAP requires intraday candles.',{exact:true})).toBeVisible();}
 await expect(panel.getByTestId('price-chart').locator('canvas').first()).toBeVisible();expect(errors).toEqual([]);
 await page.screenshot({path:resolve(out,`integrated-${id}.png`)});
});
