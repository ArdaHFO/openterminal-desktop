import { instruments, canonicalSymbol } from '../catalog.js';
type MetalInstrument = { ticker: string; name: string; type: 'commodity' | 'futures'; sessionStart: number; volumeType: 'tick' | 'contracts'; note: string };

const metals: Record<string, MetalInstrument> = Object.fromEntries(instruments.filter(r=>['spot','futures'].includes(r.kind)).map(r=>[r.symbol, {ticker:r.feed,name:r.name,type:r.kind==='spot'?'commodity' as const:'futures' as const,sessionStart:r.sessionStart!,volumeType:r.volumeType!,note:r.kind==='spot'?'OANDA spot CFD; tick volume':'COMEX continuous front-month proxy; rollover may differ from Yahoo'}]));
export const METAL_ALIASES: Record<string,string> = Object.fromEntries(instruments.filter(r=>['spot','futures'].includes(r.kind)).flatMap(r=>r.aliases.map(alias=>[alias,r.symbol])));
export const normalizeMetalSymbol = canonicalSymbol;

export function metalNewsQuery(symbol: string): string | undefined {
  const queries: Record<string,string> = {XAUUSD:'gold price', XAGUSD:'silver price', 'GC=F':'gold futures COMEX', 'SI=F':'silver futures COMEX'};
  return queries[normalizeMetalSymbol(symbol)];
}

export function searchMetals(query: string) {
  const key = normalizeMetalSymbol(query);
  const symbols = Object.hasOwn(metals, key) ? [key]
    : ['GOLD', 'ALTIN'].includes(key) ? ['XAUUSD', 'GC=F']
    : ['SILVER', 'GÜMÜŞ', 'GUMUS'].includes(key) ? ['XAGUSD', 'SI=F']
    : ['METAL', 'METALS', 'METALLER'].includes(key) ? Object.keys(metals) : [];
  return symbols.map(symbol => ({ symbol, name: metals[symbol].name, exchange: metals[symbol].ticker.split(':')[0], type: metals[symbol].type }));
}

export function metalInstrument(symbol: string): MetalInstrument | undefined {
  const key = normalizeMetalSymbol(symbol);
  return Object.hasOwn(metals, key) ? metals[key] : undefined;
}

/** Price and weights must come from the same feed. Spot counts remain explicitly tick based. */
export function metalVwapMetadata(metal:MetalInstrument){
  return {volumeType:metal.volumeType,vwapSessionStart:metal.sessionStart,vwapUnavailable:false};
}
