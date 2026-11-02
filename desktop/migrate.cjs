const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const Database=require('./server/node_modules/better-sqlite3');
async function backup(source,destination){
 source=path.resolve(source);destination=path.resolve(destination);if(source===destination||fs.existsSync(destination))throw Error('Destination already exists');if(fs.statSync(source).size>512*1024*1024)throw Error('Database exceeds 512 MiB');
 const db=new Database(source,{readonly:true,fileMustExist:true});let partial=destination+'.partial-'+crypto.randomUUID();
 try{
  if(db.pragma('quick_check',{simple:true})!=='ok')throw Error('Database integrity check failed');
  const objects=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
  if(objects.some(o=>!['table','index'].includes(o.type)||o.type==='table'&&!['portfolios','transactions'].includes(o.name)||o.sql?.includes('CREATE VIRTUAL')))throw Error('Unexpected database schema');
  for(const [table,cols] of [['portfolios',['id','name','created_at']],['transactions',['id','portfolio_id','symbol','side','quantity','price','executed_at']]]){
   const actual=db.pragma('table_info('+table+')').map(c=>c.name);if(JSON.stringify(actual)!==JSON.stringify(cols))throw Error('Not an OpenTerminal portfolio database');
  }
  if(db.pragma('foreign_key_check').length)throw Error('Invalid portfolio references');
  fs.mkdirSync(path.dirname(destination),{recursive:true});await db.backup(partial);fs.renameSync(partial,destination);
 }finally{db.close();if(fs.existsSync(partial))fs.unlinkSync(partial);}
}
if(require.main===module)backup(process.argv[2],process.argv[3]).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={backup};
