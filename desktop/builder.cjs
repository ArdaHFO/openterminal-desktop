const path=require('node:path');
module.exports={appId:'org.openterminal.desktop',productName:'OpenTerminal Desktop',asar:true,npmRebuild:false,compression:'store',
 beforePack:async()=>{require('./verify-stage.cjs').verify();},
 directories:{output:path.resolve(__dirname,'../outputs/desktop-package'),buildResources:path.join(__dirname,'assets')},
 files:['main.cjs','preload.cjs','services.cjs','policy.cjs','assets/icon.ico','package.json'],
 extraResources:[{from:path.resolve(__dirname,'../outputs/desktop-stage'),to:'services'}],
 win:{target:['nsis'],icon:'assets/icon.ico',artifactName:'OpenTerminal-Kurulum-${version}-${arch}.${ext}'},
 nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,createDesktopShortcut:'always',createStartMenuShortcut:true,shortcutName:'OpenTerminal Desktop',runAfterFinish:false,include:'assets/installer.nsh',installerLanguages:['tr_TR','en_US'],differentialPackage:false,useZip:true},
 publish:null};
