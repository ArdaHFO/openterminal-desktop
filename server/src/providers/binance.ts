import { instruments } from '../catalog.js';
import type { CryptoRow } from "./coingecko.js";
import type { Quote, Candle } from "./yahoo.js";
import { rangeStart } from '../ranges.js';

const cryptoInstruments=instruments.filter(r=>r.kind==='crypto');
const NAMES:Record<string,string>=Object.fromEntries(cryptoInstruments.map(r=>[r.feed,r.name]));
export const CRYPTO_SYMBOLS = new Set(cryptoInstruments.map(r=>r.symbol));

/** Fallback crypto board built from Binance public 24hr tickers (no key required). */
export async function markets(): Promise<CryptoRow[]> {
  const symbols = Object.keys(NAMES);
  const url =
    "https://api.binance.com/api/v3/ticker/24hr?symbols=" + encodeURIComponent(JSON.stringify(symbols));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows: any[] = await res.json();
  return rows
    .map((r) => ({
      id: r.symbol,
      symbol: r.symbol.replace("USDT", ""),
      name: NAMES[r.symbol] ?? r.symbol,
      price: +r.lastPrice,
      changePercent24h: +r.priceChangePercent,
      marketCap: null,
      volume24h: +r.quoteVolume,
      rank: null,
      sparkline: [],
    }))
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
}

export async function orderBook(symbol: string, limit = 20): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
  const pair = encodeURIComponent(symbol.toUpperCase() + "USDT");
  const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=${pair}&limit=${limit}`);
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const d = await res.json();
  return { bids: d.bids ?? [], asks: d.asks ?? [] };
}

/** Single-symbol quote so crypto tickers can flow through the same /api/quotes path as stocks. */
export async function quote(symbol: string): Promise<Quote & {instrumentNote:string;delayStatus:'unknown'}> {
  const pair = symbol.toUpperCase() + "USDT";
  const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(pair)}`);
  if (!res.ok) throw new Error(`binance ticker ${res.status}`);
  const d = await res.json();
  return {
    symbol: symbol.toUpperCase(),
    name: NAMES[pair] ?? symbol.toUpperCase(),
    price: +d.lastPrice,
    change: +d.priceChange,
    changePercent: +d.priceChangePercent,
    open: +d.openPrice,
    high: +d.highPrice,
    low: +d.lowPrice,
    previousClose: +d.prevClosePrice,
    bid: +d.bidPrice || null,
    ask: +d.askPrice || null,
    volume: +d.volume,
    avgVolume: null,
    marketCap: null,
    pe: null,
    eps: null,
    dividendYield: null,
    week52High: null,
    week52Low: null,
    beta: null,
    sharesOutstanding: null,
    currency: "USDT",
    exchange: "Binance",
    marketState: "Open",
    time: typeof d.closeTime === 'number' && Number.isFinite(d.closeTime) ? Math.floor(d.closeTime / 1000) : null,
    source: "binance",
    instrumentNote: `Binance ${symbol.toUpperCase()}/USDT; change and range are rolling 24h`,
    delayStatus: 'unknown',
  };
}

const RANGE_TO_KLINE: Record<string, { interval: string; limit: number }> = {
  "1D": { interval: "5m", limit: 288 },
  "5D": { interval: "15m", limit: 480 },
  "1M": { interval: "1h", limit: 720 },
  "6M": { interval: "6h", limit: 732 },
  YTD: { interval: "1d", limit: 366 },
  "1Y": { interval: "1d", limit: 366 },
  "5Y": { interval: "1w", limit: 260 },
  MAX: { interval: "1M", limit: 200 },
};

export async function history(symbol: string, rangeKey: string): Promise<Candle[]> {
  const { interval, limit } = RANGE_TO_KLINE[rangeKey] ?? RANGE_TO_KLINE["6M"];
  const pair = symbol.toUpperCase() + "USDT";
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`binance klines ${res.status}`);
  const rows: any[] = await res.json();
  const candles = rows.map((r) => ({
    time: Math.round(r[0] / 1000),
    open: +r[1],
    high: +r[2],
    low: +r[3],
    close: +r[4],
    volume: +r[5],
    dataSource: `Binance (${symbol.toUpperCase()}/USDT)`, timeframe: interval === '1M' ? '1mo' : interval, delayStatus:'unknown', sessionLabel:'24-hour market',
  }));
  return rangeKey === 'YTD' ? candles.filter(c => c.time >= rangeStart('YTD').getTime() / 1000) : candles;
}
