import { canonicalSymbol, instrumentFor } from './instruments';
// Characters seen in Yahoo-style tickers: AAPL, BRK-B, ^GSPC, 0700.HK,
// EURUSD=X, GC=F, M&M.NS. Commas are excluded because the quote endpoints
// take comma-separated symbol lists, and at least one alphanumeric is required
// so dot-only values like ".." can't act as path segments.
const SYMBOL_RE = /^(?=.*[A-Z0-9])[A-Z0-9.\-^=&]{1,20}$/;

/** Uppercases and trims free-text ticker input; null when it isn't a plausible symbol. */
export function normalizeSymbol(raw: string): string | null {
  const s = canonicalSymbol(raw);
  return SYMBOL_RE.test(s) ? s : null;
}

export function isMetalSymbol(raw: string): boolean {
  return ['spot','futures'].includes(instrumentFor(raw)?.kind ?? '');
}

/** Upgrade saved aliases without resetting layouts, widget links or other preferences. */
export function normalizeWorkspaceSymbols(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {};
  const saved = state as Record<string, unknown>;
  return {
    ...saved,
    ...(typeof saved.activeSymbol === 'string' ? {activeSymbol: normalizeSymbol(saved.activeSymbol) ?? saved.activeSymbol} : {}),
    ...(Array.isArray(saved.watchlist) ? {watchlist: [...new Set(saved.watchlist.filter((s): s is string => typeof s === 'string').map(s => normalizeSymbol(s) ?? s))]} : {}),
    ...(Array.isArray(saved.widgets) ? {widgets: saved.widgets.map(w => w && typeof w === 'object' && typeof w.symbol === 'string' ? {...w, symbol: normalizeSymbol(w.symbol) ?? w.symbol} : w)} : {}),
  };
}

/** Encodes symbols for a `?symbols=` query, keeping the comma separator literal. */
export function symbolsParam(symbols: string[]): string {
  return [...new Set(symbols.map(s => normalizeSymbol(s) ?? s))].map(encodeURIComponent).join(",");
}
