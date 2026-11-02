"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, apiPost, apiDelete, fmt, fmtPrice, pctClass, quoteDelay, type Quote } from "../../lib/api";
import { normalizeSymbol, symbolsParam } from "../../lib/symbol";

type Portfolio = { id: number; name: string };
type Position = { symbol: string; quantity: number; avgCost: number; realizedPnl: number };
type Tx = { id: number; symbol: string; side: string; quantity: number; price: number; executed_at: string };

export default function PortfolioWidget() {
  const qc = useQueryClient();
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [formError,setFormError]=useState('');
  const [showTx, setShowTx] = useState(false);
  const [form, setForm] = useState({ symbol: "", side: "BUY", quantity: "", price: "" });

  const { data: portfolios = [], error: portfoliosError } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => apiGet<Portfolio[]>("/api/portfolios"),
  });
  const pid = portfolioId ?? portfolios[0]?.id;

  const { data: positions = [], error: positionsError } = useQuery({
    queryKey: ["positions", pid],
    queryFn: () => apiGet<Position[]>(`/api/portfolios/${pid}/positions`),
    enabled: !!pid,
  });

  const { data: txs = [], error: txsError } = useQuery({
    queryKey: ["transactions", pid],
    queryFn: () => apiGet<Tx[]>(`/api/portfolios/${pid}/transactions`),
    enabled: !!pid && showTx,
  });

  const symbols = positions.map((p) => p.symbol);
  const { data: quotes = [], error: quotesError } = useQuery({
    queryKey: ["pf-quotes", symbols.join(",")],
    queryFn: () => apiGet<Quote[]>(`/api/quotes?symbols=${symbolsParam(symbols)}`),
    enabled: symbols.length > 0,
    refetchInterval: 30_000,
  });

  const addTx = useMutation({
    mutationFn: () =>
      apiPost(`/api/portfolios/${pid}/transactions`, {
        symbol: form.symbol,
        side: form.side,
        quantity: Number(form.quantity),
        price: Number(form.price),
        executed_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions", pid] });
      qc.invalidateQueries({ queryKey: ["transactions", pid] });
      setForm({ symbol: "", side: "BUY", quantity: "", price: "" });
    },
  });
  const deleteTx = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/portfolios/${pid}/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions", pid] });
      qc.invalidateQueries({ queryKey: ["transactions", pid] });
    },
  });

  const totals = positions.reduce(
    (acc, p) => {
      const q = quotes.find((x) => x.symbol === normalizeSymbol(p.symbol));
      if (q?.price === null || q?.price === undefined || !Number.isFinite(q.price)) acc.missing++;
      else acc.marketValue += q.price * p.quantity;
      acc.cost += p.avgCost * p.quantity;
      acc.realized += p.realizedPnl;
      return acc;
    },
    { marketValue: 0, cost: 0, realized: 0, missing: 0 }
  );
  const marketValue = totals.missing ? null : totals.marketValue;
  const unrealized = marketValue === null ? null : marketValue - totals.cost;

  return (
    <div>
      {portfoliosError&&<div role="alert" className="p-2 down">Portfolio list: {(portfoliosError as Error).message}</div>}
      {txsError&&showTx&&<div role="alert" className="p-2 down">Transactions: {(txsError as Error).message}</div>}
      {quotesError&&<div role="alert" className="p-2 down">Position prices: {(quotesError as Error).message}</div>}
      {positionsError && <div className="p-2 down">Portfolio: {(positionsError as Error).message}</div>}
      {deleteTx.error && <div className="p-2 down">Cannot delete transaction: {(deleteTx.error as Error).message}</div>}
      <div className="flex gap-2 p-1 items-center flex-wrap">
        <select aria-label="Portfolio" disabled={addTx.isPending||deleteTx.isPending} value={pid ?? ""} onChange={(e) => setPortfolioId(Number(e.target.value))}>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className={`term-btn ${showTx ? "active" : ""}`} onClick={() => setShowTx(!showTx)}>
          TRANSACTIONS
        </button>
        <span className="ml-auto">
          MV <span className="amber">{fmt(marketValue)}</span>{" "}
          <span className="dim">Unrl</span> <span className={pctClass(unrealized)}>{fmt(unrealized)}</span>{" "}
          <span className="dim">Rlzd</span> <span className={pctClass(totals.realized)}>{fmt(totals.realized)}</span>
        </span>
      </div>
      {totals.missing > 0 && <div className="p-1 dim">Market value and unrealized PnL unavailable: {totals.missing} position price(s) missing.</div>}

      <form
        className="flex gap-1 p-1 flex-wrap border-b border-[var(--border)]"
        onSubmit={(e) => {
          e.preventDefault();
          if(addTx.isPending||!pid)return;
          if(!normalizeSymbol(form.symbol)||!form.quantity.trim()||Number(form.quantity)<=0||!Number.isFinite(Number(form.quantity))||!form.price.trim()||Number(form.price)<0||!Number.isFinite(Number(form.price))){setFormError('Enter a valid ticker, positive quantity and non-negative price.');return;}
          setFormError('');addTx.mutate();
        }}
      >
        <input className="w-20" placeholder="Ticker" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
        <select aria-label="Transaction side" value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
          <option>BUY</option><option>SELL</option>
        </select>
        <input className="w-20" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <input className="w-24" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <button className="term-btn" type="submit" disabled={addTx.isPending||!pid}>ADD</button>
        {addTx.error && <span className="down">{(addTx.error as Error).message}</span>}
      </form>

      {formError&&<div role="alert" className="p-1 down">{formError}</div>}
      {!showTx ? (
        <table className="data-table">
          <thead>
            <tr><th>Sym</th><th>Qty</th><th>Avg Cost</th><th>Last</th><th>Mkt Val</th><th>Unrl PnL</th><th>Rlzd PnL</th></tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const q = quotes.find((x) => x.symbol === normalizeSymbol(p.symbol));
              const last = q?.price ?? null;
              const mv = last !== null ? last * p.quantity : null;
              const upnl = last !== null ? (last - p.avgCost) * p.quantity : null;
              return (
                <tr key={p.symbol}>
                  <td className="font-bold">{p.symbol}</td>
                  <td>{fmt(p.quantity, 4)}</td>
                  <td>{fmtPrice(p.avgCost)}</td>
                  <td>{fmtPrice(last)}{q?.delayStatus && <span className="dim" title={`${q.source} · ${q.instrumentNote ?? ''} · ${quoteDelay(q)} · price time ${q.time ? new Date(q.time * 1000).toLocaleString() : 'unavailable'}`}> *</span>}</td>
                  <td>{fmt(mv)}</td>
                  <td className={pctClass(upnl)}>{fmt(upnl)}</td>
                  <td className={pctClass(p.realizedPnl)}>{fmt(p.realizedPnl)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Sym</th><th>Side</th><th>Qty</th><th>Price</th><th></th></tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td className="!text-left dim">{new Date(t.executed_at).toLocaleDateString()}</td>
                <td className="font-bold">{t.symbol}</td>
                <td className={t.side === "BUY" ? "up" : "down"}>{t.side}</td>
                <td>{fmt(t.quantity, 4)}</td>
                <td>{fmt(t.price)}</td>
                <td>
                  <button
                    className="dim hover:text-[var(--down)]"
                    aria-label={`Delete transaction ${t.id}`}
                    disabled={deleteTx.isPending||addTx.isPending}
                    onClick={() => deleteTx.mutate(t.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
