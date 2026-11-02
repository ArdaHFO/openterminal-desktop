import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import type { Candle } from './yahoo.js';
import { search } from './tradingview.js';
import { metalInstrument, metalVwapMetadata } from './metalSymbols.js';
import { rangeStart } from '../ranges.js';
export { metalInstrument } from './metalSymbols.js';

type SearchRow = { symbol: string; exchange: string; type: string };
export type SourcedCandle = Candle & { dataSource: string; timeframe: '5m' | '15m' | '1h' | '4h' | '6h' | '1d' | '1w' | '1mo'; delayStatus: 'unknown'; instrumentNote?: string; volumeType?: 'tick' | 'contracts'; sessionLabel?: string; vwapUnavailable?: boolean; vwapSessionStart?:number; volumeUnavailable?: boolean };
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX']);
const maxFrame = 2 * 1024 * 1024;

/** Refuse an ambiguous listing instead of quietly selecting the wrong security. */
export function resolveUsTicker(symbol: string, rows: SearchRow[]): string {
  const matches = [...new Set(rows.filter(r => r.symbol.toUpperCase() === symbol.toUpperCase() && US_EXCHANGES.has(r.exchange.toUpperCase()) && ['stock', 'fund', 'dr'].includes(r.type)).map(r => r.exchange.toUpperCase() + ':' + r.symbol.toUpperCase()))];
  if (matches.length !== 1) throw new Error('No unambiguous supported US listing for 5D');
  return matches[0];
}

/** TradingView frames can be concatenated or split across WebSocket messages. */
export function parseFrames(buffer: Buffer): { messages: string[]; rest: Buffer } {
  let offset = 0; const messages: string[] = [];
  while (offset < buffer.length) {
    const prefix = buffer.subarray(offset).toString('utf8', 0, Math.min(32, buffer.length - offset));
    const match = /^~m~(\d+)~m~/.exec(prefix);
    if (!match) {
      if (prefix.length < 32 && /^(?:~|~m|~m~\d*(?:~|~m)?)$/.test(prefix)) break;
      throw new Error('Invalid market-data frame');
    }
    const size = Number(match[1]);
    if (!Number.isSafeInteger(size) || size > maxFrame) throw new Error('Oversized market-data frame');
    const start = offset + Buffer.byteLength(match[0]);
    const end = start + size;
    if (end > buffer.length) break;
    messages.push(buffer.subarray(start, end).toString('utf8')); offset = end;
  }
  return { messages, rest: buffer.subarray(offset) };
}

export function validateBars(rows: unknown[][], volumeUnavailable = false, retainMissingVolume = false): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const row of rows) {
    if (row.length < 5 || row.slice(0, 5).some(v => typeof v !== 'number' || !Number.isFinite(v))) continue;
    const [time, open, high, low, close] = row as number[];
    const rawVolume = row[5];
    const validVolume=typeof rawVolume==='number'&&Number.isFinite(rawVolume)&&rawVolume>=0;
    if (!volumeUnavailable && !validVolume && !retainMissingVolume) continue;
    const volume = volumeUnavailable || !validVolume ? null : rawVolume as number;
    if (!Number.isSafeInteger(time) || time <= 0 || open <= 0 || low <= 0 || close <= 0 || high < Math.max(open, close, low) || low > Math.min(open, close)) continue;
    byTime.set(time, { time, open, high, low, close, volume });
  }
  return [...byTime.values()].sort((a,b) => a.time - b.time);
}

function selectSessions(bars: Candle[], count: number, sessionStart?: number): Candle[] {
  const fmt = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const hour = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'});
  const day = (c: Candle) => {
    const date = new Date(c.time * 1000);
    const key = fmt.format(date);
    if (sessionStart === undefined || Number(hour.format(date)) < sessionStart) return key;
    const next = new Date(`${key}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  };
  const dates = [...new Set(bars.map(day))].sort().slice(-count);
  return bars.filter(c => dates.includes(day(c)));
}
export const selectFiveSessions = (bars: Candle[], sessionStart?: number) => selectSessions(bars, 5, sessionStart);
export const selectLastSession = (bars: Candle[], sessionStart?: number) => selectSessions(bars, 1, sessionStart);

export function selectSixMonths(bars: Candle[], now = new Date()): Candle[] {
  const from = rangeStart('6M', now);
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) / 1000;
  return bars.filter(c => c.time >= start && c.time <= now.getTime() / 1000);
}

export type HistoryRange = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';
export function selectRange(bars: Candle[], range: HistoryRange, now = new Date(), sessionStart?: number): Candle[] {
  if (range === '1D') return selectLastSession(bars, sessionStart);
  if (range === '5D') return selectFiveSessions(bars, sessionStart);
  if (range === 'MAX') return bars;
  const from = rangeStart(range, now);
  const start = range === '1M' ? from.getTime() / 1000 : Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) / 1000;
  return bars.filter(c => c.time >= start && c.time <= now.getTime() / 1000);
}

/** Anonymous regular-session bars, not a paid TradingView entitlement. */
export async function tradingViewHistory(symbol: string, range: HistoryRange, requestedInterval?: '15m' | '1h' | '4h', context?:{warmup:number;resolution:SourcedCandle['timeframe']}): Promise<SourcedCandle[]> {
  const metal = metalInstrument(symbol);
  const index = symbol === '^VIX' || symbol === 'VIX';
  const ticker = index ? 'CBOE:VIX' : metal?.ticker ?? resolveUsTicker(symbol, await search(symbol));
  const session = 'cs_' + randomBytes(6).toString('hex');
  const endpoint = 'wss://data.tradingview.com/socket.io/websocket?from=chart%2F&type=chart';
  const sendFrame = (s: string) => `~m~${Buffer.byteLength(s)}~m~${s}`;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint, { origin: 'https://www.tradingview.com', handshakeTimeout: 10_000, maxPayload: maxFrame });
    let buffer = Buffer.alloc(0); let finished = false; let resolved = false; let source = ''; const rows: unknown[][] = [];
    const timer = setTimeout(() => finish(new Error(`${range} source timed out`)), 15_000);
    function finish(error?: Error, bars?: SourcedCandle[]) {
      if (finished) return; finished = true; clearTimeout(timer); socket.close();
      if (error) reject(error); else resolve(bars!);
    }
    const send = (method: string, params: unknown[]) => socket.send(sendFrame(JSON.stringify({m:method,p:params})));
    socket.on('open', () => {
      send('set_auth_token', ['unauthorized_user_token']);
      send('chart_create_session', [session, '']);
      send('resolve_symbol', [session, 'sym_1', '=' + JSON.stringify({symbol:ticker,...(metal || index ? {} : {adjustment:'splits'}),session:'regular'})]);
      const config: Record<HistoryRange, {interval:string; count:number}> = {
        '1D':{interval:'5',count:metal || index ? 400 : 160}, '5D':{interval:'15',count:metal ? 650 : index ? 350 : 180},
        '1M':{interval:'60',count:850}, '6M':{interval:'1D',count:220}, YTD:{interval:'1D',count:400},
        '1Y':{interval:'1D',count:400}, '5Y':{interval:'1W',count:300}, MAX:{interval:'1M',count:1000},
      };
      const intraday=requestedInterval ? {interval:({'15m':'15','1h':'60','4h':'240'} as const)[requestedInterval],count:requestedInterval==='15m'?3200:requestedInterval==='1h'?850:240} : null;
      const resolution=context?({'5m':'5','15m':'15','1h':'60','4h':'240','6h':'360','1d':'1D','1w':'1W','1mo':'1M'} as const)[context.resolution]:intraday?.interval??config[range].interval;
      const baseCount=context?.resolution==='1d'&&range==='5Y'?2000:context?.resolution==='1d'&&range==='MAX'?5000:intraday?.count??config[range].count;
      send('create_series', [session, 's1', 's1', 'sym_1', resolution, Math.min(5000,baseCount+(context?.warmup??0)), '']);
    });
    socket.on('message', data => {
      try {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        buffer = Buffer.concat([buffer, bytes]);
        if (buffer.length > maxFrame) throw new Error('Oversized market-data response');
        const parsed = parseFrames(buffer); buffer = Buffer.from(parsed.rest);
        for (const text of parsed.messages) {
          if (/^~h~\d+$/.test(text)) { socket.send(sendFrame(text)); continue; }
          let message: {m?: string; p?: unknown[]}; try { message = JSON.parse(text); } catch { continue; }
          const p = message.p ?? [];
          if (message.m === 'symbol_resolved' && p[0] === session) {
            const meta = p[2] as {pro_name?: string; exchange?: string; source2?: {name?: string}} | undefined;
            if (meta?.pro_name !== ticker) throw new Error(`${range} source returned a different listing`);
            resolved = true; source = (meta.source2?.name ?? meta.exchange ?? 'TradingView').slice(0,80);
          }
          if ((message.m === 'timescale_update' || message.m === 'du') && p[0] === session && p[1] && typeof p[1] === 'object') {
            for (const block of Object.values(p[1] as Record<string, {s?: Array<{v?: unknown[]}>}>)) for (const point of block?.s ?? []) if (Array.isArray(point.v)) rows.push(point.v);
          }
          if (['symbol_error','series_error','critical_error','protocol_error'].includes(message.m ?? '')) throw new Error(`${range} source rejected the symbol or request`);
          if (message.m === 'series_completed' && p[0] === session) {
            const valid = validateBars(rows, index, true);
            const selected = selectRange(valid, range, new Date(), metal?.sessionStart);
            const first=selected[0]?.time??Infinity;
            const bars=context?[...valid.filter(c=>c.time<first).slice(-context.warmup),...selected]:selected;
            if (!resolved || !bars.length) throw new Error(`${range} source returned no verified bars`);
            const timeframe: Record<HistoryRange,SourcedCandle['timeframe']> = {'1D':'5m','5D':'15m','1M':'1h','6M':'1d',YTD:'1d','1Y':'1d','5Y':'1w',MAX:'1mo'};
            finish(undefined, bars.map(bar => ({...bar,dataSource:`TradingView / ${source}${metal || index ? ` (${ticker})` : ''}`,timeframe:context?.resolution??requestedInterval??timeframe[range],delayStatus:'unknown',...(metal ? {instrumentNote:metal.note,...metalVwapMetadata(metal),sessionLabel:'overnight session'} : {}),...(index ? {instrumentNote:'VIX index; volume unavailable',volumeUnavailable:true,vwapUnavailable:true} : {})})));
          }
        }
      } catch (error) { finish(error instanceof Error ? error : new Error('Invalid 5D data')); }
    });
    socket.on('error', () => finish(new Error(`${range} source connection failed`)));
    socket.on('close', () => { if (!finished) finish(new Error(`${range} source closed before completing`)); });
  });
}

export const fiveDayHistory = (symbol: string) => tradingViewHistory(symbol, '5D');
export const sixMonthHistory = (symbol: string) => tradingViewHistory(symbol, '6M');
