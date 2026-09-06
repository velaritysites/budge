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

/* ------------------------------------------------------------------ *
 * Multi-goal savings planner
 * ------------------------------------------------------------------ */

export type GoalCategory =
  | "vehicle" | "tech" | "travel" | "property" | "education"
  | "emergency" | "clothing" | "health" | "gift" | "other";

export const GOAL_CATEGORIES: { key: GoalCategory; label: string; icon: string }[] = [
  { key: "vehicle", label: "Vehicle", icon: "Car" },
  { key: "tech", label: "Tech & Electronics", icon: "Laptop" },
  { key: "travel", label: "Travel & Holiday", icon: "Plane" },
  { key: "property", label: "Property", icon: "Home" },
  { key: "education", label: "Education", icon: "GraduationCap" },
  { key: "emergency", label: "Emergency Fund", icon: "Shield" },
  { key: "clothing", label: "Clothing & Fashion", icon: "Shirt" },
  { key: "health", label: "Health & Wellness", icon: "HeartPulse" },
  { key: "gift", label: "Gift or Event", icon: "Gift" },
  { key: "other", label: "Other", icon: "Target" },
];

export const GOAL_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  GOAL_CATEGORIES.map((c) => [c.key, c.label]),
);

/** Whole months from today until the given month/date (minimum 1). */
export function monthsUntil(target: string | null, from: Date = new Date()): number {
  if (!target) return 12;
  const d = new Date(target);
  if (isNaN(d.getTime())) return 12;
  const months =
    (d.getFullYear() - from.getFullYear()) * 12 + (d.getMonth() - from.getMonth());
  return Math.max(1, months);
}

export function remainingAmount(g: Pick<Goal, "target_amount" | "current_amount">): number {
  return Math.max(0, g.target_amount - g.current_amount);
}

/** Monthly contribution needed to hit the target by the target date. */
export function requiredMonthly(
  g: Pick<Goal, "target_amount" | "current_amount" | "target_date">,
  extraMonths = 0,
  from: Date = new Date(),
): number {
  const months = monthsUntil(g.target_date, from) + extraMonths;
  return remainingAmount(g) / Math.max(1, months);
}

export function formatMonthYear(date: string | null): string {
  if (!date) return "No date";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "No date";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** "YYYY-MM" -> last-day-safe first-of-month ISO date. */
export function monthInputToDate(monthValue: string): string | null {
  if (!monthValue) return null;
  return `${monthValue}-01`;
}

export function dateToMonthInput(date: string | null): string {
  return date ? date.slice(0, 7) : "";
}

export type PlannerGoal = Goal & {
  category?: string;
  note?: string | null;
  sort_order?: number;
  is_paused?: boolean;
  resume_date?: string | null;
  is_completed?: boolean;
};

export function isActiveGoal(g: PlannerGoal): boolean {
  return !g.is_completed && !g.completed_at && remainingAmount(g) > 0;
}

/** Months from now until a paused goal resumes (0 when already active). */
function resumeOffset(g: PlannerGoal, from: Date): number {
  if (!g.is_paused) return 0;
  if (!g.resume_date) return Infinity;
  return Math.max(0, monthsUntil(g.resume_date, from) - 1);
}

export type TimelineMonth = {
  label: string;
  total: number;
  completing: string[];
};

/**
 * 24-month view of the total monthly goal commitment. A goal contributes until
 * its target month, after which its share drops out of later bars.
 */
export function commitmentTimeline(
  goals: PlannerGoal[],
  months = 24,
  extraMonthsByGoal: Record<string, number> = {},
  from: Date = new Date(),
): TimelineMonth[] {
  const active = goals.filter(isActiveGoal);
  const out: TimelineMonth[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    let total = 0;
    const completing: string[] = [];
    for (const g of active) {
      const start = resumeOffset(g, from);
      if (!isFinite(start)) continue;
      const span = monthsUntil(g.target_date, from) + (extraMonthsByGoal[g.id] ?? 0);
      const end = start + span;
      if (i >= start && i < end) total += remainingAmount(g) / Math.max(1, span);
      if (i === end - 1) completing.push(g.name);
    }
    out.push({
      label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      total,
      completing,
    });
  }
  return out;
}

/** Goals ordered by soonest deadline — Loot's suggested priority order. */
export function suggestedOrder(goals: PlannerGoal[]): PlannerGoal[] {
  return [...goals].sort(
    (a, b) => monthsUntil(a.target_date) - monthsUntil(b.target_date),
  );
}
