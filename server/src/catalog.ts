import { readFileSync } from 'node:fs';

export type Instrument = {
  symbol:string; name:string; kind:string; exchange:string; currency:string|null; unit:string;
  aliases:string[]; feed:string; sessionStart?:number; volumeType?:'tick'|'contracts';
  capabilities:Record<'history'|'quote'|'options'|'earnings'|'insider'|'vwap',boolean>;
};
export const instruments: Instrument[] = JSON.parse(readFileSync(new URL('../../catalog/instruments.json', import.meta.url),'utf8'));
export function instrumentFor(raw:string): Instrument|undefined {
  const key=raw.trim().toUpperCase();
  return instruments.find(r=>r.symbol===key || r.aliases.includes(key));
}
export const canonicalSymbol=(raw:string)=>instrumentFor(raw)?.symbol ?? raw.trim().toUpperCase();
