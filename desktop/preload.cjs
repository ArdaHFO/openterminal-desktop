const {ipcRenderer}=require('electron');
// No Electron API is exposed to page scripts. Only a real user link click is relayed.
window.addEventListener('click',event=>{if(!event.isTrusted)return;const anchor=event.target?.closest?.('a[href]');if(!anchor)return;try{const u=new URL(anchor.href);if(['http:','https:'].includes(u.protocol)){event.preventDefault();ipcRenderer.send('open-external-link',u.href);}}catch{}},true);
