import rows from '../../catalog/instruments.json';

export type Instrument = typeof rows[number];
export const instruments = rows;
export function instrumentFor(raw: string): Instrument | undefined {
  const key = raw.trim().toUpperCase();
  return rows.find(r => r.symbol === key || (r.aliases as string[]).includes(key));
}
export function canonicalSymbol(raw: string): string {
  return instrumentFor(raw)?.symbol ?? raw.trim().toUpperCase();
}
