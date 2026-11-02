"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeSymbol, normalizeWorkspaceSymbols } from "../lib/symbol";

export type WidgetType =
  | "quote"
  | "chart"
  | "watchlist"
  | "news"
  | "heatmap"
  | "screener"
  | "crypto"
  | "macro"
  | "options"
  | "portfolio"
  | "ai"
  | "calendar"
  | "insider"
  | "tv"
  | "recap"
  | "catalog"
  | "metals"
  | "replay";

export type WidgetInstance = {
  id: string;
  type: WidgetType;
  symbol?: string;
  linked: boolean; // follows the globally active symbol
};

export type LayoutItem = { i: string; x: number; y: number; w: number; h: number };

export type WorkspaceSnapshot = {id:string;name:string;activeSymbol:string;widgets:WidgetInstance[];layout:LayoutItem[];watchlist:string[];locked:boolean};
type TerminalState = {
  savedWorkspaces: WorkspaceSnapshot[];
  layoutLocked: boolean;
  maximizedId: string | null;
  saveWorkspace: (name:string, id?:string) => void;
  loadWorkspace: (id:string) => void;
  deleteWorkspace: (id:string) => void;
  renameWorkspace: (id:string,name:string) => void;
  setLayoutLocked: (locked:boolean) => void;
  setMaximized: (id:string|null) => void;
  applyPreset: (kind:'metals'|'stocks'|'crypto') => void;
  activeSymbol: string;
  widgets: WidgetInstance[];
  layout: LayoutItem[];
  watchlist: string[];
  commandOpen: boolean;
  setActiveSymbol: (s: string) => void;
  setCommandOpen: (open: boolean) => void;
  addWidget: (type: WidgetType, symbol?: string) => void;
  removeWidget: (id: string) => void;
  setWidgetSymbol: (id: string, symbol: string) => void;
  toggleLinked: (id: string) => void;
  setLayout: (layout: LayoutItem[]) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  resetWorkspace: () => void;
};

const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: "w-chart", type: "chart", linked: true },
  { id: "w-quote", type: "quote", linked: true },
  { id: "w-watchlist", type: "watchlist", linked: false },
  { id: "w-news", type: "news", linked: true },
  { id: "w-macro", type: "macro", linked: false },
];

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "w-chart", x: 0, y: 0, w: 7, h: 12 },
  { i: "w-quote", x: 7, y: 0, w: 5, h: 6 },
  { i: "w-watchlist", x: 7, y: 6, w: 5, h: 6 },
  { i: "w-news", x: 0, y: 12, w: 7, h: 7 },
  { i: "w-macro", x: 7, y: 12, w: 5, h: 7 },
];

const SIZE_BY_TYPE: Record<WidgetType, { w: number; h: number }> = {
  quote: { w: 5, h: 6 },
  chart: { w: 7, h: 12 },
  watchlist: { w: 4, h: 7 },
  news: { w: 5, h: 8 },
  heatmap: { w: 7, h: 10 },
  screener: { w: 12, h: 9 },
  crypto: { w: 6, h: 9 },
  macro: { w: 5, h: 7 },
  options: { w: 12, h: 9 },
  portfolio: { w: 7, h: 8 },
  ai: { w: 5, h: 10 },
  calendar: { w: 12, h: 11 },
  insider: { w: 7, h: 9 },
  tv: { w: 6, h: 11 },
  recap: { w: 5, h: 12 },
  catalog: { w:12, h:14 },
  metals: { w: 12, h: 18 },
  replay: { w: 12, h: 22 },
};

export const useTerminal = create<TerminalState>()(
  persist(
    (set, get) => ({
      savedWorkspaces: [], layoutLocked:false, maximizedId:null,
      setLayoutLocked: layoutLocked=>set({layoutLocked}),
      setMaximized: maximizedId=>set({maximizedId}),
      saveWorkspace: (name,id)=> {
        name=name.trim().slice(0,60); if(!name)return;
        const st=get();
        const snapshot:WorkspaceSnapshot=JSON.parse(JSON.stringify({id:id??crypto.randomUUID(),name,activeSymbol:st.activeSymbol,widgets:st.widgets,layout:st.layout,watchlist:st.watchlist,locked:st.layoutLocked}));
        set({savedWorkspaces:[...st.savedWorkspaces.filter(w=>w.id!==snapshot.id),snapshot]});
      },
      loadWorkspace: id=> {
        const w=get().savedWorkspaces.find(w=>w.id===id); if(!w)return;
        const copy=JSON.parse(JSON.stringify(w)) as WorkspaceSnapshot;
        set({activeSymbol:copy.activeSymbol,widgets:copy.widgets,layout:copy.layout,watchlist:copy.watchlist,layoutLocked:copy.locked,maximizedId:null});
      },
      deleteWorkspace:id=>set(st=>({savedWorkspaces:st.savedWorkspaces.filter(w=>w.id!==id)})),
      renameWorkspace:(id,name)=> {name=name.trim().slice(0,60);if(name)set(st=>({savedWorkspaces:st.savedWorkspaces.map(w=>w.id===id?{...w,name}:w)}));},
      applyPreset:kind=> {
        const symbol=kind==='metals'?'XAUUSD':kind==='crypto'?'BTC':'AAPL';
        const types:WidgetType[]=kind==='metals'?['metals','chart','quote','watchlist']:['chart','quote',kind==='crypto'?'crypto':'screener','watchlist'];
        let y=0;const widgets:WidgetInstance[]=[];const layout:LayoutItem[]=[];
        for(const type of types){const id=crypto.randomUUID();widgets.push({id,type,linked:true});const size=SIZE_BY_TYPE[type];layout.push({i:id,x:0,y,w:12,h:size.h});y+=size.h;}
        set({widgets,layout,activeSymbol:symbol,layoutLocked:false,maximizedId:null,watchlist:kind==='metals'?['XAUUSD','XAGUSD','GC=F','SI=F']:kind==='crypto'?['BTC','ETH','SOL']:['AAPL','MSFT','SPY']});
      },
      activeSymbol: "AAPL",
      widgets: DEFAULT_WIDGETS,
      layout: DEFAULT_LAYOUT,
      watchlist: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "SPY"],
      commandOpen: false,
      setActiveSymbol: (s) => {
        const sym = normalizeSymbol(s);
        if (sym) set({ activeSymbol: sym });
      },
      setCommandOpen: (open) => set({ commandOpen: open }),
      addWidget: (type, symbol) =>
        set((st) => {
          const id = `w-${type}-${crypto.randomUUID()}`;
          const size = SIZE_BY_TYPE[type];
          const maxY = st.layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
          return {
            widgets: [...st.widgets, { id, type, symbol: symbol ? normalizeSymbol(symbol) ?? symbol : undefined, linked: !symbol }],
            layout: [...st.layout, { i: id, x: 0, y: maxY, ...size }],
          };
        }),
      removeWidget: (id) =>
        set((st) => ({
          widgets: st.widgets.filter((w) => w.id !== id),
          maximizedId: st.maximizedId===id ? null : st.maximizedId,
          layout: st.layout.filter((l) => l.i !== id),
        })),
      setWidgetSymbol: (id, symbol) => {
        const sym = normalizeSymbol(symbol);
        if (!sym) return;
        set((st) => ({
          widgets: st.widgets.map((w) => (w.id === id ? { ...w, symbol: sym, linked: false } : w)),
        }));
      },
      toggleLinked: (id) =>
        set((st) => ({
          widgets: st.widgets.map((w) => (w.id === id ? { ...w, linked: !w.linked, ...(w.linked?{symbol:st.activeSymbol}:{}) } : w)),
        })),
      setLayout: (layout) => set({ layout }),
      addToWatchlist: (s) => {
        const sym = normalizeSymbol(s);
        if (!sym) return;
        set((st) => ({
          watchlist: st.watchlist.includes(sym) ? st.watchlist : [...st.watchlist, sym],
        }));
      },
      removeFromWatchlist: (s) => set((st) => ({ watchlist: st.watchlist.filter((x) => x !== s) })),
      resetWorkspace: () => set({ widgets: DEFAULT_WIDGETS, layout: DEFAULT_LAYOUT }),
    }),
    {
      name: "openterminal-workspace",
      version: 2,
      migrate: (saved) => normalizeWorkspaceSymbols(saved) as unknown as TerminalState,
      merge: (saved, current) => ({...current, ...normalizeWorkspaceSymbols(saved), maximizedId:null, commandOpen:false}),
    }
  )
);

/** Symbol a widget should display: its own, or the active one when linked. */
export function useWidgetSymbol(widget: WidgetInstance): string {
  const active = useTerminal((s) => s.activeSymbol);
  const raw = widget.linked ? active : widget.symbol ?? active;
  return normalizeSymbol(raw) ?? raw;
}
