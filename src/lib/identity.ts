/**
 * Financial identity — a data-driven characterisation of the user built from
 * the last 6 monthly snapshots. Not a personality test.
 */
import { stabilityQuality } from "./loot-score";

export type IdentitySnap = {
  month: string;
  net_income: number;
  total_expenses: number;
  disposable_income: number;
  savings_rate: number;
  expenses_by_category?: Record<string, number> | null;
};

export type Dimension = { label: string; value: string; tone: "good" | "ok" | "bad"; explain: string };

export type Identity = {
  months: number;
  dimensions: Dimension[];
  summary: string;
  strongest: string;
  weakest: string;
};

function trend(values: number[]): number {
  // simple slope of a least-squares fit, normalised by the mean
  if (values.length < 3) return 0;
  const n = values.length;
  const xs = values.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = values.reduce((s, v) => s + v, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1;
  const slope = num / den;
  return my !== 0 ? slope / Math.abs(my) : 0;
}

export function buildIdentity(snapsDesc: IdentitySnap[], dtiPct: number): Identity | null {
  const snaps = [...snapsDesc].slice(0, 6).reverse();
  if (snaps.length === 0) return null;

  const expenses = snaps.map((s) => s.total_expenses);
  const stability = stabilityQuality(expenses);
  const spending: Dimension =
    stability >= 0.75
      ? { label: "Spending pattern", value: "Consistent", tone: "good", explain: "Your monthly spending barely moves from month to month." }
      : stability >= 0.5
        ? { label: "Spending pattern", value: "Seasonal", tone: "ok", explain: "Your spending moves in waves — some months clearly heavier than others." }
        : { label: "Spending pattern", value: "Variable", tone: "bad", explain: "Your spending swings quite a lot month to month, which makes planning harder." };

  const avgSavings = snaps.reduce((s, x) => s + x.savings_rate, 0) / snaps.length;
  const savings: Dimension =
    avgSavings >= 20
      ? { label: "Savings behaviour", value: "Strong saver", tone: "good", explain: `You've averaged a ${avgSavings.toFixed(0)}% savings rate.` }
      : avgSavings >= 8
        ? { label: "Savings behaviour", value: "Building", tone: "ok", explain: `You've averaged a ${avgSavings.toFixed(0)}% savings rate — steady, with room to grow.` }
        : { label: "Savings behaviour", value: "Needs attention", tone: "bad", explain: `Your savings rate has averaged ${avgSavings.toFixed(0)}%.` };

  const debt: Dimension =
    dtiPct <= 0.5
      ? { label: "Debt position", value: "Debt-free", tone: "good", explain: "No recurring debt repayments logged." }
      : dtiPct < 36
        ? { label: "Debt position", value: "Managed", tone: "ok", explain: `Debt takes ${dtiPct.toFixed(0)}% of your gross income — inside the safe band.` }
        : { label: "Debt position", value: "High load", tone: "bad", explain: `Debt takes ${dtiPct.toFixed(0)}% of your gross income, above the 36% lenders watch for.` };

  const slope = trend(snaps.map((s) => s.disposable_income));
  const trajectory: Dimension =
    slope > 0.03
      ? { label: "Financial trajectory", value: "Improving", tone: "good", explain: "Your disposable income has been climbing over the period." }
      : slope < -0.03
        ? { label: "Financial trajectory", value: "Declining", tone: "bad", explain: "Your disposable income has been slipping over the period." }
        : { label: "Financial trajectory", value: "Stable", tone: "ok", explain: "Your position has held roughly level over the period." };

  const dims = [spending, savings, debt, trajectory];
  const order = { good: 0, ok: 1, bad: 2 } as const;
  const strongest = [...dims].sort((a, b) => order[a.tone] - order[b.tone])[0];
  const weakest = [...dims].sort((a, b) => order[b.tone] - order[a.tone])[0];

  const summary = `Over the last ${snaps.length} month${snaps.length === 1 ? "" : "s"} your spending has been ${spending.value.toLowerCase()}, your savings behaviour reads as ${savings.value.toLowerCase()}, and your overall trajectory is ${trajectory.value.toLowerCase()}. Your strongest area is ${strongest.label.toLowerCase()} (${strongest.value}). The area with the most room for improvement is ${weakest.label.toLowerCase()} (${weakest.value}).`;

  return { months: snaps.length, dimensions: dims, summary, strongest: strongest.label, weakest: weakest.label };
}
