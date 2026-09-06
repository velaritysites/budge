/**
 * Runs the proactive notification rules once per app session and writes any
 * new alerts to Supabase. Dedupe keys keep it idempotent.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildNotifications, pushNotifications, type NotifyContext } from "./notify";
import { formatCurrency } from "./format";
import { normalizeCategory } from "./categories";
import type { Totals, Expense } from "./finance";

type Snap = { month: string; disposable_income: number; total_expenses: number };

export function useNotificationEngine({
  totals,
  expenses,
  snaps,
  currency,
}: {
  totals: Totals;
  expenses: Expense[];
  snaps: Snap[];
  currency: string;
}) {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (totals.netIncome <= 0) return;
    ran.current = true;

    (async () => {
      try {
        const now = new Date();
        const period = now.toISOString().slice(0, 7);
        const money = (n: number) => formatCurrency(n, currency, { decimals: 0 });

        const [{ data: debts }, { data: statements }, { data: scores }, { data: lastExpense }] = await Promise.all([
          supabase.from("debts").select("min_payment"),
          supabase
            .from("statement_analyses")
            .select("statement_month, category_totals, subscription_items, created_at")
            .order("created_at", { ascending: false })
            .limit(4),
          supabase.from("budge_scores").select("month, score").order("month", { ascending: false }).limit(2),
          supabase
            .from("expenses")
            .select("created_at")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        const debtMonthly = (debts ?? []).reduce((s: number, d: any) => s + Number(d.min_payment ?? 0), 0);
        const dtiPct = totals.grossIncome > 0 ? (debtMonthly / totals.grossIncome) * 100 : 0;

        // Lootts: planned monthly amount per category vs what the newest statement shows spent.
        const budgets: NotifyContext["budgets"] = {};
        const latest = (statements ?? [])[0];
        const latestTotals = (latest?.category_totals ?? {}) as Record<string, number>;
        for (const [k, v] of Object.entries(latestTotals)) {
          const cat = normalizeCategory(k);
          const budget = totals.byCategory[cat] ?? 0;
          if (budget > 0) budgets[cat] = { spent: Number(v || 0), budget };
        }

        // Biggest month-on-month category increase across the two most recent statements.
        let topCategoryChange: NotifyContext["topCategoryChange"] = null;
        const prevTotals = ((statements ?? [])[1]?.category_totals ?? {}) as Record<string, number>;
        for (const [k, v] of Object.entries(latestTotals)) {
          const delta = Number(v || 0) - Number(prevTotals[k] ?? 0);
          if (delta > 0 && (!topCategoryChange || delta > topCategoryChange.delta)) {
            topCategoryChange = { category: normalizeCategory(k), delta };
          }
        }

        // Subscription price increases between the two most recent statements.
        const subsNow = (latest?.subscription_items ?? []) as any[];
        const subsPrev = ((statements ?? [])[1]?.subscription_items ?? []) as any[];
        const subscriptionIncreases: NotifyContext["subscriptionIncreases"] = [];
        for (const s of subsNow) {
          const match = subsPrev.find(
            (p: any) => String(p.name ?? "").toLowerCase().slice(0, 12) === String(s.name ?? "").toLowerCase().slice(0, 12),
          );
          if (match && Number(s.amount) > Number(match.amount) * 1.02) {
            subscriptionIncreases.push({ name: String(s.name), from: Number(match.amount), to: Number(s.amount) });
          }
        }

        const ctx: NotifyContext = {
          period,
          money,
          disposable: totals.disposable,
          prevDisposable: snaps.find((s) => !s.month.startsWith(period))?.disposable_income ?? null,
          savingsRate: totals.savingsRate,
          dtiPct,
          scoreNow: scores?.[0]?.score ?? null,
          scorePrev: scores?.[1]?.score ?? null,
          lastExpenseAt: (lastExpense ?? [])[0]?.created_at ?? null,
          budgets,
          topCategoryChange,
          subscriptionIncreases,
        };

        const items = buildNotifications(ctx, now);
        if (items.length > 0) {
          await pushNotifications(items);
          qc.invalidateQueries({ queryKey: ["notifications"] });
        }
      } catch {
        // Notifications are best-effort — never block the dashboard.
      }
    })();
  }, [totals, expenses, snaps, currency, qc]);
}
