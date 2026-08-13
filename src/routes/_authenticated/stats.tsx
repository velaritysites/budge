import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { CATEGORY_LABELS, CATEGORY_COLORS, type ExpenseCategory } from "@/lib/finance";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({ meta: [{ title: "Stats & History — CanIAfford" }] }),
  component: StatsPage,
});

type Snapshot = {
  month: string;
  net_income: number;
  gross_income: number;
  total_expenses: number;
  disposable_income: number;
  savings_rate: number;
  expenses_by_category: Record<ExpenseCategory, number>;
  currency_code: string;
};

function StatsPage() {
  const { data: profile } = useProfile();
  const [range, setRange] = useState<3 | 6 | 12>(6);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [drillCategory, setDrillCategory] = useState<ExpenseCategory | null>(null);

  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots"],
    queryFn: async (): Promise<Snapshot[]> => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select("month, net_income, gross_income, total_expenses, disposable_income, savings_rate, expenses_by_category, currency_code")
        .order("month", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        month: r.month as string,
        net_income: Number(r.net_income),
        gross_income: Number(r.gross_income),
        total_expenses: Number(r.total_expenses),
        disposable_income: Number(r.disposable_income),
        savings_rate: Number(r.savings_rate),
        expenses_by_category: (r.expenses_by_category ?? {}) as Record<ExpenseCategory, number>,
        currency_code: (r.currency_code as string) ?? "USD",
      }));
    },
  });

  const { data: checks = [] } = useQuery({
    queryKey: ["affordability_checks_stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("affordability_checks")
        .select("id, item_name, amount, is_recurring, verdict, created_at, currency_code")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals_stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("savings_goals")
        .select("id, name, target_amount, current_amount, target_date, completed_at, progress_mode")
        .order("completed_at", { ascending: false, nullsFirst: true });
      return (data ?? []).map((r: any) => ({
        id: r.id, name: r.name,
        target_amount: Number(r.target_amount), current_amount: Number(r.current_amount),
        target_date: r.target_date, completed_at: r.completed_at, progress_mode: r.progress_mode,
      }));
    },
  });

  const ranged = useMemo(() => snapshots.slice(0, range).reverse(), [snapshots, range]);
  const active = useMemo(() => snapshots.find((s) => s.month === selectedMonth) ?? snapshots[0], [snapshots, selectedMonth]);
  const prev = useMemo(() => {
    if (!active) return null;
    const idx = snapshots.findIndex((s) => s.month === active.month);
    return snapshots[idx + 1] ?? null;
  }, [snapshots, active]);

  if (!profile) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  const currency = active?.currency_code ?? profile.currency_code;

  function pctDelta(curr: number, prev: number): string {
    if (!prev) return "—";
    const d = ((curr - prev) / Math.abs(prev)) * 100;
    return `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
  }

  const maxDisp = Math.max(1, ...ranged.map((s) => Math.abs(s.disposable_income)));

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Stats & History</span>
      </header>

      <div className="p-6 md:p-8 space-y-10 max-w-6xl mx-auto w-full">
        {snapshots.length === 0 ? (
          <div className="text-center py-16">
            <h1 className="text-3xl font-display font-extrabold tracking-tight mb-2">No history yet.</h1>
            <p className="text-sm text-muted-foreground">Add income and expenses to start building your monthly snapshots.</p>
          </div>
        ) : (
          <>
            {/* Snapshot picker */}
            <section className="animate-enter space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight">Monthly snapshot.</h2>
                <select
                  value={active?.month ?? ""}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="panel px-3 py-2 text-sm font-mono"
                >
                  {snapshots.map((s) => (
                    <option key={s.month} value={s.month}>
                      {new Date(s.month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                    </option>
                  ))}
                </select>
              </div>
              {active && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SnapStat label="Net income" value={formatCurrency(active.net_income, currency)} delta={prev ? pctDelta(active.net_income, prev.net_income) : null} />
                  <SnapStat label="Expenses" value={formatCurrency(active.total_expenses, currency)} delta={prev ? pctDelta(active.total_expenses, prev.total_expenses) : null} invertDelta />
                  <SnapStat label="Disposable" value={formatCurrency(active.disposable_income, currency)} delta={prev ? pctDelta(active.disposable_income, prev.disposable_income) : null} />
                  <SnapStat label="Savings rate" value={formatPercent(active.savings_rate)} delta={prev ? pctDelta(active.savings_rate, prev.savings_rate) : null} />
                </div>
              )}
              {active && (
                <div className="panel p-5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Spend by category</span>
                  <div className="mt-3 space-y-2">
                    {(Object.keys(active.expenses_by_category) as ExpenseCategory[])
                      .filter((c) => active.expenses_by_category[c] > 0)
                      .sort((a, b) => active.expenses_by_category[b] - active.expenses_by_category[a])
                      .map((c) => (
                        <button
                          key={c}
                          onClick={() => setDrillCategory(drillCategory === c ? null : c)}
                          className="w-full flex items-center gap-3 group"
                        >
                          <span className="text-xs w-28 text-left text-muted-foreground">{CATEGORY_LABELS[c]}</span>
                          <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                            <div className="h-full transition-all" style={{
                              width: `${(active.expenses_by_category[c] / active.total_expenses) * 100}%`,
                              backgroundColor: CATEGORY_COLORS[c],
                            }} />
                          </div>
                          <span className="font-mono text-xs w-24 text-right">{formatCurrency(active.expenses_by_category[c], currency)}</span>
                        </button>
                      ))}
                  </div>
                  {drillCategory && (
                    <div className="mt-5 pt-5 border-t border-border">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {CATEGORY_LABELS[drillCategory]} over time
                      </span>
                      <TrendBars
                        series={ranged.map((s) => ({ label: s.month, value: s.expenses_by_category?.[drillCategory] ?? 0 }))}
                        currency={currency}
                        color={CATEGORY_COLORS[drillCategory]}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Trends */}
            <section className="animate-enter [animation-delay:150ms] space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-xl font-bold tracking-tight">Trends</h2>
                <div className="flex gap-1 text-[10px] font-mono">
                  {([3, 6, 12] as const).map((r) => (
                    <button key={r} onClick={() => setRange(r)}
                      className={`px-3 py-1.5 rounded uppercase tracking-widest ${range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                      {r}m
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel p-5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Disposable income</span>
                <div className="flex items-end gap-2 mt-4 h-32">
                  {ranged.map((s) => {
                    const h = Math.max(2, (Math.abs(s.disposable_income) / maxDisp) * 100);
                    const negative = s.disposable_income < 0;
                    return (
                      <div key={s.month} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <div className={`w-full rounded-sm transition-all ${negative ? "bg-alert/60" : "bg-accent/70"}`} style={{ height: `${h}%` }} />
                        <span className="text-[9px] font-mono text-muted-foreground">
                          {new Date(s.month).toLocaleDateString(undefined, { month: "short" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Affordability log */}
            <section className="animate-enter [animation-delay:300ms] space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Recent affordability checks</h2>
              {checks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checks yet.</p>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {checks.map((c: any) => (
                    <div key={c.id} className="p-3 flex items-center gap-3 bg-surface/40">
                      <span className={`size-2 rounded-full ${c.verdict === "comfortable" ? "bg-accent" : c.verdict === "tight" ? "bg-caution" : "bg-alert"}`} />
                      <span className="text-sm font-medium flex-1 truncate">{c.item_name}</span>
                      <span className="font-mono text-xs">
                        {formatCurrency(Number(c.amount), c.currency_code ?? currency)}{c.is_recurring ? "/mo" : ""}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Goals overview */}
            <section className="animate-enter [animation-delay:400ms] space-y-3">
              <h2 className="text-xl font-bold tracking-tight">Goals</h2>
              {goals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No goals yet.</p>
              ) : (
                <>
                  {(() => {
                    const active = goals.filter((g: any) => !g.completed_at);
                    const done = goals.filter((g: any) => g.completed_at);
                    const totalTarget = active.reduce((s: number, g: any) => s + g.target_amount, 0);
                    const totalSaved = active.reduce((s: number, g: any) => s + g.current_amount, 0);
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <SnapStat label="Active" value={String(active.length)} delta={null} />
                          <SnapStat label="Completed" value={String(done.length)} delta={null} />
                          <SnapStat label="Saved / target"
                            value={`${formatCurrency(totalSaved, currency)} / ${formatCurrency(totalTarget, currency)}`}
                            delta={null} />
                        </div>
                        {active.length > 0 && (
                          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                            {active.map((g: any) => {
                              const pct = Math.min(100, (g.current_amount / Math.max(1, g.target_amount)) * 100);
                              return (
                                <div key={g.id} className="p-3 bg-surface/40">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium truncate">{g.name}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      {formatCurrency(g.current_amount, currency)} / {formatCurrency(g.target_amount, currency)}
                                    </span>
                                  </div>
                                  <div className="mt-2 h-1.5 bg-background rounded-full overflow-hidden">
                                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {done.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Completed</span>
                            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                              {done.map((g: any) => (
                                <div key={g.id} className="p-3 bg-surface/40 flex items-center justify-between gap-3">
                                  <span className="text-sm font-medium truncate flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-accent" />
                                    {g.name}
                                  </span>
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    {new Date(g.completed_at).toLocaleDateString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </section>
          </>

        )}
      </div>
    </div>
  );
}

function SnapStat({ label, value, delta, invertDelta }: { label: string; value: string; delta: string | null; invertDelta?: boolean }) {
  const isUp = delta?.startsWith("+");
  const good = invertDelta ? !isUp : isUp;
  const color = delta && delta !== "—" ? (good ? "text-accent" : "text-alert") : "text-muted-foreground";
  return (
    <div className="bg-surface border border-border p-4 rounded-lg">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
      <div className="text-lg font-bold mt-1">{value}</div>
      {delta && <span className={`text-[10px] font-mono ${color}`}>{delta} MoM</span>}
    </div>
  );
}

function TrendBars({ series, currency, color }: { series: { label: string; value: number }[]; currency: string; color: string }) {
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <div className="flex items-end gap-2 mt-3 h-24">
      {series.map((s) => (
        <div key={s.label} className="flex-1 flex flex-col items-center justify-end gap-1">
          <span className="font-mono text-[9px] text-muted-foreground">{formatCurrency(s.value, currency)}</span>
          <div className="w-full rounded-sm transition-all" style={{ height: `${Math.max(2, (s.value / max) * 100)}%`, backgroundColor: color, opacity: 0.7 }} />
          <span className="text-[9px] font-mono text-muted-foreground">{new Date(s.label).toLocaleDateString(undefined, { month: "short" })}</span>
        </div>
      ))}
    </div>
  );
}
