import type { Quote, Candle } from "./yahoo.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" };

// Polite concurrency limiter — Nasdaq's public API has no documented limit,
// but we stay gentle to avoid tripping bot-detection under bursty load.
const MAX_CONCURRENT = 6;
let active = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}
function release(): void {
  active--;
  waiters.shift()?.();
}

async function nfetch(url: string): Promise<any> {
  await acquire();
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`nasdaq ${res.status} for ${url}`);
    const json = await res.json();
    if (!json?.data) throw new Error(`nasdaq: no data in response for ${url}`);
    return json.data;
  } finally {
    release();
  }
}

const money = (s: unknown): number | null => {
  if (typeof s !== "string") return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return isFinite(n) ? n : null;
};

export function nasdaqQuoteTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(?:Closed at )?([A-Za-z]{3} \d{1,2}, \d{4} \d{1,2}:\d{2}(?::\d{2})? [AP]M) ET$/.exec(value);
  if (!match) return null;
  const wall = Date.parse(`${match[1]} UTC`);
  return Number.isFinite(wall) ? Math.round(nasdaqWallTimeToUtc(wall) / 1000) : null;
}

// Nasdaq's quote/chart endpoints require the correct assetclass and return no
// data for the wrong one (e.g. an ETF queried as "stocks"). Rather than guess,
// we ask Nasdaq's symbol lookup, which reports the real asset type.
const KNOWN_ETFS = new Set([
  "SPY", "DIA", "QQQ", "GLD", "USO", "UUP", "IWM", "VTI", "TLT",
  // EU macro widget index proxies (see routes/market.ts EU_INDEX_PROXIES)
  "FEZ", "IEUR", "EWG", "EWU", "EWQ", "EWI",
]);

// Asset class is effectively static per symbol, so resolutions are memoized for
// the process lifetime to avoid a lookup on every quote/history request.
const assetClassCache = new Map<string, "stocks" | "etf">();

async function resolveAssetClass(symbol: string): Promise<"stocks" | "etf"> {
  const sym = symbol.toUpperCase();
  const cached = assetClassCache.get(sym);
  if (cached) return cached;
  try {
    const rows: any[] = await nfetch(
      `https://api.nasdaq.com/api/autocomplete/slookup/10?search=${encodeURIComponent(symbol)}&limit=10`
    );
    const match = rows.find((r) => String(r.symbol).toUpperCase() === sym);
    if (match) {
      const assetclass = String(match.asset).toUpperCase() === "ETF" ? "etf" : "stocks";
      assetClassCache.set(sym, assetclass);
      return assetclass;
    }
  } catch {
    // Lookup unavailable — fall through to the static hint below.
  }
  return KNOWN_ETFS.has(sym) ? "etf" : "stocks";
}

export async function quote(symbol: string): Promise<Quote> {
  const assetclass = await resolveAssetClass(symbol);
  const [info, summary] = await Promise.all([
    nfetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetclass}`),
    nfetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/summary?assetclass=${assetclass}`).catch(() => null),
  ]);

  const price = money(info.primaryData?.lastSalePrice);
  const prevClose = money(info.primaryData?.previousClose) ?? money(summary?.summaryData?.PreviousClose?.value);
  const change = money(info.primaryData?.netChange);
  const pctChange = typeof info.primaryData?.percentageChange === "string"
    ? Number(info.primaryData.percentageChange.replace(/[%+]/g, ""))
    : null;

  const [dayLow, dayHigh] = (info.keyStats?.dayrange?.value ?? "").split(" - ").map((s: string) => money(s));
  const [wLow, wHigh] = (info.keyStats?.fiftyTwoWeekHighLow?.value ?? "").split(" - ").map((s: string) => money(s));

  const marketCap = money(summary?.summaryData?.MarketCap?.value?.replace(/,/g, ""));
  const avgVolume = money(summary?.summaryData?.AverageVolume?.value?.replace(/,/g, ""));
  const yieldPct = summary?.summaryData?.Yield?.value ? Number(String(summary.summaryData.Yield.value).replace("%", "")) : null;

  return {
    symbol,
    name: info.companyName ?? null,
    price,
    change,
    changePercent: isFinite(pctChange as number) ? pctChange : null,
    open: null,
    high: dayHigh ?? null,
    low: dayLow ?? null,
    previousClose: prevClose,
    bid: money(info.primaryData?.bidPrice),
    ask: money(info.primaryData?.askPrice),
    volume: money(String(info.primaryData?.volume ?? "").split(".")[0]),
    avgVolume,
    marketCap,
    pe: null,
    eps: null,
    dividendYield: yieldPct !== null ? yieldPct / 100 : null,
    week52High: wHigh ?? null,
    week52Low: wLow ?? null,
    beta: null,
    sharesOutstanding: null,
    currency: "USD",
    exchange: info.exchange ?? null,
    marketState: info.marketStatus ?? null,
    time: nasdaqQuoteTime(info.primaryData?.lastTradeTimestamp),
    source: "nasdaq",
  };
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

import { rangeStart } from '../ranges.js';

/** Nasdaq provides sampled prices here, not OHLC bars or per-point volume. */
export type PriceSample = { time: number; close: number; priceOnly: true };
export function nasdaqWallTimeToUtc(milliseconds: number): number {
  // Nasdaq's chart x encodes the displayed Eastern wall clock as if it were UTC.
  const offsetAt = (t: number) => {
    const name = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', timeZoneName: 'shortOffset'}).formatToParts(new Date(t)).find(p => p.type === 'timeZoneName')?.value ?? '';
    const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name);
    if (!m) throw new Error('Unable to determine Nasdaq time zone offset');
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) * 60_000;
  };
  const first = milliseconds - offsetAt(milliseconds);
  return milliseconds - offsetAt(first);
}
export async function intradayPrices(symbol: string): Promise<PriceSample[]> {
  const assetclass = await resolveAssetClass(symbol);
  const data = await nfetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/chart?assetclass=${assetclass}`);
  const rows: PriceSample[] = [];
  for (const p of data.chart ?? []) {
    const rawTime = Number(p.x);
    const time = Number.isFinite(rawTime) ? nasdaqWallTimeToUtc(rawTime) / 1000 : NaN;
    const price = Number(p.y);
    if (Number.isFinite(time) && Number.isFinite(price) && time > 0 && price > 0) rows.push({time: Math.round(time), close:price, priceOnly:true});
  }
  if (!rows.length) throw new Error('nasdaq: no intraday prices');
  return rows.sort((a,b) => a.time-b.time);
}

export async function history(symbol: string, rangeKey: string): Promise<Candle[]> {
  const to = new Date();
  const from = rangeStart(rangeKey, to);
  const assetclass = await resolveAssetClass(symbol);
  const data = await nfetch(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/chart?assetclass=${assetclass}&fromdate=${fmtDate(from)}&todate=${fmtDate(to)}`
  );
  const points: any[] = data.chart ?? [];
  const candles: Candle[] = [];
  for (const p of points) {
    const z = p.z ?? {};
    const o = money(z.open);
    const h = money(z.high);
    const l = money(z.low);
    const c = money(z.close);
    if (o === null || h === null || l === null || c === null) continue;
    candles.push({ time: Math.round(p.x / 1000), open: o, high: h, low: l, close: c, volume: money(z.volume) });
  }
  const cutoff = Math.floor(from.getTime() / 1000);
  return candles.filter(c => c.time >= cutoff);
}

export type NasdaqOptionRow = {
  strike: number | null;
  lastPrice: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  openInterest: number | null;
  inTheMoney: boolean;
};

export type NasdaqChain = {
  symbol: string;
  underlyingPrice: number | null;
  expirationDates: string[];
  selectedDate: string | null;
  calls: NasdaqOptionRow[];
  puts: NasdaqOptionRow[];
};

const num = (s: unknown): number | null => {
  if (typeof s !== "string" || s === "--") return null;
  const n = Number(s.replace(/,/g, ""));
  return isFinite(n) ? n : null;
};

export async function optionChain(symbol: string, expiry?: string): Promise<NasdaqChain> {
  const to = new Date(Date.now() + 60 * 86_400_000);
  const data = await nfetch(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/option-chain?assetclass=stocks&limit=2000&fromdate=${fmtDate(new Date())}&todate=${fmtDate(to)}`
  );
  const rows: any[] = (data.table?.rows ?? []).filter((r: any) => r.strike);
  const dates = [...new Set<string>(rows.map((r) => r.expiryDate))];
  const selected = expiry && dates.includes(expiry) ? expiry : dates[0] ?? null;
  const selectedRows = rows.filter((r) => r.expiryDate === selected);

  const calls: NasdaqOptionRow[] = [];
  const puts: NasdaqOptionRow[] = [];
  for (const r of selectedRows) {
    const strike = num(r.strike);
    calls.push({
      strike, lastPrice: num(r.c_Last), bid: num(r.c_Bid), ask: num(r.c_Ask),
      volume: num(r.c_Volume), openInterest: num(r.c_Openinterest), inTheMoney: !!r.c_colour,
    });
    puts.push({
      strike, lastPrice: num(r.p_Last), bid: num(r.p_Bid), ask: num(r.p_Ask),
      volume: num(r.p_Volume), openInterest: num(r.p_Openinterest), inTheMoney: !!r.p_colour,
    });
  }

  const priceMatch = String(data.lastTrade ?? "").match(/\$([\d.,]+)/);
  return {
    symbol,
    underlyingPrice: priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null,
    expirationDates: dates,
    selectedDate: selected,
    calls,
    puts,
  };
}

export type EarningsSurpriseRow = {
  fiscalQtrEnd: string;
  dateReported: number; // unix seconds, UTC midnight
  eps: number | null;
  consensusForecast: number | null;
  surprisePercent: number | null;
};

/** Last several quarters of reported EPS vs consensus, newest first. */
export async function earningsSurprise(symbol: string): Promise<EarningsSurpriseRow[]> {
  const data = await nfetch(`https://api.nasdaq.com/api/company/${encodeURIComponent(symbol)}/earnings-surprise`);
  const rows: any[] = data.earningsSurpriseTable?.rows ?? [];
  return rows
    .map((r) => {
      const [m, d, y] = String(r.dateReported ?? "").split("/").map(Number);
      if (!m || !d || !y) return null;
      return {
        fiscalQtrEnd: r.fiscalQtrEnd ?? "",
        dateReported: Math.round(Date.UTC(y, m - 1, d) / 1000),
        eps: num(String(r.eps ?? "")),
        consensusForecast: num(r.consensusForecast),
        surprisePercent: num(r.percentageSurprise),
      };
    })
    .filter((r): r is EarningsSurpriseRow => r !== null);
}


