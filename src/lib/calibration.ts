/**
 * Cross-user calibration for the Loot Score.
 *
 * Every uploaded bureau score is stored alongside the five factor values that
 * produced the estimate. A scheduled job crunches that dataset into global
 * correction factors that every future estimate benefits from.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FactorKey } from "./budge-score";

export type Corrections = Partial<Record<FactorKey, number>> & { intercept?: number };

export type CorrectionState = {
  corrections: Corrections;
  sample_size: number;
  mean_gap: number;
  mean_abs_gap: number;
  updated_at: string;
};

export type ConfidenceLevel = {
  label: string;
  detail: string;
  tone: "muted" | "caution" | "accent";
  /** 0..1 — how far along the calibration dataset is */
  progress: number;
};

export function confidenceLevel(samples: number): ConfidenceLevel {
  if (samples < 50)
    return {
      label: "Early estimate — wide range",
      detail: `${samples} real bureau scores collected so far. Estimates will tighten as more come in.`,
      tone: "caution",
      progress: samples / 50,
    };
  if (samples <= 200)
    return {
      label: "Developing accuracy",
      detail: `${samples} real bureau scores are shaping the model.`,
      tone: "muted",
      progress: samples / 200,
    };
  if (samples <= 500)
    return {
      label: "Good accuracy",
      detail: `${samples} real bureau scores are shaping the model.`,
      tone: "accent",
      progress: samples / 500,
    };
  return {
    label: "High accuracy",
    detail: `${samples} real bureau scores are shaping the model.`,
    tone: "accent",
    progress: 1,
  };
}

export function useCorrections() {
  return useQuery({
    queryKey: ["score_corrections"],
    queryFn: async (): Promise<CorrectionState | null> => {
      const { data } = await supabase
        .from("score_corrections")
        .select("corrections, sample_size, mean_gap, mean_abs_gap, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (!data) return null;
      return {
        corrections: (data.corrections ?? {}) as Corrections,
        sample_size: Number(data.sample_size ?? 0),
        mean_gap: Number(data.mean_gap ?? 0),
        mean_abs_gap: Number(data.mean_abs_gap ?? 0),
        updated_at: data.updated_at as string,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Have I personally contributed a real score to the dataset? */
export function useMyContributions() {
  return useQuery({
    queryKey: ["score_calibration", "mine"],
    queryFn: async () => {
      const { data } = await supabase
        .from("score_calibration")
        .select("id, bureau, estimated_score, real_score, gap, reported_on")
        .order("reported_on", { ascending: true });
      return data ?? [];
    },
  });
}

/** Records one estimate-vs-real comparison into the shared calibration dataset. */
export async function recordCalibration(row: {
  bureau: string;
  estimated_score: number;
  real_score: number;
  reported_on: string;
  factors: Partial<Record<FactorKey, number>>;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("score_calibration").insert({
    user_id: u.user.id,
    bureau: row.bureau,
    estimated_score: Math.round(row.estimated_score),
    real_score: Math.round(row.real_score),
    gap: Math.round(row.real_score - row.estimated_score),
    dti: row.factors.dti ?? 0,
    payment_consistency: row.factors.payment_consistency ?? 0,
    savings_rate: row.factors.savings_rate ?? 0,
    utilisation: row.factors.utilisation ?? 0,
    expense_consistency: row.factors.expense_consistency ?? 0,
    reported_on: row.reported_on,
  });
}

/**
 * Applies the global correction factors to a raw score.
 * Each factor correction is expressed in points per unit of factor quality.
 */
export function applyCorrections(
  score: number,
  factorQualities: Partial<Record<FactorKey, number>>,
  state: CorrectionState | null | undefined,
): number {
  if (!state || state.sample_size < 5) return score;
  let adjusted = score + (state.corrections.intercept ?? 0);
  for (const [key, coeff] of Object.entries(state.corrections)) {
    if (key === "intercept") continue;
    const q = factorQualities[key as FactorKey];
    if (typeof q === "number" && typeof coeff === "number") adjusted += coeff * q;
  }
  return Math.max(0, Math.min(999, Math.round(adjusted)));
}
