"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import CatalogWidget from "./widgets/CatalogWidget";
import MetalsWidget from "./widgets/MetalsWidget";
import ReplayWidget from "./widgets/ReplayWidget";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { normalizeSymbol } from "../lib/symbol";
import { useTerminal, type WidgetInstance } from "../store/terminal";
import QuoteWidget from "./widgets/QuoteWidget";
import ChartWidget from "./widgets/ChartWidget";
import WatchlistWidget from "./widgets/WatchlistWidget";
import NewsWidget from "./widgets/NewsWidget";
import HeatmapWidget from "./widgets/HeatmapWidget";
import ScreenerWidget from "./widgets/ScreenerWidget";
import CryptoWidget from "./widgets/CryptoWidget";
import MacroWidget from "./widgets/MacroWidget";
import OptionsWidget from "./widgets/OptionsWidget";
import PortfolioWidget from "./widgets/PortfolioWidget";
import AiWidget from "./widgets/AiWidget";
import CalendarWidget from "./widgets/CalendarWidget";
import InsiderWidget from "./widgets/InsiderWidget";
import TvWidget from "./widgets/TvWidget";
import RecapWidget from "./widgets/RecapWidget";
import WidgetErrorBoundary from "./WidgetErrorBoundary";

const Grid = WidthProvider(GridLayout);

function WidgetBody({ widget }: { widget: WidgetInstance }) {
  switch (widget.type) {
    case "catalog": return <CatalogWidget />;
    case "metals": return <MetalsWidget widget={widget} />;
    case "replay": return <ReplayWidget widget={widget} />;
    case "quote": return <QuoteWidget widget={widget} />;
    case "chart": return <ChartWidget widget={widget} />;
    case "watchlist": return <WatchlistWidget />;
    case "news": return <NewsWidget widget={widget} />;
    case "heatmap": return <HeatmapWidget />;
    case "screener": return <ScreenerWidget />;
    case "crypto": return <CryptoWidget />;
    case "macro": return <MacroWidget />;
    case "options": return <OptionsWidget widget={widget} />;
    case "portfolio": return <PortfolioWidget />;
    case "ai": return <AiWidget />;
    case "calendar": return <CalendarWidget />;
    case "insider": return <InsiderWidget widget={widget} />;
    case "tv": return <TvWidget widgetId={widget.id} />;
    case "recap": return <RecapWidget />;
  }
}

function SymbolTag({ widget, activeSymbol }: { widget: WidgetInstance; activeSymbol: string }) {
  const setWidgetSymbol = useTerminal((s) => s.setWidgetSymbol);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = widget.linked ? activeSymbol : widget.symbol ?? activeSymbol;

  useEffect(() => {
    if (!editing) return;
    setDraft(shown);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = normalizeSymbol(draft);
            if (v) setWidgetSymbol(widget.id, v);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        className="ml-2 w-16 !border-0 !border-b !border-[var(--amber-dim)] bg-transparent text-[var(--text)] px-0 py-0 text-[13px] leading-none"
      />
    );
  }

  return (
    <span
      className="ml-2 text-[var(--text)] cursor-pointer hover:text-[var(--amber)]"
      title="Click to set this widget's ticker"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => setEditing(true)}
    >
      {shown}
    </span>
  );
}

const TITLES: Record<string, string> = {
  catalog: "Instrument Catalogue", metals: "Metal Analysis", replay: "Historical Replay / Strategy Test",
  quote: "Quote", chart: "Chart", watchlist: "Watchlist", news: "News",
  heatmap: "Heatmap", screener: "Screener", crypto: "Crypto",
  macro: "Macro / Indexes", options: "Option Chain", portfolio: "Portfolio", ai: "AI Assistant",
  calendar: "Calendar", insider: "Insider Transactions", tv: "Live TV", recap: "Market Recap",
};

// A stable portal target preserves every widget's form, filters and query state when maximizing.
function PersistentPanel({maximized,children}:{maximized:boolean;children:ReactNode}) {
  const mount=useRef<HTMLDivElement>(null);
  const [host,setHost]=useState<HTMLDivElement|null>(null);
  useEffect(()=>{const node=document.createElement('div');node.className='h-full';setHost(node);return()=>node.remove();},[]);
  useLayoutEffect(()=>{if(host)(maximized?document.body:mount.current)?.appendChild(host);},[host,maximized]);
  return <div ref={mount} className="h-full">{host?createPortal(children,host):null}</div>;
}

export default function Workspace() {
  const widgets = useTerminal((s) => s.widgets);
  const layout = useTerminal((s) => s.layout);
  const setLayout = useTerminal((s) => s.setLayout);
  const removeWidget = useTerminal((s) => s.removeWidget);
  const toggleLinked = useTerminal((s) => s.toggleLinked);
  const activeSymbol = useTerminal((s) => s.activeSymbol);
  const previousIds = useRef<Set<string> | null>(null);
  const widgetElements = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const previous = previousIds.current;
    previousIds.current = new Set(widgets.map(w => w.id));
    // Initial hydration and existing widgets keep their current scroll position.
    const added = previous ? widgets.filter(w => !previous.has(w.id)).at(-1) : undefined;
    if (!added) return;
    const frame = requestAnimationFrame(() => {
      const panel = widgetElements.current.get(added.id);
      const scroller = panel?.closest('main');
      if (panel && scroller) {
        const top = scroller.scrollTop + panel.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTo({ top, behavior: 'auto' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [widgets]);

  const symbolAware = new Set(["quote", "chart", "news", "options", "insider", "replay"]);
  const layoutLocked=useTerminal(s=>s.layoutLocked);
  const maximizedId=useTerminal(s=>s.maximizedId);
  const setMaximized=useTerminal(s=>s.setMaximized);
  useEffect(()=>{if(!maximizedId)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setMaximized(null);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[maximizedId,setMaximized]);

  return (
    <Grid
      className="layout"
      layout={layout}
      cols={12}
      rowHeight={30}
      margin={[4, 4]}
      draggableHandle=".panel-title"
      isDraggable={!layoutLocked}
      isResizable={!layoutLocked}
      onLayoutChange={(l) => setLayout(l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })))}
    >
      {widgets.map((w) => {
        const panel=<div className={`terminal-panel ${maximizedId===w.id?'fixed inset-2 z-40':''}`} style={maximizedId===w.id?{height:'calc(100vh - 16px)'}:undefined} ref={node => {
            if (node) widgetElements.current.set(w.id, node);
            else widgetElements.current.delete(w.id);
          }}>
            <div className="panel-title">
              <span>
                {TITLES[w.type]}
                {symbolAware.has(w.type) && <SymbolTag widget={w} activeSymbol={activeSymbol} />}
              </span>
              <span className="flex gap-2 items-center">
                <button aria-label={maximizedId===w.id?'Restore widget':'Maximize widget'} onMouseDown={e=>e.stopPropagation()} onClick={()=>setMaximized(maximizedId===w.id?null:w.id)}>{maximizedId===w.id?'Restore':'□'}</button>
                {symbolAware.has(w.type) && (
                  <button
                    title={w.linked ? "Linked to active symbol (click to unlink)" : "Unlinked (click to link)"}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => toggleLinked(w.id)}
                    className={w.linked ? "text-[var(--amber)]" : "dim"}
                  >
                    ⛓
                  </button>
                )}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label={`Close ${TITLES[w.type]} widget`}
                  onClick={() => removeWidget(w.id)}
                  className="dim hover:text-[var(--down)]"
                >
                  ✕
                </button>
              </span>
            </div>
            <div className="flex-1 overflow-auto min-h-0 pb-5">
              <WidgetErrorBoundary name={TITLES[w.type]}>
                <WidgetBody widget={w} />
              </WidgetErrorBoundary>
            </div>
          </div>;
        return <div key={w.id} data-widget-id={w.id}><PersistentPanel maximized={maximizedId===w.id}>{panel}</PersistentPanel></div>;
      })}
    </Grid>
  );
}
