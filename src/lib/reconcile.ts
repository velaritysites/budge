/**
 * Bookkeeping reconciliation — compares statement transactions against the
 * expenses the user has logged in Budge for the same month.
 */
import type { Txn } from "./statement-parse";
import { monthlyEquivalent, type Expense } from "./finance";
import { normalizeCategory } from "./categories";

export type MatchedPair = {
  key: string;
  txn: Txn;
  expense: Expense;
  /** difference between statement amount and the logged monthly amount */
  delta: number;
};

export type Reconciliation = {
  matched: MatchedPair[];
  /** in the statement, not logged in Budge */
  unmatchedStatement: { key: string; txn: Txn; total: number; count: number }[];
  /** logged in Budge, nothing like it in the statement */
  unmatchedLogged: { key: string; expense: Expense; monthly: number }[];
};

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

const STOP = new Set([
  "the", "and", "for", "pmt", "payment", "purchase", "card", "debit", "order", "pos", "eft",
  "ref", "fee", "monthly", "sub", "zar", "int", "acc",
]);

/** 0..1 similarity between a statement description and an expense name. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  let hits = 0;
  for (const t of tb) {
    if (ta.some((x) => x === t || x.startsWith(t) || t.startsWith(x))) hits++;
  }
  return hits / tb.length;
}

export function reconcile(txns: Txn[], expenses: Expense[]): Reconciliation {
  const spend = txns.filter((t) => t.type === "expense");

  // Group statement rows by merchant-ish key so recurring debits collapse.
  const groups = new Map<string, { txn: Txn; total: number; count: number }>();
  for (const t of spend) {
    const key = tokens(t.description).slice(0, 2).join(" ") || t.description.toLowerCase();
    const g = groups.get(key);
    if (g) {
      g.total += t.amount;
      g.count += 1;
    } else {
      groups.set(key, { txn: t, total: t.amount, count: 1 });
    }
  }

  const matched: MatchedPair[] = [];
  const usedExpense = new Set<string>();
  const usedGroup = new Set<string>();

  for (const [key, g] of groups) {
    let best: { expense: Expense; score: number } | null = null;
    for (const e of expenses) {
      if (usedExpense.has(e.id)) continue;
      const nameScore = similarity(g.txn.description, e.name);
      const monthly = monthlyEquivalent(e);
      const amountClose = monthly > 0 && Math.abs(g.total - monthly) / monthly < 0.15 ? 0.35 : 0;
      const catMatch = normalizeCategory(g.txn.category) === normalizeCategory(e.category) ? 0.15 : 0;
      const score = nameScore * 0.6 + amountClose + catMatch;
      if (score >= 0.55 && (!best || score > best.score)) best = { expense: e, score };
    }
    if (best) {
      usedExpense.add(best.expense.id);
      usedGroup.add(key);
      matched.push({
        key,
        txn: g.txn,
        expense: best.expense,
        delta: g.total - monthlyEquivalent(best.expense),
      });
    }
  }

  const unmatchedStatement = [...groups.entries()]
    .filter(([key]) => !usedGroup.has(key))
    .map(([key, g]) => ({ key, txn: g.txn, total: g.total, count: g.count }))
    .sort((a, b) => b.total - a.total);

  const unmatchedLogged = expenses
    .filter((e) => !usedExpense.has(e.id) && monthlyEquivalent(e) > 0)
    .map((e) => ({ key: e.id, expense: e, monthly: monthlyEquivalent(e) }))
    .sort((a, b) => b.monthly - a.monthly);

  return { matched, unmatchedStatement, unmatchedLogged };
}
