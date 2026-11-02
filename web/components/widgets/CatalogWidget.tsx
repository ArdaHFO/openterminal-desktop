"use client";
import {useState} from 'react';
import {instruments} from '../../lib/instruments';
import {useTerminal} from '../../store/terminal';
export default function CatalogWidget() {
  const [query,setQuery]=useState(''),[kind,setKind]=useState('all');
  const select=useTerminal(s=>s.setActiveSymbol);
  const rows=instruments.filter(r=>(kind==='all'||r.kind===kind)&&[r.symbol,r.name,...r.aliases].some(s=>s.toLowerCase().includes(query.toLowerCase())));
  return <div><div className="p-2 dim">Verified instrument mappings and configured features. Other listings remain available through global search; provider availability may vary.</div>
    <div className="p-1 flex gap-2"><input aria-label="Catalogue search" placeholder="Symbol, name or alias" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Instrument type" value={kind} onChange={e=>setKind(e.target.value)}>{['all','spot','futures','stock','etf','crypto','index'].map(k=><option key={k}>{k}</option>)}</select><span>{rows.length} instruments</span></div>
    <table className="data-table"><thead><tr><th>Symbol / aliases</th><th>Name</th><th>Kind / exchange</th><th>Unit</th><th>Configured features</th></tr></thead><tbody>{rows.map(r=><tr key={r.symbol} onClick={()=>select(r.symbol)}><td>{r.symbol}<div className="dim">{r.aliases.join(', ')}</div></td><td>{r.name}</td><td>{r.kind} / {r.exchange}</td><td>{r.unit}</td><td className="!whitespace-normal">{Object.entries(r.capabilities).filter(([,v])=>v).map(([k])=>k).join(', ')}</td></tr>)}</tbody></table>
  </div>;
}
