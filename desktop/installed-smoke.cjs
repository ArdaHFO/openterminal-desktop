const { _electron,expect }=require('playwright/test');const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../outputs/desktop-audit'),exe=process.argv[2];let app;
async function main(){
 if(!exe||!path.isAbsolute(exe))throw Error('Pass the absolute installed executable path');
 const env={...process.env};for(const k of Object.keys(env))if(['PATH','NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE'].includes(k.toUpperCase()))delete env[k];env.PATH=path.join(process.env.SystemRoot,'System32');
 app=await _electron.launch({executablePath:exe,args:['--self-test','--test-root='+path.join(output,'installed-user-'+Date.now())],env,timeout:120000});const page=await app.firstWindow({timeout:120000});await page.getByRole('textbox',{name:'Workspace name',exact:true}).waitFor({timeout:60000});
 const info=await app.evaluate(()=>globalThis.__OT_TEST__.snapshot());const resources=await app.evaluate(()=>process.resourcesPath);assert.equal(resources,path.join(path.dirname(exe),'resources'));
 const api=await page.evaluate(async()=>({status:await(await fetch('/api/status')).json(),portfolios:await(await fetch('/api/portfolios')).json()}));assert.equal(api.status.desktopInstance,info.nonce);assert.ok(Array.isArray(api.portfolios));assert.equal((await fetch(info.apiUrl+'/api/portfolios')).status,401);
 await app.evaluate(()=>globalThis.__OT_TEST__.show());await page.screenshot({path:path.join(output,'installed-app.png')});await app.close();app=null;
 const closed=async url=>{try{await fetch(url+'/api/status',{signal:AbortSignal.timeout(1000)});return false;}catch{return true;}};await expect.poll(()=>closed(info.apiUrl),{timeout:10000}).toBe(true);await expect.poll(()=>closed(info.webUrl),{timeout:10000}).toBe(true);
 fs.writeFileSync(path.join(output,'installed-smoke.json'),JSON.stringify({passed:true,executable:exe,resources,origin:page.url(),noSystemNodeOnPath:true,authenticatedProxy:true,directApiProtected:true,ownedPortsClosed:true},null,2));console.log('Installed application smoke passed');
}main().catch(async e=>{console.error(e);if(app)await app.close().catch(()=>{});process.exitCode=1;});
