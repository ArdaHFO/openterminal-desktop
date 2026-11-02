import type { Candle } from './providers/yahoo.js';

/** Close on/after the report date to the next available close, not an intraday event return. */
export function earningsMove(candles: Candle[], reportDate: number): number | null {
  const sorted = [...candles].sort((a,b) => a.time - b.time);
  const idx = sorted.findIndex(c => c.time >= reportDate);
  if (idx < 0 || idx + 1 >= sorted.length || sorted[idx].close <= 0) return null;
  return (sorted[idx + 1].close / sorted[idx].close - 1) * 100;
}
