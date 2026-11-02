// Selected native replay requests are fully live through the isolated Yahoo/Nasdaq outage API.
import {test,expect} from '@playwright/test';import {writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';
const out=resolve('outputs/replay-indicators');
const keys=['SMA20','SMA50','SMA200','EMA20','RSI','BOLL','MACD'];
const components:Record<string,string[]>={SMA20:['SMA20'],SMA50:['SMA50'],SMA200:['SMA200'],EMA20:['EMA20'],RSI:['RSI'],BOLL:['BOLL_U','BOLL_M','BOLL_L'],MACD:['MACD','SIGNAL','HIST']};
const required:Record<string,number>={SMA20:20,SMA50:50,SMA200:200,EMA20:20,RSI:15,BOLL:20,MACD:34};
for(const symbol of ['XAUUSD','XAGUSD','GC=F','SI=F'])for(const interval of ['15m','1h','4h'])for(const range of ['5D','1M'])test(`${symbol} ${interval} ${range} seven live replay indicators`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),p=u.pathname;let body:any=[];
  if(p==='/api/status'||p.startsWith('/api/history/')&&u.searchParams.has('interval'))return route.continue();
  if(p==='/api/search')body=[{symbol,name:'Indicator replay audit '+symbol,exchange:'AUDIT',type:'test suggestion'}];
  else if(p.startsWith('/api/history/')&&u.searchParams.has('warmup'))body={candles:[{time:1793275200,open:100,high:101,low:99,close:100,volume:10,dataSource:'Ancillary fixture',timeframe:'1d'}],context:[]};
  else if(p==='/api/quotes')body=(u.searchParams.get('symbols')??'').split(',').map(symbol=>({symbol,name:symbol,price:100,source:'Synthetic ancillary quote',currency:'USD'}));
  else if(p==='/api/macro')body={indexes:[],yields:[],vix:null,policyRate:null,inflation:null};
  else if(p.startsWith('/api/short-volume/'))body=null;
  return route.fulfill({json:body});
 });
 await page.goto('/');await page.getByRole('button',{name:/search symbol/}).click();const search=page.getByPlaceholder(/Ticker, metal/);await search.fill(symbol);await expect(page.getByText('Indicator replay audit '+symbol,{exact:true})).toBeVisible();await search.press('Enter');
 await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();let panel=page.locator('[data-widget-id]').last();const widgetId=await panel.getAttribute('data-widget-id');
 const responsePromise=page.waitForResponse(r=>{const u=new URL(r.url());return decodeURIComponent(u.pathname)==='/api/history/'+symbol&&u.searchParams.get('range')===range&&u.searchParams.get('interval')===interval&&r.ok();});
 await panel.getByLabel('Replay candle interval').selectOption(interval);if(range!=='1M')await panel.getByLabel('Replay period',{exact:true}).selectOption(range);
 const bars=await (await responsePromise).json(),n=bars.length,initial=Math.min(50,Math.max(1,Math.floor(n/2))),seconds=({'15m':900,'1h':3600,'4h':14400} as any)[interval];
 const feed=symbol.includes('=')?(symbol==='GC=F'?'COMEX:GC1!':'COMEX:SI1!'):'OANDA:'+symbol;
 expect(n).toBeGreaterThan(3);expect(bars.every((c:any)=>c.timeframe===interval&&c.dataSource.includes(feed)&&c.time+seconds<=Date.now()/1000)).toBe(true);
 const id=info.project.name+'-'+symbol.replace('=','_')+'-'+interval+'-'+range,file=resolve(out,id+'-response.json');writeFileSync(file,JSON.stringify(bars,null,2));
 const ref=JSON.parse(execFileSync('python',['tests/live/replay-indicators-reference.py','--response',file],{encoding:'utf8',maxBuffer:16*1024*1024}));
 const expected=Object.fromEntries(Object.entries(ref).map(([k,pts])=>[k,new Map<number,number>((pts as any[]).map(p=>[p.time,p.value]))]));const checks:any[]=[];
 async function check(position:number,action:string,selected=keys){
  await expect(panel.getByTestId('replay-counter')).toHaveText(`${position} / ${n} candles`);const result:any={};
  for(const key of selected){
   const values=components[key].map(k=>expected[k].get(bars[position-1].time)),legend=panel.getByTestId(`indicator-${key}-value`),notice=panel.getByTestId(`indicator-${key}-notice`);
   if(values[0]===undefined)await expect(legend).toHaveCount(0);
   else{
    await expect(legend).toBeVisible();await expect.poll(async()=>{
     const text=(await legend.innerText()).slice(key.length).trim(),parts=text.split(/\s*\/\s*/);if(parts.length!==values.length)return Infinity;
     return Math.max(...values.map((v,i)=>v===undefined?(parts[i]==='—'?0:Infinity):Math.abs(Number(parts[i].replaceAll(',',''))-v)));
    }).toBeLessThan(key==='RSI'?0.051:0.0051);
   }
   if(position<required[key]){
    await expect(notice).toContainText(`${required[key]} candles; ${position} available`);
    await expect(notice).toContainText(n<required[key]?`Loaded replay has only ${n} candles`:'Advance replay to calculate it');
   }else await expect(notice).toHaveCount(0);
   result[key]={expected:values.map(v=>v??null),displayed:await legend.count()?await legend.innerText():null,notice:await notice.count()?await notice.innerText():null};
  }
  await expect(panel.getByTestId('price-chart').locator('canvas').first()).toBeVisible();checks.push({position,action,indicators:result});
 }
 await expect(panel.getByTestId('replay-counter')).toHaveText(`${initial} / ${n} candles`);
 // Each indicator is first tested alone, including a real off/on state change.
 for(const key of keys){const b=panel.getByRole('button',{name:key,exact:true});if(await b.getAttribute('aria-pressed')!=='true')await b.click();await check(initial,'individual '+key,[key]);await b.click();await expect(b).toHaveAttribute('aria-pressed','false');await expect(panel.getByTestId(`indicator-${key}-value`)).toHaveCount(0);await expect(panel.getByTestId(`indicator-${key}-notice`)).toHaveCount(0);}
 for(const key of keys)await panel.getByRole('button',{name:key,exact:true}).click();await check(initial,'all initial');
 await panel.getByRole('button',{name:'Next candle',exact:true}).click();await check(initial+1,'next');
 await panel.getByRole('button',{name:'Maximize widget',exact:true}).click();panel=page.locator('.terminal-panel').filter({has:page.getByTestId('replay-counter')});await check(initial+1,'maximize');
 await panel.getByRole('button',{name:'Restore widget',exact:true}).click();panel=page.locator(`[data-widget-id="${widgetId}"]`);await check(initial+1,'restore');
 await panel.getByRole('button',{name:'Reset replay',exact:true}).click();await check(1,'reset');
 await panel.getByLabel('Replay speed').selectOption('10');await panel.getByRole('button',{name:'Play replay',exact:true}).click();await expect.poll(async()=>Number((await panel.getByTestId('replay-counter').innerText()).split(' / ')[0])).toBeGreaterThanOrEqual(3);await panel.getByRole('button',{name:'Pause replay',exact:true}).click();await expect(panel.getByRole('button',{name:'Play replay',exact:true})).toBeVisible();const stopped=await panel.getByTestId('replay-counter').innerText();await page.waitForTimeout(350);await expect(panel.getByTestId('replay-counter')).toHaveText(stopped);await check(Number(stopped.split(' / ')[0]),'play/pause');
 const slider=panel.getByLabel('Replay position');await slider.press('End');await check(n,'end');await expect(panel.getByRole('button',{name:'Play replay',exact:true})).toBeDisabled();
 for(const key of keys){const b=panel.getByRole('button',{name:key,exact:true});await b.click();await expect(panel.getByTestId(`indicator-${key}-value`)).toHaveCount(0);await b.click();await check(n,'end toggle '+key,[key]);}
 if(range==='1M'||interval==='4h'){await panel.getByRole('button',{name:'Maximize widget',exact:true}).click();await page.screenshot({path:resolve(out,id+'.png')});await page.getByRole('button',{name:'Restore widget',exact:true}).click();}
 await slider.press('ArrowLeft');await check(n-1,'previous candle');await panel.getByRole('button',{name:'Next candle',exact:true}).click();await check(n,'last candle step');
 // A representative real series exercises every warm-up transition through the first SMA200 point.
 if(symbol==='XAUUSD'&&interval==='15m'&&range==='1M'){
  await panel.getByRole('button',{name:'Reset replay',exact:true}).click();const thresholds=new Set([14,15,19,20,21,25,26,27,33,34,35,49,50,51,199,200,201]);
  for(let position=2;position<=201;position++){await slider.press('ArrowRight');if(thresholds.has(position))await check(position,'warm-up boundary');if([26,34,200].includes(position))await page.screenshot({path:resolve(out,id+'-at-'+position+'.png')});}
 }
 await panel.getByRole('button',{name:'Reset replay',exact:true}).click();await check(1,'final reset');expect(errors).toEqual([]);writeFileSync(resolve(out,id+'-checks.json'),JSON.stringify({symbol,interval,range,bars:n,source:bars[0].dataSource,checks,errors},null,2));
});
