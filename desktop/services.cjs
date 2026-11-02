const fs=require('node:fs');const path=require('node:path');const net=require('node:net');const {spawn}=require('node:child_process');const {randomBytes}=require('node:crypto');const {EventEmitter}=require('node:events');const {childEnvironment}=require('./policy.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(e=>e?reject(e):resolve(port));});});}
class Services extends EventEmitter{
 constructor(bundle,dataRoot,options={}){super();this.bundle=bundle;this.dataRoot=dataRoot;this.options=options;this.children=[];this.stopping=false;this.info=null;this.secret='';this.logDir=path.join(dataRoot,'logs');fs.mkdirSync(this.logDir,{recursive:true});}
 node(){return path.join(this.bundle,'runtime','node.exe');}
 spawn(name,script,cwd,env){
  const logFile=path.join(this.logDir,name+'.log');if(fs.existsSync(logFile)&&fs.statSync(logFile).size>5*1024*1024){try{fs.renameSync(logFile,logFile+'.previous');}catch{}}
  const log=fs.createWriteStream(logFile,{flags:'a',mode:0o600});log.on('error',()=>{});
  const child=spawn(this.node(),[path.join(this.bundle,script)],{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});this.children.push({name,child});
  const write=data=>log.write(data.toString().split(this.secret).join('[redacted]'));child.stdout.on('data',write);child.stderr.on('data',write);
  child.on('error',e=>{write(e.message);if(!this.stopping)this.emit('crash',name,e.message);});
  child.on('exit',(code,signal)=>{log.end();if(!this.stopping)this.emit('crash',name,`exit=${code} signal=${signal}`);});return child;
 }
 async wait(url,child,nonce,timeout=45000){
  const until=Date.now()+timeout;let last='';while(Date.now()<until){if(child.exitCode!==null||child.signalCode)throw Error('Service stopped before becoming ready');try{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(2000)});if(r.ok){const d=await r.json();if(d.ok&&d.service==='OpenTerminal'&&d.desktopInstance===nonce)return;last='Unexpected service identity';}}catch(e){last=e.message;}await pause(150);}throw Error('Service startup timed out: '+last);
 }
 async start(){
  this.stopping=false;this.secret=randomBytes(32).toString('hex');const nonce=randomBytes(18).toString('hex');const apiPort=this.options.apiPort??await freePort();let webPort=await freePort();while(webPort===apiPort)webPort=await freePort();
  const apiUrl=`http://127.0.0.1:${apiPort}`,webUrl=`http://127.0.0.1:${webPort}`,common={...childEnvironment(process.env),NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',API_KEY:this.secret,DESKTOP_INSTANCE_ID:nonce,DESKTOP_PARENT_PID:String(process.pid),DATA_DIR:path.join(this.dataRoot,'data')};
  fs.mkdirSync(common.DATA_DIR,{recursive:true});
  try{
   const api=this.spawn('api','bootstrap-api.mjs',this.bundle,{...common,API_PORT:String(apiPort),API_HOST:'127.0.0.1',WEB_ORIGIN:webUrl});await this.wait(apiUrl+'/api/status',api,nonce);
   const web=this.spawn('web','bootstrap-web.mjs',path.join(this.bundle,'web-app','web'),{...common,API_URL:apiUrl,HOSTNAME:'127.0.0.1',PORT:String(webPort)});await this.wait(webUrl+'/api/status',web,nonce,60000);
   const auth=await fetch(webUrl+'/api/portfolios',{signal:AbortSignal.timeout(5000)});if(!auth.ok||!Array.isArray(await auth.json()))throw Error('Authenticated API proxy check failed');
   this.info={apiUrl,webUrl,apiPort,webPort,nonce,apiPid:api.pid,webPid:web.pid};return this.info;
  }catch(e){await this.stop();throw e;}
 }
 async stop(){
  this.stopping=true;const owned=this.children.splice(0);
  await Promise.all(owned.map(async({child})=>{if(child.exitCode!==null||child.signalCode)return;const done=new Promise(r=>child.once('exit',r));try{if(child.connected)child.send({command:'shutdown'});}catch{}await Promise.race([done,pause(4500)]);if(child.exitCode===null&&!child.signalCode){child.kill();await Promise.race([done,pause(2000)]);}}));this.info=null;
 }
 async migrate(source,destination){
  return new Promise((resolve,reject)=>{const p=spawn(this.node(),[path.join(this.bundle,'migrate.cjs'),source,destination],{cwd:this.bundle,windowsHide:true,env:childEnvironment(process.env),stdio:['ignore','pipe','pipe']});let error='';p.stderr.on('data',d=>error+=d);p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(error||'Database backup failed')));});
 }
}
module.exports={Services,freePort};
