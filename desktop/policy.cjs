const fs=require('node:fs');const path=require('node:path');
const ORIGIN='openterminal://app';
function proxyTarget(raw,base){
 const u=new URL(raw),target=new URL(base);
 if(u.protocol!=='openterminal:'||u.hostname!=='app'||u.port||u.username||u.password||target.protocol!=='http:'||target.hostname!=='127.0.0.1')throw Error('Blocked application URL');
 target.pathname=u.pathname;target.search=u.search;target.hash='';return target.href;
}
function externalUrl(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||raw.length>8192||/[\x00-\x1f]/.test(raw))return null;return u.href;}catch{return null;}}
function childEnvironment(source){
 const names=['SystemRoot','WINDIR','PATH','TEMP','TMP','APPDATA','LOCALAPPDATA','USERPROFILE','HOMEDRIVE','HOMEPATH','COMSPEC','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','LANG','HTTP_PROXY','HTTPS_PROXY','NO_PROXY'];
 const out={};for(const name of names){const key=Object.keys(source).find(k=>k.toUpperCase()===name.toUpperCase());if(key)out[name]=source[key];}return out;
}
function atomicJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,file);}
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
const widgetTypes=new Set(['quote','chart','watchlist','news','heatmap','screener','crypto','macro','options','portfolio','ai','calendar','insider','tv','recap','catalog','metals','replay']);
const symbol=s=>typeof s==='string'&&/^[a-zA-Z0-9.^=:/_-]{1,50}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
function workspace(state){
 if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Invalid workspace state');
 const widgets=state.widgets;if(!Array.isArray(widgets)||widgets.length>100||widgets.some(w=>!w||typeof w.id!=='string'||w.id.length>120||!widgetTypes.has(w.type)||typeof w.linked!=='boolean'||w.symbol!==undefined&&!symbol(w.symbol)))throw Error('Invalid widgets');
 const ids=new Set(widgets.map(w=>w.id));if(ids.size!==widgets.length)throw Error('Duplicate widget IDs');
 if(!Array.isArray(state.layout)||state.layout.length>100||state.layout.some(l=>!ids.has(l.i)||!['x','y','w','h'].every(k=>Number.isInteger(l[k]))||l.x<0||l.x>11||l.y<0||l.y>50000||l.w<1||l.w>12||l.h<1||l.h>200))throw Error('Invalid layout');
 if(!symbol(state.activeSymbol)||!Array.isArray(state.watchlist)||state.watchlist.length>200||state.watchlist.some(s=>!symbol(s)))throw Error('Invalid symbols');
 return {widgets:widgets.map(w=>({id:w.id,type:w.type,linked:w.linked,...(w.symbol?{symbol:w.symbol}:{})})),layout:state.layout.map(l=>({i:l.i,x:l.x,y:l.y,w:l.w,h:l.h})),activeSymbol:state.activeSymbol,watchlist:[...state.watchlist],layoutLocked:!!state.layoutLocked,maximizedId:null,commandOpen:false};
}
function validateWorkspaceBackup(input){
 const text=typeof input==='string'?input:JSON.stringify(input);if(Buffer.byteLength(text)>5*1024*1024)throw Error('Workspace backup exceeds 5 MiB');
 const data=JSON.parse(text);if(data.format!=='openterminal-workspace-backup'||data.version!==1||!data.storage||typeof data.storage!=='object')throw Error('Unsupported workspace backup');
 let count=0;function inspect(v,depth=0){if(depth>20||++count>100000)throw Error('Workspace backup too complex');if(v&&typeof v==='object')for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Unsafe object key');inspect(v[k],depth+1);}}inspect(data);
 const storage={};for(const [key,raw] of Object.entries(data.storage)){
  if(!['openterminal-workspace','openterminal-chart-tools'].includes(key)||typeof raw!=='string')throw Error('Unexpected storage key');
  const saved=JSON.parse(raw);inspect(saved);if(!saved.state||typeof saved.state!=='object')throw Error('Invalid stored state');
  if(key==='openterminal-workspace'){
   const state=workspace(saved.state),snapshots=saved.state.savedWorkspaces??[];if(!Array.isArray(snapshots)||snapshots.length>100)throw Error('Invalid saved workspaces');
   state.savedWorkspaces=snapshots.map(w=>{if(typeof w.id!=='string'||typeof w.name!=='string'||w.name.length>120)throw Error('Invalid saved workspace');const s=workspace({...w,layoutLocked:w.locked});return {id:w.id,name:w.name,widgets:s.widgets,layout:s.layout,activeSymbol:s.activeSymbol,watchlist:s.watchlist,locked:!!w.locked};});
   storage[key]=JSON.stringify({state,version:2});
  }else{
   const drawings=saved.state.drawings??{},settings=saved.state.settings??{};if(Array.isArray(drawings)||Array.isArray(settings)||typeof drawings!=='object'||typeof settings!=='object')throw Error('Invalid chart tools');
   for(const [s,list] of Object.entries(drawings)){if(!symbol(s)||!Array.isArray(list)||list.length>500)throw Error('Invalid drawings');for(const d of list){const size=d.kind==='horizontal'?1:['trend','measure'].includes(d.kind)?2:0;if(!size||typeof d.id!=='string'||!Array.isArray(d.points)||d.points.length!==size||d.points.some(p=>!Number.isSafeInteger(p.time)||p.time<=0||!Number.isFinite(p.price)))throw Error('Invalid drawing');}}
   for(const s of Object.values(settings))if(!s||Object.keys(s).length!==4||!['smaFast','smaSlow','smaLong','ema'].every(k=>Number.isInteger(s[k])&&s[k]>=2&&s[k]<=500))throw Error('Invalid indicator settings');
   storage[key]=JSON.stringify({state:{drawings,settings},version:1});
  }
 }
 if(!storage['openterminal-workspace'])throw Error('Workspace missing');return {format:data.format,version:1,storage};
}
module.exports={ORIGIN,proxyTarget,externalUrl,childEnvironment,atomicJSON,readJSON,validateWorkspaceBackup};
