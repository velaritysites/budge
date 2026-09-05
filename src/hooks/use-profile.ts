import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Expense, ExpenseCategory } from "@/lib/finance";

export type Profile = {
  id: string;
  display_name: string | null;
  currency_code: string;
  pay_frequency: "monthly" | "weekly" | "biweekly";
  gross_income: number;
  net_income: number;
  safety_buffer_pct: number;
  onboarded_at: string | null;
  email_notifications: boolean;
  push_notifications: boolean;
  push_token: string | null;
  auto_allocation_mode?: "weighted" | "sequential";
  auto_contribution_timing?: "monthly_1st" | "on_demand" | "estimate_only";
  multi_currency_enabled?: boolean;
  household_view?: boolean;
  debt_strategy?: "avalanche" | "snowball" | null;
  debt_extra_payment?: number;
};

export type IncomeStream = {
  id: string;
  name: string;
  gross_amount: number;
  net_amount: number;
  frequency: "monthly" | "weekly" | "biweekly" | "yearly";
  is_active: boolean;
};

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<Profile | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function useIncomeStreams() {
  return useQuery({
    queryKey: ["income_streams"],
    queryFn: async (): Promise<IncomeStream[]> => {
      const { data, error } = await supabase
        .from("income_streams")
        .select("id, name, gross_amount, net_amount, frequency, is_active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        gross_amount: Number(r.gross_amount),
        net_amount: Number(r.net_amount),
        frequency: r.frequency,
        is_active: r.is_active,
      }));
    },
  });
}

export function useExpenses(includeHousehold = false) {
  return useQuery({
    queryKey: ["expenses", includeHousehold ? "household" : "mine"],
    queryFn: async (): Promise<Expense[]> => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "id, user_id, name, category, amount, frequency, is_fixed, due_day, notify_enabled, notify_lead_days, original_amount, original_currency, exchange_rate",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = includeHousehold ? (data ?? []) : (data ?? []).filter((r: any) => r.user_id === u.user?.id);
      return rows.map((r: any) => ({
        id: r.id as string,
        user_id: r.user_id as string,
        name: r.name as string,
        category: r.category as ExpenseCategory,
        amount: Number(r.amount),
        frequency: r.frequency as Expense["frequency"],
        is_fixed: r.is_fixed as boolean,
        due_day: r.due_day ?? null,
        notify_enabled: !!r.notify_enabled,
        notify_lead_days: r.notify_lead_days ?? 3,
        original_amount: r.original_amount === null || r.original_amount === undefined ? null : Number(r.original_amount),
        original_currency: r.original_currency ?? null,
        exchange_rate: r.exchange_rate === null || r.exchange_rate === undefined ? null : Number(r.exchange_rate),
      }));
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").update(patch).eq("id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
