export type ProgressMode = "auto" | "manual";
export type AutoAllocationMode = "weighted" | "sequential";
export type AutoContributionTiming = "monthly_1st" | "on_demand" | "estimate_only";

export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  progress_mode: ProgressMode;
  priority: number;
  weight: number;
  completed_at: string | null;
  last_auto_period: string | null;
};

export type GoalContribution = {
  id: string;
  goal_id: string;
  amount: number;
  occurred_on: string;
  note: string | null;
  source: "manual" | "auto" | "initial";
  created_at: string;
};

/**
 * Compute how much each active auto-goal would receive from a given disposable
 * pool this month, according to the user's allocation mode.
 */
export function computeAutoAllocations(
  goals: Goal[],
  disposable: number,
  mode: AutoAllocationMode,
): Record<string, number> {
  const out: Record<string, number> = {};
  const auto = goals.filter(
    (g) => g.progress_mode === "auto" && !g.completed_at && g.current_amount < g.target_amount,
  );
  if (auto.length === 0 || disposable <= 0) {
    for (const g of auto) out[g.id] = 0;
    return out;
  }

  if (mode === "sequential") {
    const ordered = [...auto].sort((a, b) => a.priority - b.priority);
    let remaining = disposable;
    for (const g of ordered) {
      const need = Math.max(0, g.target_amount - g.current_amount);
      const alloc = Math.min(need, remaining);
      out[g.id] = alloc;
      remaining -= alloc;
      if (remaining <= 0) break;
    }
    for (const g of auto) if (!(g.id in out)) out[g.id] = 0;
    return out;
  }

  // weighted
  const totalWeight = auto.reduce((s, g) => s + Math.max(0, g.weight), 0) || 1;
  let leftover = 0;
  for (const g of auto) {
    const share = disposable * (Math.max(0, g.weight) / totalWeight);
    const need = Math.max(0, g.target_amount - g.current_amount);
    const alloc = Math.min(share, need);
    leftover += share - alloc;
    out[g.id] = alloc;
  }
  // redistribute leftover to under-filled goals until exhausted
  let guard = 0;
  while (leftover > 0.01 && guard++ < 10) {
    const underfilled = auto.filter((g) => out[g.id] < g.target_amount - g.current_amount);
    if (underfilled.length === 0) break;
    const w = underfilled.reduce((s, g) => s + Math.max(0, g.weight), 0) || 1;
    let newLeft = 0;
    for (const g of underfilled) {
      const share = leftover * (Math.max(0, g.weight) / w);
      const need = g.target_amount - g.current_amount - out[g.id];
      const alloc = Math.min(share, need);
      newLeft += share - alloc;
      out[g.id] += alloc;
    }
    leftover = newLeft;
  }
  return out;
}

export function currentPeriodKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
