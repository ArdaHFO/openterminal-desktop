"use client";
import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import {canonicalSymbol} from '../lib/instruments';
import {validDrawing,type Drawing} from '../lib/research';

type Settings={smaFast:number;smaSlow:number;smaLong:number;ema:number};
type Tools={drawings:Record<string,Drawing[]>;settings:Record<string,Settings>;add:(symbol:string,d:Drawing)=>void;remove:(symbol:string,id:string)=>void;clear:(symbol:string)=>void;configure:(widget:string,s:Settings)=>void};
export const defaultSettings:Settings={smaFast:20,smaSlow:50,smaLong:200,ema:20};
export const useChartTools=create<Tools>()(persist((set)=>({drawings:{},settings:{},
  add:(raw,d)=>{if(!validDrawing(d))return;const s=canonicalSymbol(raw);set(st=>({drawings:{...st.drawings,[s]:[...(st.drawings[s]??[]),d]}}));},
  remove:(raw,id)=>{const s=canonicalSymbol(raw);set(st=>({drawings:{...st.drawings,[s]:(st.drawings[s]??[]).filter(d=>d.id!==id)}}));},
  clear:raw=>{const s=canonicalSymbol(raw);set(st=>({drawings:{...st.drawings,[s]:[]}}));},
  configure:(widget,s)=>{if(Object.values(s).every(n=>Number.isInteger(n)&&n>=2&&n<=500))set(st=>({settings:{...st.settings,[widget]:s}}));},
}),{name:'openterminal-chart-tools',version:1}));
