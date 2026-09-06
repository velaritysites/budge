/**
 * Loot Score — a 0–999 estimate of credit health built from data Loot
 * already holds. It is NOT a bureau score; it is a transparent, weighted
 * model whose factors are always shown to the user.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentMonthKey } from "./finance";

export type FactorKey =
  | "dti"
  | "payment_consistency"
  | "savings_rate"
  | "utilisation"
  | "expense_consistency";

export type Factor = {
  key: FactorKey;
  label: string;
  weight: number; // 0..1
  /** normalised quality of this factor, 0 (poor) → 1 (excellent) */
  quality: number;
  /** points this factor contributes to the final score */
  points: number;
  /** points it could still gain */
  headroom: number;
  rating: "excellent" | "good" | "fair" | "poor";
  detail: string;
};

export type ScoreInputs = {
  grossIncome: number;
  netIncome: number;
  debtMonthly: number;
  debtBalance: number;
  creditCardBalance: number;
  savingsRate: number;
  /** 0..1 — share of fixed commitments that run on a fixed day (debit-order-like) */
  debitOrderShare: number;
  /** monthly total expenses history, most recent first */
  expenseHistory: number[];
  /** how many months of statement analyses exist */
  statementMonths: number;
};

export const SCORE_MIN = 0;
export const SCORE_MAX = 999;
const BASE = 300; // floor of the modelled band, matching SA bureau convention
const SPAN = 699;

const WEIGHTS: Record<FactorKey, number> = {
  dti: 0.3,
  payment_consistency: 0.25,
  savings_rate: 0.2,
  utilisation: 0.15,
  expense_consistency: 0.1,
};

function rate(q: number): Factor["rating"] {
  if (q >= 0.8) return "excellent";
  if (q >= 0.6) return "good";
  if (q >= 0.35) return "fair";
  return "poor";
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** Coefficient of variation → stability quality. */
export function stabilityQuality(history: number[]): number {
  const vals = history.filter((v) => v > 0);
  if (vals.length < 2) return 0.55; // neutral until there's history
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (mean <= 0) return 0.55;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const cv = Math.sqrt(variance) / mean;
  return clamp01(1 - cv / 0.35);
}

export type LootScore = {
  score: number;
  band: "green" | "amber" | "red";
  factors: Factor[];
  /** confidence half-width in points */
  confidence: number;
  dtiPct: number;
  utilisationPct: number;
};

export function computeLootScore(input: ScoreInputs, calibration?: Calibration): LootScore {
  const dtiPct = input.grossIncome > 0 ? (input.debtMonthly / input.grossIncome) * 100 : 0;
  const dtiQ =
    dtiPct < 20 ? 1 : dtiPct < 36 ? 0.72 : dtiPct < 50 ? 0.45 : Math.max(0.08, 0.45 - (dtiPct - 50) / 100);

  const payQ = clamp01(input.debitOrderShare * 0.8 + Math.min(input.statementMonths, 3) / 3 * 0.2);

  const sr = input.savingsRate;
  const savQ = sr >= 20 ? 1 : sr >= 10 ? 0.7 : sr >= 5 ? 0.45 : clamp01(sr / 5) * 0.35;

  // Utilisation proxy: revolving balance against an assumed limit of ~1 month gross.
  const assumedLimit = Math.max(input.grossIncome, 1);
  const utilisationPct = clamp01(input.creditCardBalance / assumedLimit) * 100;
  const utilQ = utilisationPct < 10 ? 1 : utilisationPct < 30 ? 0.78 : utilisationPct < 50 ? 0.5 : 0.2;

  const stabQ = stabilityQuality(input.expenseHistory);

  const raw: { key: FactorKey; label: string; quality: number; detail: string }[] = [
    {
      key: "dti",
      label: "Debt-to-income",
      quality: dtiQ,
      detail: `Debt repayments are ${dtiPct.toFixed(0)}% of gross income.`,
    },
    {
      key: "payment_consistency",
      label: "Payment consistency",
      quality: payQ,
      detail: `${Math.round(input.debitOrderShare * 100)}% of your fixed commitments run on a set day.`,
    },
    {
      key: "savings_rate",
      label: "Savings rate",
      quality: savQ,
      detail: `You're keeping ${sr.toFixed(0)}% of your income each month.`,
    },
    {
      key: "utilisation",
      label: "Credit utilisation",
      quality: utilQ,
      detail: `Estimated revolving utilisation of ${utilisationPct.toFixed(0)}%.`,
    },
    {
      key: "expense_consistency",
      label: "Expense consistency",
      quality: stabQ,
      detail:
        input.expenseHistory.length < 2
          ? "Not enough history yet — this settles as months build up."
          : "Based on how steady your monthly spending has been.",
    },
  ];

  const factors: Factor[] = raw.map((f) => {
    const weight = WEIGHTS[f.key];
    const points = Math.round(SPAN * weight * f.quality);
    return {
      ...f,
      weight,
      points,
      headroom: Math.round(SPAN * weight) - points,
      rating: rate(f.quality),
    };
  });

  let score = BASE + factors.reduce((s, f) => s + f.points, 0);
  if (calibration) score = Math.round(score + calibration.offset);
  score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(score)));

  const monthsOfData = input.expenseHistory.length;
  const base = 90 - Math.min(monthsOfData, 6) * 6; // 90 → 54
  const confidence = Math.max(18, Math.round(calibration ? Math.min(base, calibration.spread) : base));

  return {
    score,
    band: score > 700 ? "green" : score >= 550 ? "amber" : "red",
    factors,
    confidence,
    dtiPct,
    utilisationPct,
  };
}

export const BAND_STYLES: Record<LootScore["band"], string> = {
  green: "text-accent",
  amber: "text-caution",
  red: "text-alert",
};

export const BAND_LABEL: Record<LootScore["band"], string> = {
  green: "Healthy",
  amber: "Fair",
  red: "Needs work",
};

/* ---------------- calibration against real bureau scores ---------------- */

export type Calibration = { offset: number; spread: number; samples: number };

/** Mean signed gap between real bureau scores and our estimate for the same period. */
export function calibrationFrom(rows: { score: number; estimated_score: number | null }[]): Calibration | null {
  const usable = rows.filter((r) => typeof r.estimated_score === "number");
  if (usable.length === 0) return null;
  const gaps = usable.map((r) => r.score - (r.estimated_score as number));
  const offset = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - offset) ** 2, 0) / gaps.length;
  const spread = Math.max(15, Math.round(Math.sqrt(variance) * 1.2));
  return { offset, spread, samples: usable.length };
}

export function explainGap(gap: number, s: LootScore): string {
  if (Math.abs(gap) <= 25) return "your bureau file closely matches the picture Loot has of your money";
  const weakest = [...s.factors].sort((a, b) => b.headroom - a.headroom)[0];
  return gap > 0
    ? `credit history Loot can't see — length of accounts, older settled loans and enquiry history — which the bureau rewards`
    : `${weakest.label.toLowerCase()} showing better inside Loot than on your bureau file, plus arrears or enquiries Loot has no sight of`;
}

/* ---------------- persistence ---------------- */

export async function saveMonthlyScore(score: number, factors: Factor[]) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("budge_scores").upsert(
    {
      user_id: u.user.id,
      month: currentMonthKey(),
      score,
      factors: factors as any,
    },
    { onConflict: "user_id,month" },
  );
}

export type ScoreRow = { month: string; score: number };

export function useScoreHistory() {
  return useQuery({
    queryKey: ["budge_scores"],
    queryFn: async (): Promise<ScoreRow[]> => {
      const { data, error } = await supabase
        .from("budge_scores")
        .select("month, score")
        .order("month", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ month: r.month, score: Number(r.score) }));
    },
  });
}

export type BureauRow = {
  id: string;
  bureau: string;
  score: number;
  reported_on: string;
  estimated_score: number | null;
  gap: number | null;
};

export function useBureauScores() {
  return useQuery({
    queryKey: ["bureau_scores"],
    queryFn: async (): Promise<BureauRow[]> => {
      const { data, error } = await supabase
        .from("bureau_scores")
        .select("id, bureau, score, reported_on, estimated_score, gap")
        .order("reported_on", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as BureauRow[];
    },
  });
}

export const BUREAUS = ["TransUnion", "Experian", "Compuscan", "XDS"] as const;

/* ---------------- recommendations ---------------- */

export type Recommendation = {
  id: string;
  title: string;
  body: string;
  to: string;
  cta: string;
  impact: number; // points of headroom
};

export function buildRecommendations(
  s: LootScore,
  ctx: { disposable: number; creditCardBalance: number; grossIncome: number; savingsBalance: number; topDebtName: string | null; currencyFormat: (n: number) => string },
): Recommendation[] {
  const out: Recommendation[] = [];

  if (s.utilisationPct > 30) {
    const target = Math.max(0, ctx.creditCardBalance - 0.3 * Math.max(ctx.grossIncome, 1));
    const months = ctx.disposable > 0 ? Math.ceil(target / ctx.disposable) : 0;
    out.push({
      id: "utilisation",
      title: "Bring your card below 30% utilisation",
      body: `Your estimated credit utilisation is ${s.utilisationPct.toFixed(0)}%. Paying your credit card balance below 30% of its limit would likely have the biggest single impact on your score.${
        months > 0 ? ` Based on your disposable income, you could reach that threshold in ${months} month${months === 1 ? "" : "s"}.` : ""
      }`,
      to: "/planner",
      cta: "Open the debt payoff planner",
      impact: s.factors.find((f) => f.key === "utilisation")?.headroom ?? 0,
    });
  }

  if (s.dtiPct > 36) {
    out.push({
      id: "dti",
      title: "Reduce your debt-to-income ratio",
      body: `Your debt repayments are ${s.dtiPct.toFixed(0)}% of your gross income. Lenders view above 36% as high risk.${
        ctx.topDebtName ? ` Your debt payoff planner shows the fastest route is to prioritise ${ctx.topDebtName}.` : ""
      }`,
      to: "/planner",
      cta: "Model this in the Planner",
      impact: s.factors.find((f) => f.key === "dti")?.headroom ?? 0,
    });
  }

  if (ctx.savingsBalance <= 0) {
    out.push({
      id: "savings",
      title: "Start a small, fixed monthly saving",
      body: "Having zero savings is a negative signal to credit bureaus. Even a small fixed monthly transfer improves this signal over time.",
      to: "/goals",
      cta: "Create a savings goal",
      impact: s.factors.find((f) => f.key === "savings_rate")?.headroom ?? 0,
    });
  }

  const pay = s.factors.find((f) => f.key === "payment_consistency");
  if (pay && pay.quality < 0.7) {
    out.push({
      id: "payments",
      title: "Put every fixed commitment on a debit order",
      body: "Irregular payment timing detected. Setting up debit orders for all fixed commitments removes this risk entirely.",
      to: "/expenses",
      cta: "Set due dates on your expenses",
      impact: pay.headroom,
    });
  }

  if (ctx.creditCardBalance <= 0 && s.dtiPct < 5) {
    out.push({
      id: "thin_file",
      title: "Build a little credit history",
      body: "Limited credit activity makes it hard for bureaus to score you. A low-limit credit card paid in full monthly builds history without risk.",
      to: "/checker",
      cta: "Check what you can afford",
      impact: 40,
    });
  }

  return out.sort((a, b) => b.impact - a.impact);
}
