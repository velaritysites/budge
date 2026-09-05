/**
 * Monthly close — a guided review that locks a month's snapshot so the
 * record of the past stops moving.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CloseableMonth = {
  month: string;
  net_income: number;
  gross_income: number;
  total_expenses: number;
  disposable_income: number;
  savings_rate: number;
  expenses_by_category: Record<string, number>;
  currency_code: string;
  locked_at: string | null;
  close_notes: string | null;
  net_worth: number | null;
};

export function previousMonthKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthLabel(month: string): string {
  return new Date(month).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function useCloseableMonth(month = previousMonthKey()) {
  return useQuery({
    queryKey: ["monthly_close", month],
    queryFn: async (): Promise<CloseableMonth | null> => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select(
          "month, net_income, gross_income, total_expenses, disposable_income, savings_rate, expenses_by_category, currency_code, locked_at, close_notes, net_worth",
        )
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        month: data.month as string,
        net_income: Number(data.net_income),
        gross_income: Number(data.gross_income),
        total_expenses: Number(data.total_expenses),
        disposable_income: Number(data.disposable_income),
        savings_rate: Number(data.savings_rate),
        expenses_by_category: (data.expenses_by_category ?? {}) as Record<string, number>,
        currency_code: (data.currency_code as string) ?? "ZAR",
        locked_at: data.locked_at as string | null,
        close_notes: (data.close_notes as string | null) ?? null,
        net_worth: data.net_worth === null || data.net_worth === undefined ? null : Number(data.net_worth),
      };
    },
  });
}

export function useLockedMonths() {
  return useQuery({
    queryKey: ["monthly_snapshots", "locked"],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await supabase
        .from("monthly_snapshots")
        .select("month, locked_at")
        .not("locked_at", "is", null);
      const out: Record<string, string> = {};
      for (const r of data ?? []) out[(r as any).month] = (r as any).locked_at;
      return out;
    },
  });
}

/** Applies any adjustments made during the close, then locks the month. */
export async function closeMonth(params: {
  month: string;
  netIncome: number;
  grossIncome: number;
  byCategory: Record<string, number>;
  notes: string;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");

  const totalExpenses = Object.values(params.byCategory).reduce((s, v) => s + Number(v || 0), 0);
  const disposable = params.netIncome - totalExpenses;
  const savingsRate = params.netIncome > 0 ? Math.max(0, (disposable / params.netIncome) * 100) : 0;

  const { error } = await supabase
    .from("monthly_snapshots")
    .update({
      net_income: Math.round(params.netIncome * 100) / 100,
      gross_income: Math.round(params.grossIncome * 100) / 100,
      total_expenses: Math.round(totalExpenses * 100) / 100,
      disposable_income: Math.round(disposable * 100) / 100,
      savings_rate: Math.round(savingsRate * 100) / 100,
      expenses_by_category: params.byCategory,
      close_notes: params.notes || null,
      locked_at: new Date().toISOString(),
    })
    .eq("user_id", u.user.id)
    .eq("month", params.month)
    .is("locked_at", null);
  if (error) throw error;

  return { totalExpenses, disposable, savingsRate };
}
