import { canonicalSymbol } from './catalog.js';
export type LedgerTrade = { symbol: string; side: string; quantity: number; price: number };
export function calculatePositions(txs: LedgerTrade[]) {
  const positions = new Map<string, { quantity: number; avgCost: number; realizedPnl: number }>();
  for (const entry of txs) {
    const tx={...entry,symbol:canonicalSymbol(entry.symbol)};
    if(!['BUY','SELL'].includes(tx.side)||!Number.isFinite(tx.quantity)||tx.quantity<=0||!Number.isFinite(tx.price)||tx.price<0)throw new Error('Invalid ledger trade');
    const p = positions.get(tx.symbol) ?? { quantity: 0, avgCost: 0, realizedPnl: 0 };
    if (tx.side === 'BUY') {
      const total = p.avgCost * p.quantity + tx.price * tx.quantity;
      p.quantity += tx.quantity;
      p.avgCost = total / p.quantity;
    } else {
      if (tx.quantity > p.quantity + 1e-9) throw new Error(`Insufficient holdings for ${tx.symbol}`);
      const sold = Math.min(tx.quantity, p.quantity);
      p.realizedPnl += (tx.price - p.avgCost) * sold;
      p.quantity = Math.max(0, p.quantity - sold);
      if (p.quantity < 1e-9) { p.quantity = 0; p.avgCost = 0; }
    }
    positions.set(tx.symbol, p);
  }
  return [...positions].filter(([,p]) => p.quantity > 0 || p.realizedPnl !== 0).map(([symbol,p]) => ({symbol,...p}));
}
