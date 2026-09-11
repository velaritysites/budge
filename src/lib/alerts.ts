import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCategory, type ExpenseCategory } from "./categories";

export type SpendingAlert = {
  id: string;
  category: ExpenseCategory;
  period: string;
  amount: number;
  average: number;
  pct_above: number;
  dismissed_at: string | null;
};

/** Categories where this month is more than 25% above the 3-month average. */
export function computeAnomalies(
  current: Record<string, number>,
  history: Record<string, number>[],
): { category: ExpenseCategory; amount: number; average: number; pctAbove: number }[] {
  if (history.length === 0) return [];
  const sums: Record<string, number> = {};
  for (const h of history) {
    for (const [k, v] of Object.entries(h ?? {})) {
      const key = normalizeCategory(k);
      sums[key] = (sums[key] ?? 0) + Number(v || 0);
    }
  }
  const out: { category: ExpenseCategory; amount: number; average: number; pctAbove: number }[] = [];
  for (const [rawKey, rawVal] of Object.entries(current ?? {})) {
    const key = normalizeCategory(rawKey);
    const amount = Number(rawVal || 0);
    const average = (sums[key] ?? 0) / history.length;
    if (average <= 0 || amount <= 0) continue;
    const pctAbove = (amount / average - 1) * 100;
    if (pctAbove > 25) out.push({ category: key as ExpenseCategory, amount, average, pctAbove });
  }
  return out.sort((a, b) => b.pctAbove - a.pctAbove);
}

export async function persistAnomalies(
  period: string,
  anomalies: { category: string; amount: number; average: number; pctAbove: number }[],
) {
  if (anomalies.length === 0) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const categories = anomalies.map((a) => a.category);
  const { data: existing } = await supabase
    .from("spending_alerts")
    .select("category, dismissed_at")
    .eq("user_id", u.user.id)
    .eq("period", period)
    .in("category", categories);
  const dismissed = new Map((existing ?? []).map((row) => [row.category, row.dismissed_at]));
  await supabase.from("spending_alerts").upsert(
    anomalies.map((a) => ({
      user_id: u.user.id,
      category: a.category,
      period,
      amount: Math.round(a.amount * 100) / 100,
      average: Math.round(a.average * 100) / 100,
      pct_above: Math.round(a.pctAbove),
      dismissed_at: dismissed.get(a.category) ?? null,
    })),
    { onConflict: "user_id,category,period" },
  );
}

export async function dismissAlert(id: string) {
  await supabase.from("spending_alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
}

export function useOpenAlerts() {
  return useQuery({
    queryKey: ["spending_alerts"],
    queryFn: async (): Promise<SpendingAlert[]> => {
      const { data, error } = await supabase
        .from("spending_alerts")
        .select("id, category, period, amount, average, pct_above, dismissed_at")
        .is("dismissed_at", null)
        .order("pct_above", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        category: normalizeCategory(r.category) as ExpenseCategory,
        period: r.period,
        amount: Number(r.amount),
        average: Number(r.average),
        pct_above: Number(r.pct_above),
        dismissed_at: r.dismissed_at,
      }));
    },
  });
}
