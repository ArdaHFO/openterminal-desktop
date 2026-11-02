"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, fmt, fmtPrice, fmtBig, pctClass, quoteDelay, type Quote } from "../../lib/api";
import { useWidgetSymbol, type WidgetInstance } from "../../store/terminal";
import Flash from "../Flash";
import { isMetalSymbol } from '../../lib/symbol';

type ShortVolume = { date: string; shortVolume: number; shortExemptVolume: number; totalVolume: number; shortVolumePercent: number };

export default function QuoteWidget({ widget }: { widget: WidgetInstance }) {
  const symbol = useWidgetSymbol(widget);
  const metal = isMetalSymbol(symbol);
  const { data, error } = useQuery({
    queryKey: ["quote", symbol],
    queryFn: async () => (await apiGet<Quote[]>(`/api/quotes?symbols=${encodeURIComponent(symbol)}`))[0],
    refetchInterval: 5_000,
  });
  // FINRA's Reg SHO file only updates once a day (next-morning), so no point polling it fast.
  const { data: shortVol, error: shortError } = useQuery({
    queryKey: ["short-volume", symbol],
    queryFn: () => apiGet<ShortVolume | null>(`/api/short-volume/${encodeURIComponent(symbol)}`),
    staleTime: 3_600_000,
    enabled: !metal,
  });

  if (error) return <div className="p-2 down">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-2 dim">Loading {symbol}…</div>;

  const rows: Array<[string, string, string?]> = [
    ["Open", fmtPrice(data.open)],
    ["High", fmtPrice(data.high)],
    ["Low", fmtPrice(data.low)],
    ["Prev Close", fmtPrice(data.previousClose)],
    ["Bid", fmtPrice(data.bid)],
    ["Ask", fmtPrice(data.ask)],
    [data.volumeType === 'tick' ? "Tick volume" : data.volumeType === 'contracts' ? "Volume (contracts)" : "Volume", fmtBig(data.volume)],
    ["Avg Vol 3M", fmtBig(data.avgVolume)],
    ...(shortVol ? ([["Short Vol %", fmt(shortVol.shortVolumePercent, 1) + "%"]] as Array<[string, string]>) : []),
    ["Mkt Cap", fmtBig(data.marketCap)],
    ["P/E (ttm)", fmt(data.pe)],
    ["EPS (ttm)", fmt(data.eps)],
    ["Div Yield", data.dividendYield !== null ? fmt(data.dividendYield * 100) + "%" : "—"],
    ["52W High", fmt(data.week52High)],
    ["52W Low", fmt(data.week52Low)],
    ["Beta", fmt(data.beta)],
    ["Shares Out", fmtBig(data.sharesOutstanding)],
  ];

  return (
    <div className="p-2">
      <div className="flex items-baseline gap-3 mb-1">
        <Flash value={data.price} className="text-xl font-bold">{fmtPrice(data.price)}</Flash>
        <Flash value={data.changePercent} className={`${pctClass(data.changePercent)} text-sm`}>
          {data.change !== null && data.change >= 0 ? "+" : ""}
          {fmtPrice(data.change)} ({fmt(data.changePercent)}%)
        </Flash>
        <span className="dim text-[10px] ml-auto">
          {data.exchange ?? ""} · {data.currency ?? ""} · {data.source}
        </span>
      </div>
      <div className="dim text-[11px] mb-2 truncate">{data.name}</div>
      {data.instrumentNote && <div className="dim text-[11px] mb-2">{data.instrumentNote} · {quoteDelay(data)} · price time {data.time ? new Date(data.time * 1000).toLocaleString() : 'unavailable'}</div>}
      {!data.instrumentNote && data.source === 'nasdaq' && <div className="dim text-[11px] mb-2">{data.marketState ?? 'Session unavailable'} · price time {data.time ? new Date(data.time * 1000).toLocaleString() : 'unavailable'}</div>}
      {shortError&&!metal&&<div role="alert" className="dim">Short-volume statistics unavailable: {(shortError as Error).message}</div>}
      <div className="grid grid-cols-2 gap-x-4">
        {rows.filter(([label]) => !metal || ['Open','High','Low','Prev Close','Bid','Ask','Tick volume','Volume (contracts)','Volume','52W High','52W Low'].includes(label)).map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-[#161616] py-0.5">
            <span className="dim">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
