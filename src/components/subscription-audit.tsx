import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { Repeat } from "lucide-react";

export type SubscriptionItem = { name: string; amount: number; date: string };

type AnalysisRow = {
  id: string;
  statement_month: string | null;
  created_at: string;
  subscription_items: SubscriptionItem[];
};

export function SubscriptionAudit({ currency }: { currency: string }) {
  const qc = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["statement_analyses", "subscriptions"],
    queryFn: async (): Promise<AnalysisRow[]> => {
      const { data, error } = await supabase
        .from("statement_analyses")
        .select("id, statement_month, created_at, subscription_items")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        statement_month: r.statement_month,
        created_at: r.created_at,
        subscription_items: Array.isArray(r.subscription_items) ? r.subscription_items : [],
      }));
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["subscription_reviews"],
    queryFn: async (): Promise<{ service_name: string; marked: boolean }[]> => {
      const { data } = await supabase.from("subscription_reviews").select("service_name, marked");
      return (data ?? []) as any;
    },
  });

  const marked = useMemo(
    () => new Set(reviews.filter((r) => r.marked).map((r) => r.service_name)),
    [reviews],
  );

  const recurring = useMemo(() => {
    const map = new Map<string, { name: string; months: Set<string>; amount: number; last: string }>();
    for (const row of rows) {
      const period = row.statement_month ?? row.created_at.slice(0, 7);
      for (const item of row.subscription_items) {
        const key = (item.name ?? "").toUpperCase().trim();
        if (!key) continue;
        const entry = map.get(key) ?? { name: item.name, months: new Set<string>(), amount: 0, last: item.date };
        entry.months.add(period);
        if (!entry.amount) entry.amount = Number(item.amount) || 0;
        if (item.date && item.date > entry.last) {
          entry.last = item.date;
          entry.amount = Number(item.amount) || entry.amount;
        }
        map.set(key, entry);
      }
    }
    return [...map.values()]
      .filter((s) => s.months.size > 1)
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

  async function toggle(name: string, next: boolean) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase
      .from("subscription_reviews")
      .upsert({ user_id: u.user.id, service_name: name, marked: next }, { onConflict: "user_id,service_name" });
    qc.invalidateQueries({ queryKey: ["subscription_reviews"] });
  }

  if (rows.length < 2) {
    return (
      <section className="panel p-6">
        <div className="flex items-center gap-2">
          <Repeat className="size-3.5 text-accent" />
          <span className="label-xs">Subscription audit</span>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Upload 2 or more months of statements to unlock the subscription audit.
        </p>
      </section>
    );
  }

  const total = recurring.reduce((s, r) => s + r.amount, 0);

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Repeat className="size-3.5 text-accent" />
          <span className="label-xs">Subscription audit</span>
        </div>
        <span className="numeric text-sm font-bold">
          {formatCurrency(total, currency, { decimals: 0 })}
          <span className="ml-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">per month</span>
        </span>
      </div>

      {recurring.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          No subscription charged in more than one month yet.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          {recurring.map((s) => {
            const isMarked = marked.has(s.name);
            return (
              <div key={s.name} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Last charged {s.last || "—"} · seen in {s.months.size} months
                  </p>
                </div>
                <span className="numeric text-sm font-semibold">{formatCurrency(s.amount, currency)}</span>
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isMarked}
                    onChange={(e) => toggle(s.name, e.target.checked)}
                    className="size-3.5 accent-[var(--accent)]"
                  />
                  Cancel?
                </label>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
