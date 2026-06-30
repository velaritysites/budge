import { supabase } from "@/integrations/supabase/client";
import { computeTotals, currentMonthKey, type Expense } from "./finance";

export async function upsertCurrentMonthSnapshot(params: {
  netIncome: number;
  grossIncome: number;
  expenses: Expense[];
  currencyCode: string;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const totals = computeTotals(params.netIncome, params.grossIncome, params.expenses);
  await supabase.from("monthly_snapshots").upsert(
    {
      user_id: u.user.id,
      month: currentMonthKey(),
      net_income: params.netIncome,
      gross_income: params.grossIncome,
      total_expenses: totals.totalExpenses,
      disposable_income: totals.disposable,
      savings_rate: totals.savingsRate,
      expenses_by_category: totals.byCategory,
      currency_code: params.currencyCode,
    },
    { onConflict: "user_id,month" },
  );
}
