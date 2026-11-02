let api,db,stopping=false;
async function stop(){if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),3500);timer.unref();if(api){api.closeAllConnections?.();await new Promise(r=>api.close(r));}try{db?.close();}catch{}process.exit(0);}
process.on('message',m=>{if(m?.command==='shutdown')void stop();});process.once('disconnect',()=>void stop());process.once('SIGTERM',()=>void stop());
// Windows Chromium children can retain inherited IPC handles after a main-process crash.
// Verify the owning process as well, rather than relying solely on pipe disconnection.
const parent=Number(process.env.DESKTOP_PARENT_PID);if(Number.isInteger(parent)&&parent>0)setInterval(()=>{try{process.kill(parent,0);}catch(e){if(e.code==='ESRCH')void stop();}},1000).unref();
const module=await import('./server/dist/index.js');api=module.apiServer;db=(await import('./server/dist/db.js')).db;if(stopping)void stop();
