/**
 * Proactive in-app notifications. Each notification has a dedupe key so the
 * same alert is never raised twice for the same month.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { categoryLabel } from "./categories";

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });
}

export async function markAllRead() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", u.user.id)
    .is("read_at", null);
}

export type NewNotification = { kind: string; title: string; body: string; link?: string; dedupe: string };

export async function pushNotifications(items: NewNotification[]) {
  if (items.length === 0) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("notifications").upsert(
    items.map((n) => ({
      user_id: u.user!.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link ?? null,
      dedupe_key: n.dedupe,
    })),
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
  );
}

export type NotifyContext = {
  period: string; // YYYY-MM
  money: (n: number) => string;
  disposable: number;
  prevDisposable: number | null;
  savingsRate: number;
  dtiPct: number;
  scoreNow: number | null;
  scorePrev: number | null;
  lastExpenseAt: string | null;
  /** category → { spent, budget } for the current month */
  budgets: Record<string, { spent: number; budget: number }>;
  /** biggest month-on-month category increase, if known */
  topCategoryChange: { category: string; delta: number } | null;
  /** subscriptions that got more expensive: name, old and new amount */
  subscriptionIncreases: { name: string; from: number; to: number }[];
};

/** Pure planner: which notifications should exist right now. */
export function buildNotifications(ctx: NotifyContext, now = new Date()): NewNotification[] {
  const out: NewNotification[] = [];
  const day = now.getDate();
  const p = ctx.period;

  if (day < 20) {
    for (const [cat, v] of Object.entries(ctx.budgets)) {
      if (v.budget > 0 && v.spent / v.budget >= 0.8) {
        out.push({
          kind: "budget_80",
          title: `${categoryLabel(cat)} budget at 80%`,
          body: `You've used 80% of your ${categoryLabel(cat)} budget and it's only the ${day}${ordinal(day)}.`,
          link: "/statement",
          dedupe: `budget80:${cat}:${p}`,
        });
      }
    }
  }

  if (ctx.prevDisposable !== null && ctx.prevDisposable > 0) {
    const drop = ctx.prevDisposable - ctx.disposable;
    if (drop / ctx.prevDisposable > 0.2) {
      const main = ctx.topCategoryChange
        ? `${categoryLabel(ctx.topCategoryChange.category)} (up ${ctx.money(ctx.topCategoryChange.delta)})`
        : "higher overall spending";
      out.push({
        kind: "disposable_drop",
        title: "Disposable income is down",
        body: `Your disposable income this month is ${ctx.money(drop)} lower than last month. The main change is ${main}.`,
        link: "/dashboard",
        dedupe: `disposable_drop:${p}`,
      });
    }
  }

  if (ctx.lastExpenseAt) {
    const days = Math.floor((now.getTime() - new Date(ctx.lastExpenseAt).getTime()) / 86400000);
    if (days >= 14) {
      out.push({
        kind: "stale",
        title: "Your snapshot may be incomplete",
        body: `Your snapshot may be incomplete — you haven't logged any expenses in ${days} days.`,
        link: "/expenses",
        dedupe: `stale:${p}`,
      });
    }
  }

  if (ctx.savingsRate < 5) {
    out.push({
      kind: "savings_low",
      title: "Savings rate below 5%",
      body: "Your savings rate has dropped below 5% this month. A quick review of your expenses could help.",
      link: "/expenses",
      dedupe: `savings_low:${p}`,
    });
  }

  if (ctx.dtiPct > 36) {
    out.push({
      kind: "dti_high",
      title: "Debt repayments are high",
      body: `Your debt repayments are now consuming ${ctx.dtiPct.toFixed(0)}% of your gross income, above the recommended 36% threshold.`,
      link: "/planner",
      dedupe: `dti_high:${p}`,
    });
  }

  if (ctx.scoreNow !== null && ctx.scorePrev !== null && ctx.scorePrev - ctx.scoreNow > 30) {
    out.push({
      kind: "score_drop",
      title: "Your Budge Score dropped",
      body: `Your Budge Score dropped ${Math.round(ctx.scorePrev - ctx.scoreNow)} points this month. Tap to see what changed.`,
      link: "/dashboard",
      dedupe: `score_drop:${p}`,
    });
  }

  for (const s of ctx.subscriptionIncreases) {
    out.push({
      kind: "subscription_increase",
      title: "A subscription got more expensive",
      body: `One of your subscriptions appears to have increased in price: ${s.name} is now ${ctx.money(s.to)}, up from ${ctx.money(s.from)}.`,
      link: "/statement",
      dedupe: `sub_inc:${s.name.toLowerCase()}:${p}`,
    });
  }

  return out;
}

function ordinal(d: number) {
  if (d > 3 && d < 21) return "th";
  return ["th", "st", "nd", "rd"][d % 10] ?? "th";
}
