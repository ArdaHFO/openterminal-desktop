// Direct live replay requests through Next -> isolated API -> real provider, with both Yahoo/Nasdaq blocked.
import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const out=resolve('outputs/replay-vwap');
for(const symbol of ['XAUUSD','XAGUSD','GC=F','SI=F'])for(const interval of ['15m','1h','4h'])for(const range of ['5D','1M'])test(`${symbol} ${interval} ${range} live replay VWAP`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),p=u.pathname;let body:any=[];
  if(p==='/api/status'||p.startsWith('/api/history/')&&u.searchParams.has('interval'))return route.continue();
  if(p==='/api/search')body=[{symbol,name:'Replay audit '+symbol,exchange:'AUDIT',type:'test suggestion'}];
  else if(p.startsWith('/api/history/')&&u.searchParams.has('warmup'))body={candles:[{time:1793275200,open:100,high:101,low:99,close:100,volume:10,dataSource:'Ancillary fixture',timeframe:'1d'}],context:[]};
  else if(p==='/api/quotes')body=(u.searchParams.get('symbols')??'').split(',').map(symbol=>({symbol,name:symbol,price:100,source:'Synthetic ancillary quote',currency:'USD'}));
  else if(p==='/api/macro')body={indexes:[],yields:[],vix:null,policyRate:null,inflation:null};
  else if(p.startsWith('/api/short-volume/'))body=null;
  return route.fulfill({json:body});
 });
 await page.goto('/');await page.getByRole('button',{name:/search symbol/}).click();const search=page.getByPlaceholder(/Ticker, metal/);await search.fill(symbol);await expect(page.getByText('Replay audit '+symbol,{exact:true})).toBeVisible();await search.press('Enter');
 await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();let panel=page.locator('[data-widget-id]').last();const widgetId=await panel.getAttribute('data-widget-id');
 const responsePromise=page.waitForResponse(r=>{const u=new URL(r.url());return decodeURIComponent(u.pathname)==='/api/history/'+symbol&&u.searchParams.get('range')===range&&u.searchParams.get('interval')===interval&&r.ok();});
 await panel.getByLabel('Replay candle interval').selectOption(interval);if(range!=='1M')await panel.getByLabel('Replay period',{exact:true}).selectOption(range);
 const bars=await (await responsePromise).json();const seconds=({'15m':900,'1h':3600,'4h':14400} as Record<string,number>)[interval];
 expect(bars.length).toBeGreaterThan(3);expect(bars.every((c:any)=>c.timeframe===interval&&c.time+seconds<=Date.now()/1000)).toBe(true);
 const feed=symbol.includes('=')?(symbol==='GC=F'?'COMEX:GC1!':'COMEX:SI1!'):'OANDA:'+symbol;
 expect(bars.every((c:any)=>c.dataSource.includes(feed)&&c.volumeType===(symbol.includes('=')?'contracts':'tick')&&c.vwapSessionStart===(symbol.includes('=')?18:17)&&c.vwapUnavailable===false)).toBe(true);
 const id=info.project.name+'-'+symbol.replace('=','_')+'-'+interval+'-'+range;
 const file=resolve(out,id+'-response.json');writeFileSync(file,JSON.stringify(bars,null,2));
 const reference=JSON.parse(execFileSync('python',['tests/live/replay-vwap-reference.py','--response',file],{encoding:'utf8'}));
 const expected=new Map<number,number>(reference.series.map((p:any)=>[p.time,p.value]));const n=bars.length,initial=Math.min(50,Math.max(1,Math.floor(n/2)));const checks:any[]=[];
 await expect(panel.getByTestId('replay-counter')).toHaveText(`${initial} / ${n} candles`);
 await panel.getByRole('button',{name:'SMA20',exact:true}).click();await panel.getByRole('button',{name:'VWAP',exact:true}).click();
 async function check(position:number,action:string){
  await expect(panel.getByTestId('replay-counter')).toHaveText(`${position} / ${n} candles`);const value=expected.get(bars[position-1].time);const legend=panel.getByTestId('indicator-VWAP-value');
  if(value===undefined){await expect(legend).toHaveCount(0);await expect(panel.getByTestId('indicator-VWAP-notice')).toBeVisible();}
  else{
   await expect(legend).toBeVisible();await expect.poll(async()=>{const text=await legend.innerText();return Math.abs(Number(text.replace(/^Tick VWAP\s*|^VWAP\s*/,'').replaceAll(',',''))-value);}).toBeLessThan(0.0051);
   await expect(legend).toContainText(symbol.includes('=')?'VWAP':'Tick VWAP');
  }
  await expect(panel.getByTestId('vwap-method')).toContainText(symbol.includes('=')?'traded contract volume':'not traded volume');
  await expect(panel.getByTestId('price-chart').locator('canvas').first()).toBeVisible();checks.push({action,position,expected:value??null,displayed:await legend.count()?await legend.innerText():null});
 }
 await check(initial,'initial');await panel.getByRole('button',{name:'Next candle',exact:true}).click();await check(initial+1,'next');
 await panel.getByRole('button',{name:'Maximize widget',exact:true}).click();panel=page.locator('.terminal-panel').filter({has:page.getByTestId('replay-counter')});await check(initial+1,'maximize');
 await panel.getByRole('button',{name:'Restore widget',exact:true}).click();panel=page.locator(`[data-widget-id="${widgetId}"]`);await check(initial+1,'restore');
 await panel.getByRole('button',{name:'Reset replay',exact:true}).click();await check(1,'reset');await expect(panel.getByText(/earliest session may be partial/)).toBeVisible();
 await panel.getByLabel('Replay speed').selectOption('10');await panel.getByRole('button',{name:'Play replay',exact:true}).click();
 await expect.poll(async()=>Number((await panel.getByTestId('replay-counter').innerText()).split(' / ')[0])).toBeGreaterThanOrEqual(3);
 await panel.getByRole('button',{name:'Pause replay',exact:true}).click();await expect(panel.getByRole('button',{name:'Play replay',exact:true})).toBeVisible();const stopped=await panel.getByTestId('replay-counter').innerText();await page.waitForTimeout(350);await expect(panel.getByTestId('replay-counter')).toHaveText(stopped);await check(Number(stopped.split(' / ')[0]),'play/pause');
 const slider=panel.getByLabel('Replay position');
 async function boundary(index:number,kind:string){
  expect(index).toBeGreaterThan(0);await slider.press('End');for(let i=n;i>index;i--)await slider.press('ArrowLeft');await check(index,kind+' before');await panel.getByRole('button',{name:'Next candle',exact:true}).click();await check(index+1,kind+' after');
 }
 expect(reference.boundaries.length).toBeGreaterThan(0);expect(reference.midnights.length).toBeGreaterThan(0);
 // All month-long session boundaries are checked numerically by the live collector.
 // Exercise the same native slider transitions in 5D; avoid thousands of expensive key-driven chart rebuilds.
 if(range==='5D'){await boundary(reference.boundaries.at(-1),'session reset');await boundary(reference.midnights.at(-1),'midnight continuation');}
 else{await slider.press('End');await slider.press('ArrowLeft');await check(n-1,'penultimate candle');await panel.getByRole('button',{name:'Next candle',exact:true}).click();await check(n,'last candle step');}
 await slider.press('End');await check(n,'end');await expect(panel.getByRole('button',{name:'Play replay',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'Reset replay',exact:true}).click();await check(1,'final reset');expect(errors).toEqual([]);
 writeFileSync(resolve(out,id+'-checks.json'),JSON.stringify({symbol,interval,range,bars:n,source:bars[0].dataSource,checks,sessionTransitions:reference.boundaries.length,midnightContinuations:reference.midnights.length,errors},null,2));
 if(range==='5D'&&interval==='4h'){await slider.press('End');await check(n,'screenshot end');await panel.getByRole('button',{name:'Maximize widget',exact:true}).click();await page.screenshot({path:resolve(out,id+'.png')});}
});
