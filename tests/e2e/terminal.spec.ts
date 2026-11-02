import {test,expect,type Page} from '@playwright/test';
import catalogue from '../../catalog/instruments.json';

// Deterministic synthetic feeds. These tests do not query markets or touch the real portfolio.
function candles(symbol:string,range='6M',resolution?:string) {
  const base=({XAUUSD:4000,XAGUSD:50,'GC=F':4010,'SI=F':51} as Record<string,number>)[symbol]??100;
  const timeframe=resolution??({'1D':'5m','5D':'15m','1M':'1h','6M':'1d',YTD:'1d','1Y':'1d','5Y':'1w',MAX:'1mo'} as Record<string,string>)[range];
  const interval=resolution?({'15m':900,'1h':3600,'4h':14400} as Record<string,number>)[resolution]:range==='1D'?300:range==='5D'?900:range==='1M'?3600:86400;
  const metal=['XAUUSD','XAGUSD','GC=F','SI=F'].includes(symbol);
  return Array.from({length:280},(_,i)=>{const value=base*(1+Math.sin(i/6)*0.05+i*0.0001);return {time:1735689600+i*interval,open:value,high:value+1,low:value-1,close:value+0.2,volume:100+i,dataSource:metal?`Synthetic ${symbol}`:'Synthetic test feed',timeframe,...(metal?{volumeType:symbol.includes('=')?'contracts':'tick',vwapUnavailable:true}:{} )};});
}
function quote(symbol:string) {
  const metal=catalogue.find(r=>r.symbol===symbol);
  return {symbol,name:metal?.name??symbol,price:({XAUUSD:4000,XAGUSD:50,'GC=F':4010,'SI=F':51} as Record<string,number>)[symbol]??100,change:1,changePercent:1,open:99,high:101,low:98,previousClose:99,bid:null,ask:null,volume:1000,avgVolume:null,marketCap:null,pe:null,eps:null,dividendYield:null,week52High:null,week52Low:null,beta:null,sharesOutstanding:null,currency:'USD',exchange:metal?.exchange??'NASDAQ',source:'Synthetic test feed',time:1780272000,delayStatus:'unknown'};
}
async function fixtures(page:Page, failingHistory=false) {
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),p=url.pathname;
    let body:unknown=[],status=200;
    if(p==='/api/status')body={ok:true,service:'OpenTerminal',providers:[],ai:false};
    else if(p==='/api/quotes')body=(url.searchParams.get('symbols')??'').split(',').filter(Boolean).map(quote);
    else if(p.startsWith('/api/history/')){if(failingHistory){status=502;body={error:'Synthetic provider outage'};}else body=candles(decodeURIComponent(p.split('/').at(-1)!),url.searchParams.get('range')??'6M',url.searchParams.get('interval')??undefined);}
    else if(p==='/api/search'){const q=(url.searchParams.get('q')??'').toUpperCase();body=catalogue.filter(r=>[r.symbol,...r.aliases].includes(q)).map(r=>({...r,type:r.kind}));}
    else if(p==='/api/macro')body={region:'us',indexes:[],yields:[],vix:null,policyRate:null,inflation:null};
    else if(p==='/api/crypto/global')body={totalMarketCap:0,btcDominance:0,ethDominance:0};
    else if(p.startsWith('/api/short-volume/'))body=null;
    await route.fulfill({status,json:body});
  });
}
const chart=(page:Page)=>page.locator('[data-widget-id="w-chart"]');
async function openSearch(page:Page,symbol:string) {
  await page.getByRole('button',{name:/search symbol/}).click();
  const input=page.getByPlaceholder(/Ticker, metal/);await input.fill(symbol);
  await expect(page.getByText(catalogue.find(r=>r.symbol===symbol||(r.aliases as string[]).includes(symbol))!.name,{exact:true}).last()).toBeVisible();
  await input.press('Enter');
}
test.beforeEach(async({page})=>{await fixtures(page);await page.goto('/');await expect(chart(page).getByTestId('price-chart').locator('canvas').first()).toBeVisible();});

test('workspace snapshots save, restore, rename and survive reload',async({page})=>{
  await page.getByLabel('Workspace name',{exact:true}).fill('My metals');await page.getByRole('button',{name:'Save new',exact:true}).click();
  await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();await expect(page.getByText('Historical replay / simulation only.',{exact:false})).toBeVisible();
  await page.getByLabel('Saved workspace').selectOption({label:'My metals'});await page.getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.getByText('Historical replay / simulation only.',{exact:false})).toHaveCount(0);
  await page.getByLabel('Workspace name',{exact:true}).fill('Renamed');await page.getByRole('button',{name:'Rename',exact:true}).click();
  await page.reload();await expect(page.getByLabel('Saved workspace').locator('option',{hasText:'Renamed'})).toHaveCount(1);
  await page.getByLabel('Saved workspace').selectOption({label:'Renamed'});await page.getByRole('button',{name:'Delete saved'}).click();await expect(page.getByLabel('Saved workspace').locator('option',{hasText:'Renamed'})).toHaveCount(0);
});
test('layout lock, maximize/restore, and automatic scroll keep controls reachable',async({page})=>{
  await page.getByLabel('Lock layout').check();await expect(page.locator('.react-resizable-handle').first()).toBeHidden();
  await chart(page).getByRole('button',{name:'Maximize widget'}).click();await expect(page.getByRole('button',{name:'Restore widget'})).toBeVisible();await page.keyboard.press('Escape');await expect(chart(page)).toBeVisible();
  await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();
  const last=page.locator('[data-widget-id]').last();await expect(last).toBeInViewport();await expect(page.getByRole('button',{name:'CHART ⌥1',exact:true})).toBeInViewport();
  await page.getByRole('main').press('Control+Home');await expect(chart(page)).toBeInViewport();
});
test('preset applies only on confirmation and saves a backup',async({page})=>{
  await page.getByLabel('Workspace preset').selectOption('metals');await page.getByRole('button',{name:'Apply preset'}).click();await expect(page.getByRole('button',{name:'Confirm preset'})).toBeVisible();await expect(chart(page)).toHaveCount(1);
  await page.getByRole('button',{name:'Confirm preset'}).click();await expect(page.getByLabel('Saved workspace').locator('option',{hasText:'Before preset'})).toHaveCount(1);
  await expect(page.getByRole('button',{name:/XAUUSD.*search symbol/})).toBeVisible();
});
test('catalogue filters aliases and selects the canonical metal',async({page})=>{
  await page.getByRole('button',{name:'INSTRUMENTS',exact:true}).click();await page.getByLabel('Catalogue search').fill('XAG');
  await page.getByRole('row').filter({hasText:'Silver / USD'}).click();await expect(page.getByRole('button',{name:/XAGUSD.*search symbol/})).toBeVisible();
  await expect(page.getByRole('cell',{name:'USD/troy oz',exact:true})).toBeVisible();
});
test('chart supports all ranges, drawing persistence, deletion and symbol isolation',async({page})=>{
  const panel=chart(page);
  for(const r of ['1D','5D','1M','6M','YTD','1Y','5Y','MAX']){await panel.getByRole('button',{name:r,exact:true}).click();await expect(panel.getByText(/latest bar/)).toBeVisible();}
  await panel.getByRole('button',{name:'Horizontal level',exact:true}).click();const canvas=panel.getByTestId('price-chart');const box=await canvas.boundingBox();if(!box)throw Error('Chart not rendered');
  await canvas.click({position:{x:box.width*0.45,y:box.height*0.5}});await expect(panel.getByText('Indicator settings / saved drawings (1)',{exact:true})).toBeVisible();
  await page.reload();await expect(chart(page).getByText('Indicator settings / saved drawings (1)',{exact:true})).toBeVisible();
  await openSearch(page,'XAU');await expect(chart(page).getByText('Indicator settings / saved drawings (0)',{exact:true})).toBeVisible();
  await openSearch(page,'AAPL');await chart(page).getByText('Indicator settings / saved drawings (1)',{exact:true}).click();await chart(page).getByRole('button',{name:/Delete drawing/}).click();await expect(chart(page).getByText('Indicator settings / saved drawings (0)',{exact:true})).toBeVisible();
});
test('trend and ruler capture two anchors; indicator settings persist',async({page})=>{
  const panel=chart(page),canvas=panel.getByTestId('price-chart'),box=await canvas.boundingBox();if(!box)throw Error('Chart missing');
  for(const tool of ['Trend line','Measure']){await panel.getByRole('button',{name:tool,exact:true}).click();await canvas.click({position:{x:box.width*.3,y:box.height*.4}});await canvas.click({position:{x:box.width*.7,y:box.height*.6}});}
  await expect(panel.getByText('Indicator settings / saved drawings (2)',{exact:true})).toBeVisible();await panel.getByText('Indicator settings / saved drawings (2)',{exact:true}).click();
  await panel.getByLabel('Fast SMA',{exact:true}).fill('12');await page.reload();await chart(page).getByText('Indicator settings / saved drawings (2)',{exact:true}).click();await expect(chart(page).getByLabel('Fast SMA',{exact:true})).toHaveValue('12');
});
test('replay steps and resets; simulation respects the visible prefix and invalid cost settings',async({page})=>{
  await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();await expect(page.getByTestId('replay-counter')).toHaveText('50 / 280 candles');
  await page.getByRole('button',{name:'Next candle'}).click();await expect(page.getByTestId('replay-counter')).toHaveText('51 / 280 candles');
  await page.getByRole('spinbutton',{name:'Fast SMA',exact:true}).fill('12');
  await page.locator('[data-widget-id]').last().getByRole('button',{name:'Maximize widget'}).click();await expect(page.getByTestId('replay-counter')).toHaveText('51 / 280 candles');await expect(page.getByRole('spinbutton',{name:'Fast SMA',exact:true})).toHaveValue('12');
  await page.getByRole('button',{name:'Restore widget'}).click();await expect(page.getByTestId('replay-counter')).toHaveText('51 / 280 candles');
  await page.getByRole('button',{name:'Play replay'}).click();await expect(page.getByRole('button',{name:'Pause replay'})).toBeVisible();await page.getByRole('button',{name:'Pause replay'}).click();
  await page.getByRole('button',{name:'Reset replay'}).click();await expect(page.getByTestId('replay-counter')).toHaveText('1 / 280 candles');await expect(page.getByTestId('strategy-result')).toContainText('Trades 0');
  await page.getByLabel('Fee bps',{exact:true}).fill('-1');await expect(page.getByRole('alert').filter({hasText:'costs'})).toContainText('costs');
});
test('metal analysis shows aligned ratio/spread and explicit manual conversions',async({page})=>{
  await page.getByRole('button',{name:'METAL ANALYSIS',exact:true}).click();await expect(page.getByTestId('metal-snapshots')).toContainText('80');
  await page.getByLabel('Manual USD TRY').fill('40');await expect(page.getByTestId('metal-conversions')).toContainText('TRY/g');
  await page.getByLabel('Metal comparison').selectOption('gold');await expect(page.getByText('Derived session closes. Line only; no synthetic OHLC or volume.')).toBeVisible();
  await page.getByLabel('Manual USD TRY').fill('-1');await expect(page.getByRole('alert').filter({hasText:'positive exchange rate'})).toContainText('positive exchange rate');
});
test('history provider error is visible and a later successful range recovers',async({page})=>{
  await page.route('**/api/history/**',route=>route.fulfill({status:502,json:{error:'Synthetic provider outage'}}));
  await chart(page).getByRole('button',{name:'5D',exact:true}).click();await expect(chart(page).getByText(/Synthetic provider outage/)).toBeVisible({timeout:30000});
  await page.unroute('**/api/history/**');await chart(page).getByRole('button',{name:'1M',exact:true}).click();await expect(chart(page).getByText(/hourly bars/)).toBeVisible();
});

test('legacy aliases migrate without losing existing widget layout',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('openterminal-workspace',JSON.stringify({version:0,state:{activeSymbol:'XAU',watchlist:['XAU','XAUUSD','XAG'],widgets:[{id:'w-chart',type:'chart',linked:true},{id:'watch',type:'watchlist',linked:false}],layout:[{i:'w-chart',x:0,y:0,w:7,h:12},{i:'watch',x:7,y:0,w:5,h:8}]}})));
  await page.reload();await expect(page.getByRole('button',{name:/XAUUSD.*search symbol/})).toBeVisible();await expect(page.getByRole('cell',{name:'XAUUSD',exact:true})).toHaveCount(1);await expect(page.getByRole('cell',{name:'XAGUSD',exact:true})).toHaveCount(1);await expect(page.locator('[data-widget-id]')).toHaveCount(2);
});
test('one unavailable futures history does not blank the spot ratio',async({page})=>{
  await page.route('**/api/history/**',async route=>{const s=decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);if(s==='SI=F')await route.fulfill({status:502,json:{error:'Synthetic unavailable silver future'}});else await route.fallback();});
  await page.getByRole('button',{name:'METAL ANALYSIS',exact:true}).click();await expect(page.getByText('Some metal histories are unavailable. Available pairs remain usable.',{exact:true})).toBeVisible();await expect(page.getByText('Derived session closes. Line only; no synthetic OHLC or volume.',{exact:true})).toBeVisible();
});

for(const [interval,label] of [['15m','15-minute bars'],['1h','hourly bars'],['4h','4-hour bars']])test(`replay ${interval} uses its own history, steps, pauses, resets and survives maximize`,async({page})=>{
  await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();
  const requested=page.waitForRequest(r=>r.url().includes('/api/history/AAPL')&&r.url().includes(`interval=${interval}`));
  await page.getByLabel('Replay candle interval').selectOption(interval);expect((await requested).url()).toContain('range=1M');
  await expect(page.getByTestId('replay-counter')).toHaveText('50 / 280 candles');await expect(page.getByText(new RegExp(label)).last()).toBeVisible();
  await page.getByRole('button',{name:'Next candle',exact:true}).click();await expect(page.getByTestId('replay-counter')).toHaveText('51 / 280 candles');
  await page.locator('[data-widget-id]').last().getByRole('button',{name:'Maximize widget'}).click();await expect(page.getByTestId('replay-counter')).toHaveText('51 / 280 candles');await expect(page.getByLabel('Replay candle interval')).toHaveValue(interval);
  await page.getByRole('button',{name:'VWAP',exact:true}).last().click();await expect(page.getByText(/^VWAP [0-9]/)).toBeVisible();await expect(page.getByText('Session VWAP requires intraday candles.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Play replay',exact:true}).click();await expect(page.getByRole('button',{name:'Pause replay',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pause replay',exact:true}).click();
  await page.getByRole('button',{name:'Reset replay',exact:true}).click();await expect(page.getByTestId('replay-counter')).toHaveText('1 / 280 candles');
  await page.getByLabel('Replay period').selectOption('5D');await expect(page.getByTestId('replay-counter')).toHaveText('50 / 280 candles');
  await page.getByRole('button',{name:'Restore widget',exact:true}).click();
  await openSearch(page,'XAUUSD');await expect(page.getByTestId('replay-counter')).toHaveText('50 / 280 candles');await expect(page.getByLabel('Replay candle interval')).toHaveValue(interval);
});
test('intraday errors clear the previous series and retry recovers without stale simulation',async({page})=>{
  let failed=true;
  await page.route('**/api/history/**',async route=>{const u=new URL(route.request().url());if(u.searchParams.has('interval'))return route.fulfill(failed?{status:502,json:{error:'Intraday fixture outage'}}:{json:candles('AAPL','1M','15m')});return route.fallback();});
  await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();await expect(page.getByTestId('replay-counter')).toHaveText('50 / 280 candles');
  await page.getByLabel('Replay candle interval').selectOption('15m');await expect(page.getByRole('alert').filter({hasText:'Intraday fixture outage'})).toBeVisible();await expect(page.getByTestId('replay-counter')).toHaveText('0 / 0 candles');await expect(page.getByRole('button',{name:'Next candle',exact:true})).toBeDisabled();await expect(page.getByTestId('strategy-result')).toHaveCount(0);
  failed=false;await page.getByRole('button',{name:'Retry replay history',exact:true}).click();await expect(page.getByTestId('replay-counter')).toHaveText('50 / 280 candles');await expect(page.getByTestId('strategy-result')).toBeVisible();
});
test('CNBC explains official access and stops the previous video; Cheddar has a real source and retry',async({page})=>{
  const requests:string[]=[];await page.route('**/*.m3u8',async route=>{requests.push(route.request().url());await route.fulfill({status:503,body:'Synthetic stream outage'});});
  await page.getByRole('button',{name:'LIVE TV',exact:true}).click();
  const tv=page.getByTestId('tv-player');await tv.getByRole('button',{name:'CNBC',exact:true}).click();await expect(tv.getByTestId('tv-official-notice')).toContainText('CNBC+');await expect(tv.locator('video')).toHaveCount(0);await expect(tv.getByRole('link',{name:'Open CNBC official player'})).toHaveAttribute('href','https://www.cnbc.com/live-tv/');
  await tv.getByRole('button',{name:'Cheddar Business',exact:true}).click();await expect.poll(()=>requests.some(u=>u==='https://hls.livecdn.io/cheddar.com/cheddar/playlist.m3u8')).toBe(true);await expect(tv.locator('video')).toHaveAttribute('aria-label','Cheddar Business live video');
  await page.locator('[data-widget-id]').last().getByRole('button',{name:'Maximize widget',exact:true}).click();await expect(tv.getByRole('button',{name:'Cheddar Business',exact:true})).toHaveAttribute('aria-pressed','true');await expect(tv.locator('video')).toHaveAttribute('aria-label','Cheddar Business live video');
  const before=requests.length;await tv.getByRole('button',{name:'Retry stream',exact:true}).click();await expect.poll(()=>requests.length).toBeGreaterThan(before);
  await expect(tv.getByRole('alert')).toContainText(/stream|Stream/,{timeout:45000});
  await tv.getByRole('button',{name:'CNBC',exact:true}).click();await expect(tv.getByTestId('tv-status')).toContainText('Official player');await expect(tv.getByRole('alert')).toHaveCount(0);
});

test('short 4h histories start before the end so replay is immediately playable',async({page})=>{
  await page.route('**/api/history/**',async route=>{const u=new URL(route.request().url());if(u.searchParams.get('interval')==='4h')return route.fulfill({json:candles('AAPL','1M','4h').slice(0,30)});return route.fallback();});
  await page.getByRole('button',{name:'REPLAY / TEST',exact:true}).click();await page.getByLabel('Replay candle interval').selectOption('4h');
  await expect(page.getByTestId('replay-counter')).toHaveText('15 / 30 candles');await expect(page.getByRole('button',{name:'Play replay',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Next candle',exact:true}).click();await expect(page.getByTestId('replay-counter')).toHaveText('16 / 30 candles');
  await page.getByLabel('Replay position').press('End');await expect(page.getByRole('button',{name:'Play replay',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Reset replay',exact:true}).click();await expect(page.getByRole('button',{name:'Play replay',exact:true})).toBeEnabled();
});
