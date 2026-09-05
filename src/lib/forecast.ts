import { normalizeCategory, type ExpenseCategory } from "./categories";

export type ForecastSnap = {
  month: string;
  net_income: number;
  total_expenses: number;
  expenses_by_category: Record<string, number>;
};

export type ForecastFlag = {
  key: ExpenseCategory;
  current: number;
  expectedSoFar: number;
  average: number;
  pctAbove: number;
};

export type Forecast = {
  monthsUsed: number;
  confidence: "low" | "medium" | "high";
  projectedIncome: number;
  projectedSpend: number;
  projectedDisposable: number;
  byCategory: { key: ExpenseCategory; amount: number }[];
  flags: ForecastFlag[];
};

/** Fraction of the current month that has already elapsed (0.03 – 1). */
export function monthProgress(now = new Date()): number {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.min(1, Math.max(1 / days, now.getDate() / days));
}

function averages(history: ForecastSnap[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const s of history) {
    for (const [k, v] of Object.entries(s.expenses_by_category ?? {})) {
      const key = normalizeCategory(k);
      sums[key] = (sums[key] ?? 0) + Number(v || 0);
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sums)) out[k] = v / history.length;
  return out;
}

/**
 * Project the end-of-month position from up to 3 months of stored snapshots,
 * blended with anything already spent this month.
 * Returns null when there isn't enough history to forecast responsibly.
 */
export function buildForecast(
  history: ForecastSnap[],
  opts: {
    liveIncome?: number;
    /** Month-to-date spending per category, e.g. from a statement analysis. */
    monthToDate?: Record<string, number>;
    progress?: number;
  } = {},
): Forecast | null {
  const months = history.slice(0, 3);
  if (months.length < 2) return null;

  const progress = opts.progress ?? monthProgress();
  const avg = averages(months);
  const mtd: Record<string, number> = {};
  for (const [k, v] of Object.entries(opts.monthToDate ?? {})) {
    const key = normalizeCategory(k);
    mtd[key] = (mtd[key] ?? 0) + Number(v || 0);
  }

  const keys = new Set([...Object.keys(avg), ...Object.keys(mtd)]);
  const byCategory: { key: ExpenseCategory; amount: number }[] = [];
  const flags: ForecastFlag[] = [];

  for (const k of keys) {
    const average = avg[k] ?? 0;
    const spent = mtd[k] ?? 0;
    const paced = progress > 0 ? spent / progress : 0;
    const amount = Math.max(average, paced);
    if (amount <= 0) continue;
    byCategory.push({ key: k as ExpenseCategory, amount });

    const expectedSoFar = average * progress;
    if (spent > 0 && expectedSoFar > 0) {
      const pctAbove = (spent / expectedSoFar - 1) * 100;
      if (pctAbove >= 15) flags.push({ key: k as ExpenseCategory, current: spent, expectedSoFar, average, pctAbove });
    }
  }

  byCategory.sort((a, b) => b.amount - a.amount);
  flags.sort((a, b) => b.pctAbove - a.pctAbove);

  const avgIncome = months.reduce((s, m) => s + Number(m.net_income || 0), 0) / months.length;
  const projectedIncome = opts.liveIncome && opts.liveIncome > 0 ? opts.liveIncome : avgIncome;
  const projectedSpend = byCategory.reduce((s, c) => s + c.amount, 0);

  return {
    monthsUsed: months.length,
    confidence: months.length >= 3 ? "high" : "medium",
    projectedIncome,
    projectedSpend,
    projectedDisposable: projectedIncome - projectedSpend,
    byCategory,
    flags,
  };
}
