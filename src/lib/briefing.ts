/**
 * Monthly insights briefing — plain-language observations built from the
 * user's own numbers, generated after a month is closed.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { categoryLabel, normalizeCategory } from "./categories";

export type Briefing = {
  month: string;
  observations: string[];
  recommendation: string;
};

export type BriefingInput = {
  month: string;
  money: (n: number) => string;
  netIncome: number;
  totalExpenses: number;
  disposable: number;
  savingsRate: number;
  prevSavingsRate: number | null;
  byCategory: Record<string, number>;
  /** three prior months of category totals, most recent first */
  history: Record<string, number>[];
  scoreNow: number | null;
  scorePrev: number | null;
  topScoreDriver: string | null;
  dtiPct: number;
  prevDtiPct: number | null;
  /** benchmark averages as a % of income, keyed by category */
  benchmarks: Record<string, number>;
  goalsCompleted: string[];
};

export function buildBriefing(input: BriefingInput): Briefing {
  const obs: string[] = [];
  const m = input.money;

  // 1. Category moves vs the 3-month average
  const avg: Record<string, number> = {};
  if (input.history.length > 0) {
    for (const h of input.history) {
      for (const [k, v] of Object.entries(h ?? {})) {
        const key = normalizeCategory(k);
        avg[key] = (avg[key] ?? 0) + Number(v || 0);
      }
    }
    for (const k of Object.keys(avg)) avg[k] = (avg[k] ?? 0) / input.history.length;
  }

  const moves: { cat: string; now: number; mean: number; pct: number }[] = [];
  for (const [rawK, rawV] of Object.entries(input.byCategory)) {
    const k = normalizeCategory(rawK);
    const now = Number(rawV || 0);
    const mean = avg[k] ?? 0;
    if (mean <= 0 || now <= 0) continue;
    const pct = (now / mean - 1) * 100;
    if (Math.abs(pct) > 15) moves.push({ cat: k, now, mean, pct });
  }
  moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  for (const mv of moves.slice(0, 3)) {
    obs.push(
      mv.pct > 0
        ? `${categoryLabel(mv.cat)} came in at ${m(mv.now)} — ${mv.pct.toFixed(0)}% above your ${m(mv.mean)} three-month average.`
        : `${categoryLabel(mv.cat)} dropped to ${m(mv.now)}, ${Math.abs(mv.pct).toFixed(0)}% below your ${m(mv.mean)} average. That saved you ${m(mv.mean - mv.now)}.`,
    );
  }

  // 2. Savings rate movement
  if (input.prevSavingsRate !== null) {
    const d = input.savingsRate - input.prevSavingsRate;
    if (Math.abs(d) >= 0.5) {
      obs.push(
        d > 0
          ? `Your savings rate rose from ${input.prevSavingsRate.toFixed(0)}% to ${input.savingsRate.toFixed(0)}% — ${m((d / 100) * input.netIncome)} more kept each month.`
          : `Your savings rate slipped from ${input.prevSavingsRate.toFixed(0)}% to ${input.savingsRate.toFixed(0)}%, which is ${m((Math.abs(d) / 100) * input.netIncome)} less kept.`,
      );
    } else {
      obs.push(`Your savings rate held steady at ${input.savingsRate.toFixed(0)}%.`);
    }
  } else {
    obs.push(`You kept ${input.savingsRate.toFixed(0)}% of your income — ${m(input.disposable)} left after everything went out.`);
  }

  // 3. Loot Score movement
  if (input.scoreNow !== null && input.scorePrev !== null && input.scoreNow !== input.scorePrev) {
    const d = input.scoreNow - input.scorePrev;
    obs.push(
      `Your Loot Score moved ${d > 0 ? "up" : "down"} ${Math.abs(d)} points to ${input.scoreNow}${
        input.topScoreDriver ? `, mostly driven by ${input.topScoreDriver.toLowerCase()}` : ""
      }.`,
    );
  } else if (input.scoreNow !== null) {
    obs.push(`Your Loot Score is unchanged at ${input.scoreNow}.`);
  }

  // 4. Debt-to-income threshold crossings
  if (input.prevDtiPct !== null) {
    if (input.prevDtiPct >= 36 && input.dtiPct < 36) {
      obs.push(`Debt repayments dropped to ${input.dtiPct.toFixed(0)}% of gross income — under the 36% ceiling lenders use for the first time.`);
    } else if (input.prevDtiPct < 36 && input.dtiPct >= 36) {
      obs.push(`Debt repayments crossed above 36% of gross income (${input.dtiPct.toFixed(0)}%). That's the level lenders start declining applications at.`);
    }
  }

  // 5. Most room for reduction, benchmark-based
  let worst: { cat: string; over: number; pct: number } | null = null;
  if (input.netIncome > 0) {
    for (const [rawK, rawV] of Object.entries(input.byCategory)) {
      const k = normalizeCategory(rawK);
      const bench = input.benchmarks[k];
      if (!bench) continue;
      const sharePct = (Number(rawV || 0) / input.netIncome) * 100;
      const over = ((sharePct - bench) / 100) * input.netIncome;
      if (over > 0 && (!worst || over > worst.over)) worst = { cat: k, over, pct: sharePct };
    }
  }
  if (worst) {
    obs.push(
      `${categoryLabel(worst.cat)} is your biggest gap to the benchmark — at ${worst.pct.toFixed(0)}% of income you're roughly ${m(worst.over)} a month above what similar earners spend.`,
    );
  }

  // 6. Goals completed
  for (const g of input.goalsCompleted.slice(0, 2)) {
    obs.push(`You finished your ${g} goal last month. That one's done.`);
  }

  // 7. Twelve-month projection
  const yearly = (input.savingsRate / 100) * input.netIncome * 12;
  if (yearly > 0) {
    obs.push(`Keep this rate up and you'll have put away about ${m(yearly)} over the next twelve months.`);
  }

  // Recommendation — one, specific, prioritised.
  let recommendation: string;
  if (input.dtiPct >= 36) {
    recommendation = `Priority this month: get debt repayments under 36% of gross income. Put anything spare against the highest-rate account first.`;
  } else if (worst) {
    recommendation = `Priority this month: cap ${categoryLabel(worst.cat)} at ${m(Math.max(0, Number(input.byCategory[worst.cat] ?? 0) - worst.over))}. That single change is worth about ${m(worst.over)} a month.`;
  } else if (moves[0] && moves[0].pct > 0) {
    recommendation = `Priority this month: bring ${categoryLabel(moves[0].cat)} back to its usual ${m(moves[0].mean)} — it's the one line that moved against you.`;
  } else if (input.savingsRate < 15) {
    recommendation = `Priority this month: set up an automatic transfer of ${m(Math.max(200, input.netIncome * 0.05))} on payday. It moves your savings rate without needing willpower.`;
  } else {
    recommendation = `Priority this month: hold the line. Nothing needs fixing — put the ${m(input.disposable)} left over into a goal before it drifts.`;
  }

  return { month: input.month, observations: obs.slice(0, 8), recommendation };
}

export async function saveBriefing(b: Briefing) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("monthly_briefings").upsert(
    {
      user_id: u.user.id,
      month: b.month,
      observations: b.observations,
      recommendation: b.recommendation,
    },
    { onConflict: "user_id,month" },
  );
}

export function useBriefings() {
  return useQuery({
    queryKey: ["monthly_briefings"],
    queryFn: async (): Promise<Briefing[]> => {
      const { data, error } = await supabase
        .from("monthly_briefings")
        .select("month, observations, recommendation")
        .order("month", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        month: r.month,
        observations: (r.observations ?? []) as string[],
        recommendation: r.recommendation ?? "",
      }));
    },
  });
}
