import {test,expect,type Page} from '@playwright/test';

// Synthetic UI acceptance fixtures. No real holdings, paid AI or external transactions.
const history=Array.from({length:300},(_,i)=>({time:1767225600+i*86400,open:100+i,high:102+i,low:99+i,close:101+i,volume:1000,dataSource:'Synthetic audit feed',timeframe:'1d'}));
async function setup(page:Page){
  const requests:{path:string;query:string;body:any;method:string}[]=[];const transactions:any[]=[];let nextId=1;
  await page.route('**/*.m3u8',r=>r.fulfill({status:503,body:'Synthetic stream outage'}));
  await page.route('**/api/**',async route=>{
    const req=route.request(),u=new URL(req.url()),p=u.pathname,method=req.method(),body=req.postDataJSON();requests.push({path:p,query:u.search,body,method});let value:any=[];
    if(p==='/api/status')value={ok:true,providers:[],ai:false};
    else if(p==='/api/quotes')value=(u.searchParams.get('symbols')??'').split(',').map(symbol=>({symbol,name:symbol+' audit',price:120,change:2,changePercent:2,volume:1000,currency:'USD',exchange:'Synthetic',source:'Synthetic audit',time:1793275200}));
    else if(p.startsWith('/api/history/')){
      const range=u.searchParams.get('range');
      value=range==='1D'||range==='5D'?history.map((c,i)=>({...c,time:history[0].time+i*(range==='1D'?300:900),timeframe:range==='1D'?'5m':'15m'})):history;
    }
    else if(p==='/api/search')value=[{symbol:'MSFT',name:'Microsoft audit',exchange:'NASDAQ',type:'stock'}];
    else if(p==='/api/news')value=[{title:'Audit safe headline',publisher:'Audit',publishedAt:'2026-10-29T12:00:00Z',link:'https://example.com/news'},{title:'Audit unsafe headline',publisher:'Audit',publishedAt:null,link:'javascript:alert(1)'}];
    else if(p==='/api/sectors')value=['Technology','Financial'];
    else if(p==='/api/screener')value=[{symbol:u.searchParams.get('market')==='eu'?'ASML':'AAPL',name:'Audit company',sector:'Technology',currency:u.searchParams.get('market')==='eu'?'EUR':'USD',price:120,changePercent:2,marketCap:1e12,volume:2e6}];
    else if(p==='/api/heatmap')value=[{symbol:'AAPL',name:'Audit Apple',sector:'Technology',marketCap:1e12,changePercent:2},{symbol:'JPM',name:'Audit Bank',sector:'Financial',marketCap:5e11,changePercent:-1}];
    else if(p==='/api/crypto')value=[{id:'bitcoin',symbol:'BTC',name:'Bitcoin audit',price:10000,changePercent24h:2,marketCap:1e12,volume24h:1e9,rank:1,sparkline:[1,2,3,2,4,5,6,7],source:'Synthetic audit'}];
    else if(p==='/api/crypto/global')value={totalMarketCap:2e12,btcDominance:50,ethDominance:20};
    else if(p==='/api/macro')value={yields:[{tenor:'3M',value:3},{tenor:'10Y',value:4}],vix:u.searchParams.get('region')==='eu'?null:18,indexes:[{symbol:'SPY',label:'Audit S&P',price:120,changePercent:2}],policyRate:3,inflation:2};
    else if(p.startsWith('/api/options/')){const symbol=p.split('/').at(-1);const dates=symbol==='MSFT'?['2027-01-15']:['2026-11-20','2026-12-18'];value={symbol,underlyingPrice:120,expirationDates:dates,selectedDate:u.searchParams.get('expiry')??dates[0],calls:[{strike:100,lastPrice:20,bid:19,ask:21,volume:100,openInterest:200,impliedVolatility:0,inTheMoney:true}],puts:[{strike:100,lastPrice:2,bid:1,ask:3,volume:10,openInterest:20,impliedVolatility:0.2,inTheMoney:false}]};}
    else if(p==='/api/econ-calendar')value=[{title:'Audit high event',country:'USD',date:'2026-10-29T12:00:00Z',impact:'High',forecast:'2',previous:'1',actual:'3'},{title:'Audit low event',country:'EUR',date:'2026-10-29T13:00:00Z',impact:'Low',forecast:null,previous:null,actual:null}];
    else if(p==='/api/calendar')value=[{symbol:'AAPL',nextEarningsDate:1794000000,lastEarningsDate:1786000000,epsForecast:2}];
    else if(p.startsWith('/api/earnings-history/'))value=[{fiscalQtrEnd:'Audit quarter',dateReported:1786000000,eps:2,consensusForecast:1.8,surprisePercent:11.1,dayAfterChangePercent:2}];
    else if(p.startsWith('/api/insider/'))value=[{transactionDate:'2026-10-28',ownerName:'Audit officer',ownerTitle:'CFO',transactionCode:'P',acquiredDisposed:'A',shares:100,pricePerShare:100,value:10000,sharesOwnedAfter:1000}];
    else if(p==='/api/recap')value={summary:'Audit market summary',updatedAt:'2026-10-29T12:00:00Z',indexes:[{symbol:'SPY',label:'Audit S&P',price:120,changePercent:2}],vix:18,gainers:[{symbol:'AAPL',name:'Apple',changePercent:2}],losers:[{symbol:'JPM',name:'Bank',changePercent:-1}],sectors:[{sector:'Technology',avgChangePercent:2}],news:[{title:'Audit recap headline',link:'https://example.com/recap',publisher:'Audit'}]};
    else if(p==='/api/portfolios')value=[{id:1,name:'Synthetic audit portfolio'}];
    else if(p.endsWith('/transactions')){if(method==='POST'){transactions.unshift({...body,id:nextId++});value=transactions[0];}else value=transactions;}
    else if(p.includes('/transactions/')&&method==='DELETE'){const i=transactions.findIndex(t=>t.id===Number(p.split('/').at(-1)));if(i>=0)transactions.splice(i,1);return route.fulfill({status:204});}
    else if(p.endsWith('/positions'))value=transactions.length?[{symbol:'AAPL',quantity:10,avgCost:100,realizedPnl:0}]:[];
    else if(p==='/api/ai/chat')value={text:'Synthetic assistant reply'};
    await route.fulfill({json:value});
  });
  await page.goto('/');await expect(page.locator('[data-widget-id="w-chart"] canvas').first()).toBeVisible();return requests;
}
const panel=(page:Page)=>page.locator('[data-widget-id]').last();
async function add(page:Page,label:string){await page.getByRole('navigation').getByRole('button',{name:new RegExp('^'+label)}).click();return panel(page);}
test.beforeEach(async({page})=>{await setup(page);});

test('news symbol/global modes, safe links and explicit provider error',async({page})=>{
 const p=await add(page,'NEWS');await expect(p.getByRole('link',{name:/Audit safe/})).toHaveAttribute('href','https://example.com/news');await expect(p.getByRole('link',{name:/Audit unsafe/})).toHaveCount(0);
 await p.getByRole('button',{name:'GLOBAL',exact:true}).click();await expect(p.getByText('Audit safe headline')).toBeVisible();
 await page.route('**/api/news**',r=>r.fulfill({status:502,json:{error:'Audit news failure'}}));await p.getByRole('button',{name:'AAPL',exact:true}).click();await page.getByRole('button',{name:/search symbol/}).click();await page.getByPlaceholder(/Ticker, metal/).fill('MSFT');await page.getByText('Microsoft audit',{exact:true}).click();await expect(p.getByRole('alert')).toContainText('Audit news failure');
});
test('screener filters encode units, sort, survive maximize and reset sector on region change',async({page})=>{
 const p=await add(page,'SCREENER');await p.getByLabel('Screener sector').selectOption('Technology');await p.getByPlaceholder('MCap min ($B)').fill('2');
 const request=page.waitForRequest(r=>r.url().includes('/api/screener')&&r.url().includes('volumeMin=3000000'));await p.getByPlaceholder('Vol min (M)').fill('3');expect((await request).url()).toContain('marketCapMin=2000000000');
 await p.getByRole('columnheader',{name:/Chg%/}).click();await p.getByRole('button',{name:'Maximize widget'}).click();await expect(page.getByPlaceholder('MCap min ($B)')).toHaveValue('2');await expect(page.getByLabel('Screener sector')).toHaveValue('Technology');
 await page.getByRole('button',{name:'Restore widget'}).click();await p.getByRole('button',{name:'EU',exact:true}).click();await expect(p.getByLabel('Screener sector')).toHaveValue('');await expect(p.getByText('ASML',{exact:true})).toBeVisible();await expect(p.getByPlaceholder('MCap min (€B)')).toBeVisible();await expect(p.getByRole('columnheader',{name:/MCap \(EUR\)/})).toBeVisible();await expect(p.getByText('EUR',{exact:true})).toBeVisible();
});
test('heatmap cells select symbols, empty datasets are safe and multiple charts have unique clips',async({page})=>{
 const p=await add(page,'HEATMAP');await expect(p.locator('g.leaf')).toHaveCount(2);await p.locator('g.leaf').first().click();await expect(page.getByRole('button',{name:/AAPL.*search symbol/})).toBeVisible();
 await add(page,'HEATMAP');const ids=await page.locator('clipPath.sector-clip').evaluateAll(es=>es.map(e=>e.id));expect(new Set(ids).size).toBe(ids.length);
 await page.route('**/api/heatmap**',r=>r.fulfill({json:[]}));await panel(page).getByRole('button',{name:'EU',exact:true}).click();await expect(panel(page).getByText('No priced market-cap data available for this market.')).toBeVisible();await expect(page.getByText(/failed to render/)).toHaveCount(0);
});
test('crypto market, source, global statistics and symbol selection',async({page})=>{
 const p=await add(page,'CRYPTO');await expect(p.getByText('Bitcoin audit')).toBeVisible();await expect(p.getByText('50.0%')).toBeVisible();await expect(p.locator('polyline')).toHaveCount(1);await p.getByRole('row').filter({hasText:'Bitcoin audit'}).click();await expect(page.getByRole('button',{name:/BTC.*search symbol/})).toBeVisible();
});
test('US/EU macro switches data and row links active symbol',async({page})=>{
 const p=await add(page,'MACRO');await expect(p.getByText('US Treasury Yield Curve')).toBeVisible();await p.getByRole('button',{name:'EU',exact:true}).click();await expect(p.getByText('Euro Area AAA Yield Curve')).toBeVisible();await expect(p.getByText(/ECB depo/)).toBeVisible();await p.getByRole('row').filter({hasText:'Audit S&P'}).click();await expect(page.getByRole('button',{name:/SPY.*search symbol/})).toBeVisible();
});
test('options expiry resets on symbol change and zero implied volatility remains visible',async({page})=>{
 const p=await add(page,'OPTIONS');await p.getByLabel('Option expiry').selectOption('2026-12-18');await expect(p.getByText('200 · 0%')).toBeVisible();
 await page.getByRole('button',{name:/search symbol/}).click();await page.getByPlaceholder(/Ticker, metal/).fill('MSFT');await page.getByText('Microsoft audit',{exact:true}).click();await expect(p.getByLabel('Option expiry')).toHaveValue('2027-01-15');
});
test('calendar impact/timezone filters, earnings expansion and maximize preserve active tab',async({page})=>{
 const p=await add(page,'CALENDAR');await expect(p.getByText('Audit high event')).toBeVisible();await expect(p.getByText('Audit low event')).toHaveCount(0);await p.getByRole('button',{name:'ALL',exact:true}).click();await expect(p.getByText('Audit low event')).toBeVisible();await p.locator('select').selectOption('UTC');
 await p.getByRole('button',{name:'EARNINGS',exact:true}).click();await p.getByText('AAPL',{exact:true}).click();await expect(p.getByText('Audit quarter')).toBeVisible();await p.getByRole('button',{name:'Maximize widget'}).click();await expect(page.getByText('Audit quarter')).toBeVisible();await page.getByRole('button',{name:'Restore widget'}).click();await expect(p.getByText('Audit quarter')).toBeVisible();
});
test('insider table and recap headline render with row navigation',async({page})=>{
 const p=await add(page,'INSIDER');await expect(p.getByText('Audit officer')).toBeVisible();await expect(p.getByText('Open market buy')).toBeVisible();const r=await add(page,'MARKET RECAP');await expect(r.getByText('Audit market summary')).toBeVisible();await expect(r.getByRole('link',{name:/Audit recap/})).toHaveAttribute('href','https://example.com/recap');await r.getByRole('row').filter({hasText:'Audit S&P'}).click();await expect(page.getByRole('button',{name:/SPY.*search symbol/})).toBeVisible();
});
test('portfolio synthetic add, holdings, transaction delete and form preservation',async({page})=>{
 const p=await add(page,'PORTFOLIO');await expect(p.getByLabel('Portfolio',{exact:true})).toHaveValue('1');await p.getByRole('button',{name:'ADD',exact:true}).click();await expect(p.getByRole('alert')).toContainText('positive quantity');await p.getByPlaceholder('Ticker',{exact:true}).fill('AAPL');await p.getByPlaceholder('Qty',{exact:true}).fill('10');await p.getByPlaceholder('Price',{exact:true}).fill('100');await p.getByRole('button',{name:'Maximize widget'}).click();await expect(page.getByPlaceholder('Qty',{exact:true})).toHaveValue('10');await page.getByRole('button',{name:'Restore widget'}).click();
 await p.getByRole('button',{name:'ADD',exact:true}).click();await expect(p.getByRole('cell',{name:'AAPL',exact:true})).toBeVisible();await p.getByRole('button',{name:'TRANSACTIONS',exact:true}).click();await expect(p.getByRole('button',{name:'Delete transaction 1'})).toBeVisible();await p.getByRole('button',{name:'Delete transaction 1'}).click();await expect(p.getByRole('button',{name:'Delete transaction 1'})).toHaveCount(0);
});
test('AI disabled state, single-message request, retry and maximize preserve conversation',async({page})=>{
 const p=await add(page,'AI ASSIST');await expect(p.getByRole('button',{name:'SEND',exact:true})).toBeDisabled();await expect(p.getByText(/AI is not configured/)).toBeVisible();
 await page.route('**/api/status',r=>r.fulfill({json:{ok:true,ai:true,providers:[]}}));await page.reload();const a=page.locator('[data-widget-id]').last();await expect(a.getByRole('button',{name:'SEND',exact:true})).toBeEnabled();let failed=true;const bodies:any[]=[];
 await page.route('**/api/ai/chat',async r=>{bodies.push(r.request().postDataJSON());await r.fulfill(failed?{status:502,json:{error:'Audit AI failure'}}:{json:{text:'Synthetic assistant reply'}});});
 await a.getByPlaceholder(/Ask about/).fill('Audit question');await a.getByRole('button',{name:'SEND',exact:true}).click();await expect(a.getByRole('alert')).toContainText('Audit AI failure');failed=false;await a.getByRole('button',{name:'Retry message'}).click();await expect(a.getByText('Synthetic assistant reply',{exact:true})).toBeVisible();expect(bodies[0].messages).toEqual([{role:'user',content:'Audit question'}]);expect(bodies[1].messages).toEqual(bodies[0].messages);
 await a.getByRole('button',{name:'Maximize widget'}).click();await expect(page.getByText('Synthetic assistant reply',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Restore widget'}).click();await expect(a.getByText('Audit question',{exact:true})).toBeVisible();
});
for(const [label,pattern] of [['QUOTE','**/api/quotes**'],['NEWS','**/api/news**'],['WATCHLIST','**/api/quotes**'],['CRYPTO','**/api/crypto'],['MACRO','**/api/macro**'],['OPTIONS','**/api/options/**'],['INSIDER','**/api/insider/**'],['CALENDAR','**/api/econ-calendar'],['HEATMAP','**/api/heatmap**'],['SCREENER','**/api/screener**'],['MARKET RECAP','**/api/recap'],['PORTFOLIO','**/api/portfolios']])test(`${label} shows a provider error instead of a silent empty panel`,async({page})=>{
 await page.route(pattern,r=>r.fulfill({status:502,json:{error:'Synthetic audit provider failure'}}));await page.reload();const p=await add(page,label);await expect(p.getByText(/Synthetic audit provider failure/).first()).toBeVisible();
});

test('watchlist validates, canonicalizes, deduplicates and removes symbols',async({page})=>{
 const p=await add(page,'WATCHLIST');const input=p.getByPlaceholder('Add ticker…');await input.fill('bad,ticker');await input.press('Enter');await expect(input).toHaveAttribute('aria-invalid','true');await input.fill('xau');await input.press('Enter');await expect(p.getByRole('cell',{name:'XAUUSD',exact:true})).toHaveCount(1);await input.fill('XAUUSD');await input.press('Enter');await expect(p.getByRole('cell',{name:'XAUUSD',exact:true})).toHaveCount(1);await p.getByRole('button',{name:'Remove XAUUSD from watchlist',exact:true}).click();await expect(p.getByRole('cell',{name:'XAUUSD',exact:true})).toHaveCount(0);
});
test('widget unlink, manual alias ticker, relink and close work independently',async({page})=>{
 const p=await add(page,'QUOTE');await p.getByTitle('Linked to active symbol (click to unlink)').click();await page.getByRole('button',{name:/search symbol/}).click();await page.getByPlaceholder(/Ticker, metal/).fill('MSFT');await page.getByText('Microsoft audit',{exact:true}).click();await expect(p.locator('.panel-title').getByText('AAPL',{exact:true})).toBeVisible();await p.getByTitle("Click to set this widget's ticker").click();await p.locator('.panel-title input').fill('xau');await p.locator('.panel-title input').press('Enter');await expect(p.locator('.panel-title').getByText('XAUUSD',{exact:true})).toBeVisible();await p.getByTitle('Unlinked (click to link)').click();await expect(p.locator('.panel-title').getByText('MSFT',{exact:true})).toBeVisible();const count=await page.locator('[data-widget-id]').count();await p.getByRole('button',{name:'Close Quote widget',exact:true}).click();await expect(page.locator('[data-widget-id]')).toHaveCount(count-1);
});
test('all chart renderers and indicator panes work with enough history',async({page})=>{
 const p=page.locator('[data-widget-id="w-chart"]');for(const type of ['BARS','LINE','AREA','CANDLES']){await p.getByRole('button',{name:type,exact:true}).click();await expect(p.locator('canvas').first()).toBeVisible();}
 await p.getByRole('button',{name:'1D',exact:true}).click();await p.getByRole('button',{name:'SMA20',exact:true}).click();
 for(const name of ['SMA20','SMA50','SMA200','EMA20','VWAP','BOLL','RSI','MACD'])await p.getByRole('button',{name,exact:true}).click();await expect(p.getByText(/^SMA200 [0-9]/)).toBeVisible();await expect(p.getByText(/^VWAP [0-9]/)).toBeVisible();await expect(p.getByText(/^RSI [0-9]/)).toBeVisible();await expect(page.getByText(/failed to render/)).toHaveCount(0);
});

test('partial auxiliary feed failures do not hide primary crypto and quote data',async({page})=>{
 await page.route('**/api/crypto/global',r=>r.fulfill({status:502,json:{error:'Audit global unavailable'}}));const c=await add(page,'CRYPTO');await expect(c.getByText('Bitcoin audit')).toBeVisible();await expect(c.getByRole('alert')).toContainText('Audit global unavailable');
 await page.route('**/api/short-volume/**',r=>r.fulfill({status:502,json:{error:'Audit short unavailable'}}));await page.reload();const q=await add(page,'QUOTE');await expect(q.getByText('AAPL audit')).toBeVisible();await expect(q.getByRole('alert')).toContainText('Audit short unavailable');
});
test('keyboard search handles empty/error results, watchlist selection and add-widget shortcuts',async({page})=>{
 await page.route('**/api/search**',r=>{const query=new URL(r.request().url()).searchParams.get('q');return r.fulfill(query==='ERR'?{status:502,json:{error:'Audit search failure'}}:{json:query==='NONE'?[]:[{symbol:'MSFT',name:'Microsoft audit',exchange:'NASDAQ',type:'stock'}]});});
 await page.keyboard.press('Control+k');const input=page.getByPlaceholder(/Ticker, metal/);await input.fill('NONE');await expect(page.getByText('No results for “NONE”')).toBeVisible();await input.press('ArrowDown');await input.fill('MSFT');await expect(page.getByText('Microsoft audit',{exact:true})).toBeVisible();await input.press('Shift+Enter');await expect(page.getByRole('button',{name:/MSFT.*search symbol/})).toBeVisible();
 await page.keyboard.press('Control+k');await input.fill('ERR');await expect(page.getByRole('alert').filter({hasText:'Audit search failure'})).toBeVisible();await input.press('Escape');const count=await page.locator('[data-widget-id]').count();await page.keyboard.press('Alt+2');await expect(page.locator('[data-widget-id]')).toHaveCount(count+1);
});
