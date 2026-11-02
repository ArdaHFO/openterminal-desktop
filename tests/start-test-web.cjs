const {spawn} = require('node:child_process');
const path = require('node:path');
const web = path.join(__dirname, '..', 'web');
const next = require.resolve('next/dist/bin/next', {paths:[web]});
const child = spawn(process.execPath, [next,'dev','--hostname','127.0.0.1','--port','3200'], {
  cwd:web, env:{...process.env,NEXT_DIST_DIR:'.next-e2e'}, stdio:'inherit', windowsHide:true,
});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
