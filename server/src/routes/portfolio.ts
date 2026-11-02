import { canonicalSymbol } from '../catalog.js';
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { calculatePositions, type LedgerTrade } from '../ledger.js';

export const portfolioRouter = Router();

portfolioRouter.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM portfolios ORDER BY id").all());
});

portfolioRouter.post("/", (req, res) => {
  const parsed = z.object({ name: z.string().min(1).max(64) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const info = db.prepare("INSERT INTO portfolios (name) VALUES (?)").run(parsed.data.name);
    res.status(201).json({ id: info.lastInsertRowid, name: parsed.data.name });
  } catch {
    res.status(409).json({ error: "portfolio name already exists" });
  }
});

portfolioRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM transactions WHERE portfolio_id = ?").run(req.params.id);
  db.prepare("DELETE FROM portfolios WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

const txSchema = z.object({
  symbol: z.string().trim().min(1).max(40).transform(canonicalSymbol).refine(s=>/^(?=.*[A-Z0-9])[A-Z0-9.\-^=&]{1,20}$/.test(s),'Invalid ticker'),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  executed_at: z.string().datetime({offset:true}).transform(s=>new Date(s).toISOString()),
});

portfolioRouter.get("/:id/transactions", (req, res) => {
  res.json(
    db
      .prepare("SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY executed_at DESC, id DESC")
      .all(req.params.id)
  );
});

portfolioRouter.post("/:id/transactions", (req, res) => {
  const parsed = txSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const t = parsed.data;
  try {
    const insert = db.transaction(() => {
      const entries = db.prepare('SELECT id, symbol, side, quantity, price, executed_at FROM transactions WHERE portfolio_id = ? ORDER BY julianday(executed_at), id').all(req.params.id) as Array<LedgerTrade & {id:number; executed_at:string}>;
      const candidate = { ...t, id: Number.MAX_SAFE_INTEGER };
      const ordered = [...entries, candidate].sort((a,b) => Date.parse(a.executed_at)-Date.parse(b.executed_at) || a.id - b.id);
      calculatePositions(ordered);
      return db.prepare('INSERT INTO transactions (portfolio_id, symbol, side, quantity, price, executed_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.params.id, t.symbol, t.side, t.quantity, t.price, t.executed_at);
    });
    const info = insert();
    res.status(201).json({ id: info.lastInsertRowid, ...t });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Insufficient holdings')) return res.status(409).json({ error: err.message });
    res.status(404).json({ error: "portfolio not found" });
  }
});

portfolioRouter.delete("/:id/transactions/:txId", (req, res) => {
  try {
    const remove = db.transaction(() => {
      const remaining = db.prepare('SELECT symbol, side, quantity, price FROM transactions WHERE portfolio_id = ? AND id != ? ORDER BY julianday(executed_at), id').all(req.params.id, req.params.txId) as LedgerTrade[];
      calculatePositions(remaining);
      db.prepare('DELETE FROM transactions WHERE id = ? AND portfolio_id = ?').run(req.params.txId, req.params.id);
    });
    remove(); res.status(204).end();
  } catch (err) { res.status(409).json({error: err instanceof Error ? err.message : 'Cannot remove transaction'}); }
});

/** Aggregated positions with average cost and realized PnL (FIFO-free, average-cost method). */
portfolioRouter.get("/:id/positions", (req, res) => {
  const txs = db
    .prepare("SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY julianday(executed_at), id")
    .all(req.params.id) as Array<{ symbol: string; side: string; quantity: number; price: number }>;

  try { res.json(calculatePositions(txs)); }
  catch (err) { res.status(409).json({error: `Existing portfolio ledger is inconsistent: ${err instanceof Error ? err.message : 'unknown error'}`}); }
});
