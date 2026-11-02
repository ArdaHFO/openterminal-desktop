// Run after NEXT_DIST_DIR=.next-desktop npm run build in the repository root.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),stage=path.resolve(__dirname,'../outputs/desktop-stage');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 if(process.platform!=='win32'||process.arch!=='x64'||process.version!=='v26.13.0')throw Error('Use Windows x64 with Node 26.13.0 for this pinned desktop release.');
 if(fs.existsSync(stage)&&!process.argv.includes('--resume'))throw Error('Stage already exists. Use --resume only for this build staging directory.');
 fs.mkdirSync(stage,{recursive:true});
 const copy=(from,to)=>fs.cpSync(path.join(repo,from),path.join(stage,to),{recursive:true});
 for(const name of ['bootstrap-api.mjs','bootstrap-web.mjs','migrate.cjs'])copy('desktop/'+name,name);
 copy('server/dist','server/dist');copy('server/package.json','server/package.json');copy('server/package-lock.json','server/package-lock.json');copy('catalog','catalog');copy('LICENSE','LICENSE');
 const standalone='web/.next-desktop/standalone/';
 for(const name of ['web','node_modules','package.json'])if(fs.existsSync(path.join(repo,standalone+name)))copy(standalone+name,'web-app/'+name);
 copy('web/.next-desktop/static','web-app/web/.next-desktop/static');if(fs.existsSync(path.join(repo,'web/public')))copy('web/public','web-app/web/public');
 fs.mkdirSync(path.join(stage,'runtime'),{recursive:true});fs.copyFileSync(process.execPath,path.join(stage,'runtime/node.exe'));
 const version=process.version;const sums=await (await fetch(`https://nodejs.org/dist/${version}/SHASUMS256.txt`)).text();const expected=sums.split('\n').find(l=>l.endsWith('win-x64/node.exe'))?.split(/\s+/)[0];
 const actual=hash(fs.readFileSync(path.join(stage,'runtime/node.exe')));if(!expected||expected!==actual)throw Error('Official Node runtime checksum mismatch');
 const license=await fetch(`https://raw.githubusercontent.com/nodejs/node/${version}/LICENSE`);if(!license.ok)throw Error('Node license download failed');fs.writeFileSync(path.join(stage,'runtime/LICENSE'),await license.text());
 let notices='OpenTerminal third-party notices\n\n';const moduleRoots=['node_modules','web/node_modules','server/node_modules'].map(p=>path.join(repo,p)).filter(p=>fs.existsSync(p));if(!moduleRoots.length)throw Error('Install workspace dependencies before staging.');
 function collect(dir,depth){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory()&&depth<3&&!['.cache','typescript','@types'].includes(ent.name))collect(file,depth+1);else if(ent.isFile()&&/^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)/i.test(ent.name)){const b=fs.readFileSync(file);if(b.length<1024*1024)notices+='\n--- '+path.relative(repo,file)+' ---\n'+b.toString()+'\n';}}}for(const modules of moduleRoots)collect(modules,0);fs.writeFileSync(path.join(stage,'THIRD_PARTY_NOTICES.txt'),notices);
 // npm is a build dependency only. The installed application uses its bundled node.exe.
 execFileSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm ci --omit=dev --workspaces=false --ignore-scripts --no-fund'],{cwd:path.join(stage,'server'),stdio:'inherit'});
 execFileSync(path.join(stage,'runtime/node.exe'),['-e',`const D=require('./server/node_modules/better-sqlite3');const d=new D(':memory:');if(d.prepare('select 1 x').get().x!==1)process.exit(1);d.close()`],{cwd:stage,stdio:'inherit'});
 const secrets=['data/.api-key','server/.env','web/.env.local'].filter(f=>fs.existsSync(path.join(repo,f))).map(f=>fs.readFileSync(path.join(repo,f))).filter(b=>b.length>=12);
 const files=[];function scan(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isSymbolicLink())throw Error('Unexpected symlink '+file);if(ent.isDirectory())scan(file);else{const rel=path.relative(stage,file).replaceAll('\\','/');if(/^terminal\.db(?:-|$)|^\.api-key$|^\.env(?:\.|$)/i.test(ent.name))throw Error('Private file in distribution: '+rel);const data=fs.readFileSync(file);if(secrets.some(b=>data.includes(b)))throw Error('Private credential in distribution: '+rel);files.push({path:rel,bytes:data.length,sha256:hash(data)});}}}scan(stage);
 fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify({version:require('./package.json').version,node:version,nodeABI:process.versions.modules,platform:'win32-x64',created:new Date().toISOString(),files},null,2));
 console.log(JSON.stringify({stage,files:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0),nodeSHA256:actual,privateFiles:0,privateCredentialMatches:0}));
}main().catch(e=>{console.error(e);process.exitCode=1;});
