// The frontend owns no database. Parent IPC disconnection must never leave its server orphaned.
process.on('message',m=>{if(m?.command==='shutdown')process.exit(0);});process.once('disconnect',()=>process.exit(0));
const parent=Number(process.env.DESKTOP_PARENT_PID);if(Number.isInteger(parent)&&parent>0)setInterval(()=>{try{process.kill(parent,0);}catch(e){if(e.code==='ESRCH')process.exit(0);}},1000).unref();
await import('./web-app/web/server.js');
