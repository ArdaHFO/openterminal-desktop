"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, fmt, fmtPrice, fmtBig, pctClass, quoteDelay, type Quote } from "../../lib/api";
import { normalizeSymbol, symbolsParam } from "../../lib/symbol";
import { useTerminal } from "../../store/terminal";
import Flash from "../Flash";

export default function WatchlistWidget() {
  const watchlist = useTerminal((s) => s.watchlist);
  const addToWatchlist = useTerminal((s) => s.addToWatchlist);
  const removeFromWatchlist = useTerminal((s) => s.removeFromWatchlist);
  const setActiveSymbol = useTerminal((s) => s.setActiveSymbol);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);

  const { data = [], error } = useQuery({
    queryKey: ["watchlist", watchlist.join(",")],
    queryFn: () => apiGet<Quote[]>(`/api/quotes?symbols=${symbolsParam(watchlist)}`),
    enabled: watchlist.length > 0,
    refetchInterval: 5_000,
  });

  return (
    <div>
      <form
        className="flex gap-1 p-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          const sym = normalizeSymbol(input);
          if (!sym) {
            setInvalid(true);
            return;
          }
          addToWatchlist(sym);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setInvalid(false);
          }}
          placeholder="Add ticker…"
          title={invalid ? "Not a valid ticker symbol" : undefined}
          aria-invalid={invalid}
          className={`flex-1 ${invalid ? "!border-[var(--down)]" : ""}`}
        />
        <button className="term-btn" type="submit">+</button>
      </form>
      {error&&<div role="alert" className="p-2 down">Watchlist: {(error as Error).message}</div>}
      <table className="data-table">
        <thead>
          <tr><th>Sym</th><th>Last</th><th>Chg%</th><th>Vol</th><th></th></tr>
        </thead>
        <tbody>
          {watchlist.map((sym) => {
            const q = data.find((d) => d.symbol === normalizeSymbol(sym));
            return (
              <tr key={sym} onClick={() => setActiveSymbol(sym)}>
                <td className="font-bold">{sym}</td>
                <td><Flash value={q?.price}>{fmtPrice(q?.price)}</Flash>{q?.delayStatus && <span className="dim" title={`${q.source} · ${q.instrumentNote ?? ''} · ${quoteDelay(q)} · price time ${q.time ? new Date(q.time * 1000).toLocaleString() : 'unavailable'}`}> {q.source.startsWith('TradingView') ? 'TV*' : 'SRC*'}</span>}{q?.source === 'nasdaq' && /after.hours|pre.market/i.test(q.marketState ?? '') && <span className="dim" title={`${q.marketState} · price time ${q.time ? new Date(q.time * 1000).toLocaleString() : 'unavailable'}`}> AH*</span>}</td>
                <td className={pctClass(q?.changePercent)}>
                  <Flash value={q?.changePercent}>{fmt(q?.changePercent)}%</Flash>
                </td>
                <td title={q?.volumeType === 'tick' ? 'Tick count, not traded contracts' : q?.volumeType === 'contracts' ? 'Traded contracts' : undefined}>{fmtBig(q?.volume)}{q?.volumeType === 'tick' ? ' ticks' : ''}</td>
                <td>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(sym);
                    }}
                    aria-label={`Remove ${sym} from watchlist`}
                    className="dim hover:text-[var(--down)]"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.some(q => q.delayStatus) && <div className="p-1 dim text-[10px]">TV* / SRC* · hover for source, delay and price time</div>}
      {data.some(q => q.source === 'nasdaq' && /after.hours|pre.market/i.test(q.marketState ?? '')) && <div className="p-1 dim text-[10px]">AH* = Nasdaq extended-hours price · hover for session and price time</div>}
    </div>
  );
}
