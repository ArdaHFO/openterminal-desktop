// Avoid the Windows archive-tool pipe wait using a standard, CRC-verified ZIP.
// No dependency code or OS settings are changed.
const path=require('node:path'),{execFileSync}=require('node:child_process');
async function main(){
 const cli=path.join(__dirname,'node_modules/electron-builder/cli.js'),out=path.resolve(__dirname,'../outputs/desktop-package'),unpacked=path.join(out,'win-unpacked');
 const run=args=>execFileSync(process.execPath,[cli,'--config','builder.cjs','--win','--x64',...args],{cwd:__dirname,stdio:'inherit'});
 run(['--dir']);
 execFileSync(process.env.PYTHON??'python',[path.join(__dirname,'archive.py')],{cwd:__dirname,stdio:'inherit'});
 // The supported prepackaged path and verified fresh archive avoid a second archive pass.
 run(['--prepackaged',unpacked]);
}main().catch(e=>{console.error(e.message);process.exitCode=1;});
