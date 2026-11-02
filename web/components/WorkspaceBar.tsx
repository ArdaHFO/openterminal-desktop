"use client";
import { useState } from 'react';
import { useTerminal } from '../store/terminal';

export default function WorkspaceBar() {
  const st=useTerminal();
  const [name,setName]=useState('');
  const [selected,setSelected]=useState('');
  const [preset,setPreset]=useState<'metals'|'stocks'|'crypto'>('metals');
  const [confirm,setConfirm]=useState(false);
  const [notice,setNotice]=useState('');
  return <section aria-label="Workspace controls" className="flex flex-wrap items-center gap-1 p-1 border-b border-[var(--border)] shrink-0">
    <select aria-label="Saved workspace" value={selected} onChange={e=>setSelected(e.target.value)}>
      <option value="">Saved workspaces…</option>{st.savedWorkspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
    <button className="term-btn" disabled={!selected} onClick={()=>{st.loadWorkspace(selected);setNotice('Workspace loaded');}}>Load</button>
    <input aria-label="Workspace name" placeholder="Workspace name" maxLength={60} value={name} onChange={e=>setName(e.target.value)}/>
    <button className="term-btn" disabled={!name.trim()} onClick={()=>{st.saveWorkspace(name);setNotice('Workspace saved');}}>Save new</button>
    <button className="term-btn" disabled={!selected} onClick={()=>{st.saveWorkspace(st.savedWorkspaces.find(w=>w.id===selected)!.name,selected);setNotice('Workspace updated');}}>Update saved</button>
    <button className="term-btn" disabled={!selected||!name.trim()} onClick={()=>{st.renameWorkspace(selected,name);setNotice('Workspace renamed');}}>Rename</button>
    <button className="term-btn" disabled={!selected} onClick={()=>{st.deleteWorkspace(selected);setSelected('');setNotice('Saved workspace removed; current layout kept');}}>Delete saved</button>
    <button className="term-btn" onClick={()=>{const storage=Object.fromEntries(['openterminal-workspace','openterminal-chart-tools'].map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null));const url=URL.createObjectURL(new Blob([JSON.stringify({format:'openterminal-workspace-backup',version:1,storage},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='OpenTerminal-Duzen.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Layout exported for desktop import');}}>Export layout</button>
    <label><input aria-label="Lock layout" type="checkbox" checked={st.layoutLocked} onChange={e=>st.setLayoutLocked(e.target.checked)}/> Lock layout</label>
    <select aria-label="Workspace preset" value={preset} onChange={e=>{setPreset(e.target.value as typeof preset);setConfirm(false);}}><option value="metals">Metals</option><option value="stocks">Stocks</option><option value="crypto">Crypto</option></select>
    <button className="term-btn" onClick={()=>{if(!confirm){setConfirm(true);return;}st.saveWorkspace('Before preset '+new Date().toLocaleString());st.applyPreset(preset);setConfirm(false);setNotice('Preset applied; previous layout saved');}}>{confirm?'Confirm preset':'Apply preset'}</button>
    <span role="status" className="dim">{notice}</span>
  </section>;
}
