const {app,BrowserWindow,Menu,Tray,dialog,shell,protocol,net,session,ipcMain}=require('electron');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {Services}=require('./services.cjs');const {ORIGIN,proxyTarget,externalUrl,atomicJSON,readJSON,validateWorkspaceBackup}=require('./policy.cjs');
const selfTest=process.argv.includes('--self-test');const arg=name=>process.argv.find(v=>v.startsWith(name+'='))?.slice(name.length+1);
const testRoot=selfTest?arg('--test-root'):null;if(selfTest&&(!testRoot||!path.isAbsolute(testRoot)))throw Error('Self-test needs an absolute isolated --test-root');
const root=testRoot??path.join(process.env.LOCALAPPDATA??app.getPath('appData'),'OpenTerminal Desktop');
fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'profile'));app.setPath('sessionData',path.join(root,'profile'));app.setAppUserModelId('org.openterminal.desktop');
const bundle=app.isPackaged?path.join(process.resourcesPath,'services'):path.resolve(__dirname,'../outputs/desktop-stage');
protocol.registerSchemesAsPrivileged([{scheme:'openterminal',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true,codeCache:true}}]);
const settingsFile=path.join(root,'settings.json');let settings=readJSON(settingsFile,{}),win,tray,services,quitting=false,booting=true,restarting=false;
function log(message){try{fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.appendFileSync(path.join(root,'logs','desktop.log'),new Date().toISOString()+' '+message+'\n');}catch{}}
function show(){if(win&&!win.isDestroyed()){win.show();if(win.isMinimized())win.restore();win.focus();}}
function saveSettings(){atomicJSON(settingsFile,settings);}
async function quit(){if(quitting)return;quitting=true;await services?.stop();tray?.destroy();app.quit();}
async function restart(){if(restarting||quitting)return;restarting=true;booting=true;try{await services.stop();await services.start();await win.loadURL(ORIGIN+'/');show();}catch(e){await failure(e);}finally{booting=false;restarting=false;}}
async function failure(e){log('ERROR '+e.message);if(selfTest){atomicJSON(path.join(root,'failure.json'),{message:e.message});await quit();return;}const result=await dialog.showMessageBox({type:'error',title:'OpenTerminal',message:'Uygulama servisi başlatılamadı.',detail:e.message+'\nGünlükler: '+path.join(root,'logs'),buttons:['Yeniden dene','Kapat'],defaultId:0,cancelId:1});if(result.response===0){if(!win){app.relaunch();await quit();}else setTimeout(()=>void restart(),0);}else await quit();}
async function exportWorkspace(){
 const result=await dialog.showSaveDialog(win,{title:'Düzen yedeğini kaydet',defaultPath:'OpenTerminal-Duzen.json',filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return;
 const data=await win.webContents.executeJavaScript(`({format:'openterminal-workspace-backup',version:1,storage:Object.fromEntries(['openterminal-workspace','openterminal-chart-tools'].map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null))})`);
 fs.writeFileSync(result.filePath,JSON.stringify(validateWorkspaceBackup(data),null,2),{mode:0o600});
}
async function importWorkspace(){
 const result=await dialog.showOpenDialog(win,{title:'Tarayıcı/masaüstü düzen yedeğini seç',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(result.canceled)return;
 const file=result.filePaths[0];if(fs.statSync(file).size>5*1024*1024)throw Error('Düzen yedeği çok büyük.');const data=validateWorkspaceBackup(fs.readFileSync(file,'utf8'));
 const old=await win.webContents.executeJavaScript(`({format:'openterminal-workspace-backup',version:1,storage:Object.fromEntries(['openterminal-workspace','openterminal-chart-tools'].map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null))})`);
 atomicJSON(path.join(root,'backups','workspace-'+Date.now()+'.json'),old);
 await win.webContents.executeJavaScript(`(()=>{for(const [k,v] of Object.entries(${JSON.stringify(data.storage)}))localStorage.setItem(k,v);})()`);await win.reload();
}
async function databaseBackup(){const result=await dialog.showSaveDialog(win,{title:'Portföy yedeğini kaydet',defaultPath:'OpenTerminal-Portfoy.db',filters:[{name:'SQLite',extensions:['db']}]});if(result.canceled)return;await services.migrate(path.join(root,'data','terminal.db'),result.filePath);}
async function databaseImport(){
 const result=await dialog.showOpenDialog(win,{title:'OpenTerminal portföy veritabanını seç',properties:['openFile'],filters:[{name:'SQLite',extensions:['db']}]});if(result.canceled)return;
 const confirm=await dialog.showMessageBox(win,{type:'question',message:'Seçilen portföy yedeği içe aktarılsın mı?',detail:'Mevcut veritabanının yedeği saklanacak. Kaynak dosya değiştirilmeyecek.',buttons:['İçe aktar','İptal'],defaultId:1,cancelId:1});if(confirm.response!==0)return;
 const db=path.join(root,'data','terminal.db'),temp=path.join(root,'backups','import-'+Date.now()+'.db'),previous=path.join(root,'backups','portfolio-'+Date.now()+'.db');await services.migrate(result.filePaths[0],temp);booting=true;
 try{await services.stop();if(fs.existsSync(db))fs.renameSync(db,previous);fs.renameSync(temp,db);await services.start();await win.loadURL(ORIGIN+'/');}
 catch(e){await services.stop();if(fs.existsSync(previous)){if(fs.existsSync(db))fs.renameSync(db,path.join(root,'backups','failed-import-'+Date.now()+'.db'));fs.renameSync(previous,db);}try{await services.start();await win.loadURL(ORIGIN+'/');}catch(recovery){await failure(recovery);}throw e;}
 finally{booting=false;}
}
const guarded=fn=>()=>Promise.resolve().then(fn).catch(e=>dialog.showErrorBox('OpenTerminal',e.message));
function menus(){
 const items=[{label:'OpenTerminal',submenu:[{label:'Göster',click:show},{label:'Tepsiye küçült',click:()=>win.hide()},{label:'Kapatınca tepside tut',type:'checkbox',checked:!!settings.closeToTray,click:i=>{settings.closeToTray=i.checked;saveSettings();}},{type:'separator'},{label:'Servisleri yeniden başlat',click:()=>void restart()},{label:'Tamamen kapat',accelerator:'Alt+F4',click:()=>void quit()}]},
 {label:'Yedekleme',submenu:[{label:'Düzeni dışa aktar…',click:guarded(exportWorkspace)},{label:'Düzeni içe aktar…',click:guarded(importWorkspace)},{type:'separator'},{label:'Portföy yedeğini kaydet…',click:guarded(databaseBackup)},{label:'Portföy yedeğini içe aktar…',click:guarded(databaseImport)},{label:'Veri klasörünü aç',click:()=>shell.openPath(root)}]},
 {label:'Görünüm',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
 {label:'Yardım',submenu:[{label:'Güncelleme bilgisi',click:()=>dialog.showMessageBox(win,{type:'info',message:'OpenTerminal Desktop '+app.getVersion(),detail:'Yeni sürümün kurulum paketini çalıştırmadan önce OpenTerminal > Tamamen kapat seçeneğini kullanın. Kurulum yenilenirken portföy ve düzen, ayrı kullanıcı veri klasöründe korunur. Otomatik güncelleme sunucusu yapılandırılmamıştır.'})},{label:'Günlük klasörünü aç',click:()=>shell.openPath(path.join(root,'logs'))},{label:'Hakkında',click:()=>dialog.showMessageBox(win,{type:'info',message:'OpenTerminal Desktop '+app.getVersion(),detail:'Windows x64 · Yerel veri servisi · Kullanıcı verileri: '+root})}]}];
 Menu.setApplicationMenu(Menu.buildFromTemplate(items));tray.setContextMenu(Menu.buildFromTemplate([{label:'OpenTerminal Desktop',enabled:false},{label:'Göster',click:show},{label:'Tepsiye küçült',click:()=>win.hide()},{type:'separator'},{label:'Tamamen kapat',click:()=>void quit()}]));
}
function validFrame(event){try{const u=new URL(event.senderFrame.url);return event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&u.protocol==='openterminal:'&&u.host==='app';}catch{return false;}}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',show);app.on('before-quit',e=>{if(!quitting){e.preventDefault();void quit();}});app.on('window-all-closed',()=>{if(!quitting)void quit();});
 app.whenReady().then(async()=>{
  try{
   services=new Services(bundle,root);services.on('crash',(name,detail)=>{log('SERVICE '+name+' '+detail);if(!booting&&!quitting&&!restarting)void failure(Error(name+' servisi durdu.'));});
   const legacy=arg('--import-legacy-db');if(legacy&&!fs.existsSync(path.join(root,'data','terminal.db')))await services.migrate(legacy,path.join(root,'data','terminal.db'));
   const info=await services.start();
   protocol.handle('openterminal',async request=>{
    try{
     const target=proxyTarget(request.url,services.info.webUrl);const headers={};for(const k of ['content-type','accept','rsc','next-router-state-tree','next-router-prefetch','next-url','range']){const v=request.headers.get(k);if(v)headers[k]=v;}
     const method=request.method;const upstream=await net.fetch(target,{method,headers,...(!['GET','HEAD'].includes(method)?{body:await request.arrayBuffer()}:{}),bypassCustomProtocolHandlers:true,redirect:'manual'});
     const responseHeaders=new Headers(upstream.headers);responseHeaders.delete('content-length');responseHeaders.delete('content-encoding');responseHeaders.delete('transfer-encoding');const location=responseHeaders.get('location');if(location?.startsWith(services.info.webUrl))responseHeaders.set('location',ORIGIN+location.slice(services.info.webUrl.length));
     if(responseHeaders.get('content-type')?.includes('text/html')){
      const html=await upstream.text();const hashes=[...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'");
      responseHeaders.set('content-security-policy',`default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; media-src 'self' blob: https:; frame-src https:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
      return new Response(html,{status:upstream.status,headers:responseHeaders});
     }return new Response(upstream.status===204||method==='HEAD'?null:upstream.body,{status:upstream.status,headers:responseHeaders});
    }catch(e){log('PROXY '+e.message);return new Response('OpenTerminal servisine ulaşılamıyor',{status:503});}
   });
   session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
   const bounds=settings.bounds??{};win=new BrowserWindow({width:Math.max(960,Math.min(2000,Number(bounds.width)||1440)),height:Math.max(650,Math.min(1500,Number(bounds.height)||960)),minWidth:960,minHeight:650,title:'OpenTerminal Desktop',backgroundColor:'#0a0a0a',icon:path.join(__dirname,'assets','icon.ico'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:!selfTest}});
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,details)=>{const url=typeof details==='string'?details:details?.url;try{proxyTarget(url,services.info.webUrl);}catch{event.preventDefault();}});
   ipcMain.on('open-external-link',(event,url)=>{if(validFrame(event)){const safe=externalUrl(url);if(safe)void shell.openExternal(safe);}});
   win.on('close',event=>{if(!quitting){event.preventDefault();if(settings.closeToTray)win.hide();else void quit();}});win.on('resize',()=>{if(!win.isMaximized()){settings.bounds=win.getBounds();saveSettings();}});
   tray=new Tray(path.join(__dirname,'assets','icon.ico'));tray.setToolTip('OpenTerminal Desktop');tray.on('double-click',show);tray.on('click',show);menus();
   if(selfTest)globalThis.__OT_TEST__={snapshot:()=>({...services.info,root,visible:win.isVisible(),version:app.getVersion()}),hide:()=>win.hide(),show,restart,quit};
   await win.loadURL(ORIGIN+'/');if(!selfTest)show();booting=false;log('READY '+JSON.stringify({version:app.getVersion(),apiPort:info.apiPort,webPort:info.webPort}));
  }catch(e){booting=false;await failure(e);}
 });
}
