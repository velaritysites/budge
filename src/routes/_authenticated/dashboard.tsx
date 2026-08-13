import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useExpenses, useProfile } from "@/hooks/use-profile";
import { computeTotals, healthLevel, HEALTH_LABEL, CATEGORY_LABELS, CATEGORY_COLORS, type ExpenseCategory, type ExpenseFrequency } from "@/lib/finance";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { upsertCurrentMonthSnapshot } from "@/lib/snapshot";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Budge" },
      { name: "description", content: "Your live monthly position: income, expenses, disposable cash and savings rate at a glance." },
      { property: "og:title", content: "Dashboard — Budge" },
      { property: "og:description", content: "Your live monthly position: income, expenses, disposable cash and savings rate at a glance." },
    ],
  }),
  component: Dashboard,
});

const CATEGORIES: ExpenseCategory[] = [
  "housing_rent", "transport_fuel", "vehicle_finance", "insurance",
  "medical_insurance", "groceries", "debt", "subscriptions", "food", "other",
];

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();

  const [qName, setQName] = useState("");
  const [qAmount, setQAmount] = useState("");
  const [qCategory, setQCategory] = useState<ExpenseCategory>("other");
  const [qFrequency, setQFrequency] = useState<ExpenseFrequency>("monthly");
  const [saving, setSaving] = useState(false);

  const totals = computeTotals(
    Number(profile?.net_income ?? 0),
    Number(profile?.gross_income ?? 0),
    expenses,
  );
  const animatedDisposable = useCountUp(totals.disposable, 900);

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!qName || !qAmount || !profile) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setSaving(false);
    const { error } = await supabase.from("expenses").insert({
      user_id: u.user.id, name: qName, amount: parseFloat(qAmount),
      category: qCategory, frequency: qFrequency, is_fixed: true,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    setQName(""); setQAmount("");
    await qc.invalidateQueries({ queryKey: ["expenses"] });
    await upsertCurrentMonthSnapshot({
      netIncome: Number(profile.net_income), grossIncome: Number(profile.gross_income),
      expenses, currencyCode: profile.currency_code,
    });
    toast.success("Added");
    setSaving(false);
  }

  if (!profile) {
    return (
      <div className="p-8">
        <div className="panel shimmer h-40 w-full" />
      </div>
    );
  }

  const level = healthLevel(totals.savingsRate);
  const currency = profile.currency_code;
  const levelStyles: Record<typeof level, string> = {
    tight: "bg-alert/10 text-alert border-alert/25",
    balanced: "bg-caution/10 text-caution border-caution/25",
    comfortable: "bg-accent/10 text-accent border-accent/25",
  };
  const cats = (Object.keys(totals.byCategory) as ExpenseCategory[])
    .filter((c) => totals.byCategory[c] > 0)
    .sort((a, b) => totals.byCategory[b] - totals.byCategory[a]);
  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const topCat = cats[0];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-hairline bg-background/70 px-6 backdrop-blur-xl md:px-8">
        <div className="flex items-center gap-3">
          <span className="size-1.5 rounded-full bg-accent live-dot" />
          <span className="label-xs">Snapshot / {monthLabel}</span>
        </div>
        <div className="flex items-center gap-6">
          <MiniMetric label="Savings rate" value={formatPercent(totals.savingsRate)} accent />
          <MiniMetric label="Burn" value={formatPercent(totals.burnRate, 0)} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 p-5 md:p-8 xl:grid-cols-12">
        {/* Hero */}
        <section className="animate-enter panel-raised relative overflow-hidden p-7 md:p-9 xl:col-span-8">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="label-xs">Available this month</span>
              <h1 className="numeric font-display mt-3 text-[clamp(2.6rem,7vw,5rem)] font-extrabold leading-[0.92] tracking-[-0.045em]">
                {formatCurrency(animatedDisposable, currency)}
              </h1>
            </div>
            <span className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${levelStyles[level]}`}>
              {HEALTH_LABEL[level]}
            </span>
          </div>

          <p className="relative mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            {totals.netIncome === 0
              ? "Add your income and expenses to see your real position."
              : totals.disposable < 0
              ? "Your expenses currently exceed your income. Trim a category to get back to neutral."
              : level === "comfortable"
              ? "You've cleared your monthly outgoings with room to spare. Quietly excellent."
              : level === "balanced"
              ? "You're running a steady ship. Some room to save, some room to live."
              : "Things are tight this month. Worth a look at your fixed costs."}
          </p>

          {/* Income vs expenses rail */}
          <div className="relative mt-8 space-y-2">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>Income allocated</span>
              <span className="numeric">{formatPercent(Math.min(totals.burnRate, 100), 0)} spent</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${Math.min(Math.max(totals.burnRate, 0), 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Checker CTA */}
        <Link
          to="/checker"
          className="animate-enter panel-raised panel-hover group relative overflow-hidden p-7 [animation-delay:80ms] xl:col-span-4"
        >
          <div className="pointer-events-none absolute -bottom-16 -left-10 size-52 rounded-full bg-accent/12 blur-3xl transition-opacity duration-500 group-hover:opacity-160" />
          <span className="label-xs">Affordability checker</span>
          <p className="font-display mt-5 text-2xl font-bold leading-tight tracking-tight">
            Thinking about<br />a purchase?
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A clear yes, maybe, or hold — with the reasoning, not just a number.
          </p>
          <span className="mt-7 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
            Open checker
            <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </Link>

        {/* Stats row */}
        <div className="animate-enter grid grid-cols-1 gap-5 [animation-delay:140ms] md:grid-cols-3 xl:col-span-8">
          <Stat label="Net income" value={formatCurrency(totals.netIncome, currency)} icon={<Wallet className="size-3.5" />} />
          <Stat label="Total expenses" value={formatCurrency(totals.totalExpenses, currency)} icon={<TrendingDown className="size-3.5" />} />
          <Stat
            label="Monthly burn"
            value={formatPercent(totals.burnRate, 0)}
            icon={<TrendingUp className="size-3.5" />}
            tone={totals.burnRate > 80 ? "alert" : totals.burnRate > 60 ? "caution" : "default"}
          />
        </div>

        {/* Quick add */}
        <form onSubmit={quickAdd} className="animate-enter panel space-y-3 p-5 [animation-delay:200ms] xl:col-span-4 xl:row-span-2">
          <div className="flex items-center justify-between">
            <h3 className="label-xs">Quick-add expense</h3>
            <Link to="/expenses" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-accent">
              Full page →
            </Link>
          </div>
          <input value={qName} onChange={(e) => setQName(e.target.value)} placeholder="Name" className="field" />
          <input value={qAmount} onChange={(e) => setQAmount(e.target.value)} type="number" step="0.01" placeholder="Amount" className="field numeric" />
          <div className="grid grid-cols-2 gap-2">
            <select value={qCategory} onChange={(e) => setQCategory(e.target.value as ExpenseCategory)} className="field !py-2 !text-xs">
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            <select value={qFrequency} onChange={(e) => setQFrequency(e.target.value as ExpenseFrequency)} className="field !py-2 !text-xs">
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="yearly">Yearly</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
          <button type="submit" disabled={saving} className="btn-accent w-full">
            <Plus className="size-3.5" /> {saving ? "Saving…" : "Add expense"}
          </button>

          {topCat && (
            <div className="mt-4 border-t border-hairline pt-4">
              <span className="label-xs">Largest category</span>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[topCat] }} />
                  {CATEGORY_LABELS[topCat]}
                </span>
                <span className="numeric text-sm font-semibold">{formatCurrency(totals.byCategory[topCat], currency)}</span>
              </div>
            </div>
          )}
        </form>

        {/* Distribution */}
        <section className="animate-enter panel p-6 [animation-delay:260ms] xl:col-span-8">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="label-xs">Spending distribution</h3>
            <span className="numeric font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {cats.length} {cats.length === 1 ? "category" : "categories"}
            </span>
          </div>

          {cats.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No expenses yet.{" "}
              <Link to="/expenses" className="text-accent underline-offset-4 hover:underline">Add some →</Link>
            </div>
          ) : (
            <>
              <div className="flex h-3.5 w-full gap-1 overflow-hidden rounded-full bg-surface-3 p-0.5">
                {cats.map((c) => (
                  <div
                    key={c}
                    className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{ width: `${(totals.byCategory[c] / totals.totalExpenses) * 100}%`, backgroundColor: CATEGORY_COLORS[c] }}
                  />
                ))}
              </div>

              <div className="mt-6 divide-y divide-[var(--hairline)]">
                {cats.map((c) => {
                  const share = (totals.byCategory[c] / totals.totalExpenses) * 100;
                  return (
                    <div key={c} className="flex items-center gap-4 py-2.5">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c] }} />
                      <span className="flex-1 truncate text-[13px] font-medium">{CATEGORY_LABELS[c]}</span>
                      <span className="numeric hidden w-12 text-right font-mono text-[11px] text-muted-foreground sm:block">
                        {share.toFixed(0)}%
                      </span>
                      <div className="hidden h-1 w-28 overflow-hidden rounded-full bg-surface-3 md:block">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: CATEGORY_COLORS[c] }} />
                      </div>
                      <span className="numeric w-28 text-right text-[13px] font-semibold">
                        {formatCurrency(totals.byCategory[c], currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={`numeric text-[13px] font-semibold ${accent ? "text-accent" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, tone = "default", icon }: { label: string; value: string; tone?: "default" | "caution" | "alert"; icon?: React.ReactNode }) {
  const color = tone === "alert" ? "text-alert" : tone === "caution" ? "text-caution" : "text-foreground";
  return (
    <div className="panel panel-hover p-5">
      <div className="flex items-center justify-between">
        <span className="label-xs">{label}</span>
        <span className="text-muted-foreground/70">{icon}</span>
      </div>
      <div className={`numeric font-display mt-3 text-2xl font-bold tracking-tight ${color}`}>{value}</div>
    </div>
  );
}
