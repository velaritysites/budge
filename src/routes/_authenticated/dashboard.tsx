import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useExpenses, useProfile } from "@/hooks/use-profile";
import {
  computeTotals,
  healthLevel,
  HEALTH_LABEL,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  monthlyEquivalent,
  type Expense,
  type ExpenseCategory,
  type ExpenseFrequency,
} from "@/lib/finance";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Plus,
  Shield,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { upsertCurrentMonthSnapshot } from "@/lib/snapshot";
import { toast } from "sonner";
import { DashboardSkeleton, EmptyState } from "@/components/ui/states";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Budge" },
      { name: "description", content: "Your live monthly position: income, expenses, disposable cash and savings rate at a glance." },
      { property: "og:title", content: "Dashboard — Budge" },
      { property: "og:description", content: "Your live monthly position: income, expenses, disposable cash and savings rate at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const CATEGORIES: ExpenseCategory[] = [
  "housing_rent", "transport_fuel", "vehicle_finance", "insurance",
  "medical_insurance", "groceries", "debt", "subscriptions", "food", "other",
];

type Snap = { month: string; disposable_income: number; total_expenses: number; savings_rate: number; net_income: number };

function useSnapshots() {
  return useQuery({
    queryKey: ["snapshots", "dashboard"],
    queryFn: async (): Promise<Snap[]> => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select("month, disposable_income, total_expenses, savings_rate, net_income")
        .order("month", { ascending: false })
        .limit(7);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        month: r.month,
        disposable_income: Number(r.disposable_income),
        total_expenses: Number(r.total_expenses),
        savings_rate: Number(r.savings_rate),
        net_income: Number(r.net_income),
      }));
    },
  });
}

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const { data: snaps = [] } = useSnapshots();
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

  function prefill(name: string, amount: string, category: ExpenseCategory) {
    setQName(name);
    setQAmount(amount);
    setQCategory(category);
    setQFrequency("monthly");
  }

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

  if (!profile) return <DashboardSkeleton />;

  const level = healthLevel(totals.savingsRate);
  const currency = profile.currency_code;
  const levelStyles: Record<typeof level, string> = {
    tight: "bg-alert/10 text-alert border-alert/30",
    balanced: "bg-caution/10 text-caution border-caution/30",
    comfortable: "bg-accent/12 text-accent border-accent/30",
  };
  const cats = (Object.keys(totals.byCategory) as ExpenseCategory[])
    .filter((c) => totals.byCategory[c] > 0)
    .sort((a, b) => totals.byCategory[b] - totals.byCategory[a]);
  const now = new Date();
  const monthLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const firstName = (profile.display_name ?? "").trim().split(" ")[0] || "there";

  // Month-on-month deltas (previous stored snapshot vs live position)
  const prev = snaps.find((s) => s.month !== monthKey(now));
  const deltaDisposable = pctDelta(totals.disposable, prev?.disposable_income);
  const deltaExpenses = pctDelta(totals.totalExpenses, prev?.total_expenses);
  const deltaIncome = pctDelta(totals.netIncome, prev?.net_income);

  const trend = [...snaps].reverse().map((s) => s.disposable_income);
  const spark = trend.length >= 2 ? trend : null;

  // Upcoming debit orders this month
  const today = now.getDate();
  const upcoming = expenses
    .filter((e) => e.due_day && e.frequency !== "one_off")
    .map((e) => ({ e, day: e.due_day as number, away: ((e.due_day as number) - today + 31) % 31 }))
    .sort((a, b) => a.away - b.away)
    .slice(0, 4);

  const recent = expenses.slice(0, 5);

  return (
    <div className="page-enter flex min-h-screen flex-col">
      {/* Account bar */}
      <header className="sticky top-0 z-20 flex h-[4.5rem] items-center justify-between gap-4 border-b border-hairline bg-background/60 px-5 backdrop-blur-2xl md:px-8">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight">
            {greeting}, {firstName}
          </p>
          <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-accent live-dot" />
            Live position · {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden items-center gap-6 border-r border-hairline pr-5 sm:flex">
            <MiniMetric label="Savings rate" value={formatPercent(totals.savingsRate)} accent />
            <MiniMetric label="Burn" value={formatPercent(totals.burnRate, 0)} />
          </div>
          <Link to="/checker" className="btn-ghost hidden md:inline-flex">
            <Shield className="size-3.5" /> Run a check
          </Link>
          <Link to="/expenses" className="btn-accent">
            <Plus className="size-3.5" /> <span className="hidden sm:inline">Add expense</span>
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 p-5 md:p-8 xl:grid-cols-12">
        {/* ---------- Primary account card ---------- */}
        <section className="animate-enter bank-card card-engrave p-7 md:p-9 xl:col-span-8">
          <div className="relative z-[1] flex items-start justify-between gap-6">
            <div>
              <span className="label-xs">Available to spend</span>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                Budge current account · {currency}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <span className="chip-metal" aria-hidden />
              <span className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${levelStyles[level]}`}>
                {HEALTH_LABEL[level]}
              </span>
            </div>
          </div>

          <h1 className="numeric font-display relative z-[1] mt-6 text-[clamp(2.7rem,7vw,4.6rem)] font-extrabold leading-[0.9] tracking-[-0.055em]">
            {formatCurrency(animatedDisposable, currency)}
          </h1>

          <div className="relative z-[1] mt-3 flex flex-wrap items-center gap-2">
            <DeltaChip value={deltaDisposable} />
            <span className="text-[11px] text-muted-foreground">vs last month</span>
          </div>

          {/* In / out ledger strip */}
          <div className="relative z-[1] mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FlowCell label="Money in" value={formatCurrency(totals.netIncome, currency)} dir="in" />
            <FlowCell label="Money out" value={formatCurrency(totals.totalExpenses, currency)} dir="out" />
            <div className="rounded-xl border border-[var(--hairline)] bg-[color-mix(in_oklab,var(--surface-3)_35%,transparent)] p-3">
              <p className="label-xs">Burn rate</p>
              <p className="numeric font-display mt-1.5 text-base font-bold">{formatPercent(totals.burnRate, 0)}</p>
            </div>
            <div className="rounded-xl border border-[var(--hairline)] bg-[color-mix(in_oklab,var(--surface-3)_35%,transparent)] p-3">
              <p className="label-xs">Savings rate</p>
              <p className="numeric font-display mt-1.5 text-base font-bold text-accent">{formatPercent(totals.savingsRate)}</p>
            </div>
          </div>

          {/* Allocation rail */}
          <div className="relative z-[1] mt-7 space-y-2">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>Income allocated</span>
              <span className="numeric">{formatPercent(Math.min(totals.burnRate, 100), 0)} spent</span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--surface-3)_70%,transparent)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${Math.min(Math.max(totals.burnRate, 0), 100)}%` }}
              />
            </div>
            <p className="pt-1 text-[13px] leading-relaxed text-muted-foreground">
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
          </div>

          {spark && (
            <div className="relative z-[1] mt-7 border-t border-[var(--hairline)] pt-5">
              <div className="flex items-center justify-between">
                <span className="label-xs">Left over · last {spark.length} months</span>
                <Link to="/stats" className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  Stats →
                </Link>
              </div>
              <Sparkline values={spark} className="mt-3" />
            </div>
          )}
        </section>

        {/* ---------- Side column ---------- */}
        <div className="animate-enter flex flex-col gap-5 [animation-delay:80ms] xl:col-span-4">
          <Link to="/checker" className="panel-raised panel-hover group relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -bottom-16 -left-10 size-52 rounded-full bg-accent/12 blur-3xl transition-opacity duration-500 group-hover:opacity-160" />
            <span className="label-xs">Affordability checker</span>
            <p className="font-display mt-4 text-xl font-bold leading-tight tracking-tight">
              Thinking about a purchase?
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              A clear yes, maybe, or hold — with the reasoning, not just a number.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
              Open checker
              <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </Link>

          {/* Upcoming debit orders */}
          <section className="panel p-6">
            <div className="flex items-center justify-between">
              <h3 className="label-xs">Upcoming debits</h3>
              <CalendarClock className="size-3.5 text-muted-foreground" />
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                Add billing dates to your expenses and they'll queue up here like a statement.
              </p>
            ) : (
              <div className="mt-3 -mx-2">
                {upcoming.map(({ e, day, away }) => (
                  <div key={e.id} className="ledger-row">
                    <CategoryAvatar category={e.category} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{e.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {away === 0 ? "Today" : `In ${away} day${away === 1 ? "" : "s"}`} · {ordinal(day)}
                      </p>
                    </div>
                    <span className="numeric text-[13px] font-semibold">
                      {formatCurrency(monthlyEquivalent(e), currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quick add */}
          <form onSubmit={quickAdd} className="panel space-y-3 p-6">
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
          </form>
        </div>

        {/* ---------- Account tiles ---------- */}
        <div className="animate-enter grid grid-cols-1 gap-5 [animation-delay:140ms] md:grid-cols-3 xl:col-span-12">
          <Stat label="Net income" caption="Take-home, all streams" value={formatCurrency(totals.netIncome, currency)} delta={deltaIncome} />
          <Stat label="Total expenses" caption="Monthly equivalent" value={formatCurrency(totals.totalExpenses, currency)} delta={deltaExpenses} invert />
          <Stat
            label="Monthly burn"
            caption="Share of income committed"
            value={formatPercent(totals.burnRate, 0)}
            tone={totals.burnRate > 80 ? "alert" : totals.burnRate > 60 ? "caution" : "default"}
          />
        </div>

        {/* ---------- Distribution ---------- */}
        <section className="animate-enter panel p-7 [animation-delay:200ms] xl:col-span-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold tracking-tight">Where it goes</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">Monthly commitments by category</p>
            </div>
            <span className="pill">{cats.length} {cats.length === 1 ? "category" : "categories"}</span>
          </div>

          {cats.length === 0 ? (
            <EmptyState
              className="border-0 px-0 py-4"
              icon={<Sparkles className="size-6" />}
              title="Nothing tracked yet"
              description="Add a few recurring costs and Budge starts showing your real monthly position, health and savings rate."
              steps={[
                "Set your take-home income in Settings",
                "Add your fixed costs — rent, transport, insurance",
                "Run an affordability check before you buy",
              ]}
              examples={[
                { label: "Rent · 8,500 /mo", hint: "Fills the quick-add form", onClick: () => prefill("Rent", "8500", "housing_rent") },
                { label: "Groceries · 3,200 /mo", onClick: () => prefill("Groceries", "3200", "groceries") },
                { label: "Car finance · 4,100 /mo", onClick: () => prefill("Car finance", "4100", "vehicle_finance") },
                { label: "Streaming · 199 /mo", onClick: () => prefill("Streaming", "199", "subscriptions") },
              ]}
              action={{ label: "Open expenses", to: "/expenses" }}
              secondary="Examples fill the quick-add form on the right — edit anything before saving."
            />
          ) : (
            <div className="flex flex-col items-center gap-8 md:flex-row md:items-center">
              <Donut
                segments={cats.map((c) => ({ value: totals.byCategory[c], color: CATEGORY_COLORS[c] }))}
                centerLabel="Committed"
                centerValue={formatCurrency(totals.totalExpenses, currency)}
              />
              <div className="w-full flex-1 divide-y divide-[var(--hairline)]">
                {cats.slice(0, 6).map((c) => {
                  const share = (totals.byCategory[c] / totals.totalExpenses) * 100;
                  return (
                    <div key={c} className="flex items-center gap-3 py-2.5">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c] }} />
                      <span className="flex-1 truncate text-[13px] font-medium">{CATEGORY_LABELS[c]}</span>
                      <span className="numeric w-10 text-right font-mono text-[11px] text-muted-foreground">{share.toFixed(0)}%</span>
                      <span className="numeric w-28 text-right text-[13px] font-semibold">
                        {formatCurrency(totals.byCategory[c], currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* ---------- Recent activity ---------- */}
        <section className="animate-enter panel p-7 [animation-delay:260ms] xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold tracking-tight">Recent activity</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">Latest commitments added</p>
            </div>
            <Link to="/expenses" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-accent">
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Nothing here yet — add your first expense.</p>
          ) : (
            <div className="-mx-2">
              {recent.map((e) => (
                <div key={e.id} className="ledger-row">
                  <CategoryAvatar category={e.category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{e.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {CATEGORY_LABELS[e.category]} · {e.is_fixed ? "Fixed" : "Variable"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="numeric text-[13px] font-semibold">−{formatCurrency(e.amount, currency)}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{freqLabel(e)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function pctDelta(current: number, previous?: number): number | null {
  if (previous === undefined || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function freqLabel(e: Expense) {
  return e.frequency === "one_off" ? "One-off" : e.frequency === "monthly" ? "Monthly" : e.frequency === "weekly" ? "Weekly" : "Yearly";
}

function MiniMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={`numeric text-[13px] font-semibold ${accent ? "text-accent" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function DeltaChip({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || !isFinite(value)) {
    return <span className="delta-chip bg-[color-mix(in_oklab,var(--surface-3)_60%,transparent)] text-muted-foreground">NEW</span>;
  }
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta-chip ${good ? "delta-up" : "delta-down"}`}>
      <Icon className="size-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function FlowCell({ label, value, dir }: { label: string; value: string; dir: "in" | "out" }) {
  const Icon = dir === "in" ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[color-mix(in_oklab,var(--surface-3)_35%,transparent)] p-3">
      <p className="label-xs flex items-center gap-1.5">
        <Icon className={`size-3 ${dir === "in" ? "text-accent" : "text-caution"}`} />
        {label}
      </p>
      <p className="numeric font-display mt-1.5 text-base font-bold">{value}</p>
    </div>
  );
}

function Stat({
  label, caption, value, tone = "default", delta, invert = false,
}: {
  label: string; caption: string; value: string; tone?: "default" | "caution" | "alert"; delta?: number | null; invert?: boolean;
}) {
  const color = tone === "alert" ? "text-alert" : tone === "caution" ? "text-caution" : "text-foreground";
  return (
    <div className="tile p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="label-xs">{label}</p>
        {delta !== undefined && <DeltaChip value={delta ?? null} invert={invert} />}
      </div>
      <div className={`numeric font-display mt-4 text-[1.65rem] font-bold tracking-tight ${color}`}>{value}</div>
      <p className="mt-1.5 text-[12px] text-muted-foreground">{caption}</p>
    </div>
  );
}

function CategoryAvatar({ category }: { category: ExpenseCategory }) {
  const color = CATEGORY_COLORS[category];
  const initials = CATEGORY_LABELS[category].replace(/[^A-Za-z/ ]/g, "").split(/[\s/]+/).slice(0, 2).map((w) => w[0]).join("");
  return (
    <span
      className="avatar-cat"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color, borderColor: `color-mix(in oklab, ${color} 30%, transparent)` }}
    >
      {initials}
    </span>
  );
}

function Donut({ segments, centerLabel, centerValue }: { segments: { value: number; color: string }[]; centerLabel: string; centerValue: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 62;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative size-[172px] shrink-0">
      <svg viewBox="0 0 160 160" className="size-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="color-mix(in oklab, var(--surface-3) 70%, transparent)" strokeWidth="16" />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx="80" cy="80" r={r} fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeLinecap="butt"
              strokeDasharray={`${Math.max(len - 2, 0)} ${c}`}
              strokeDashoffset={-offset}
              className="transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="label-xs">{centerLabel}</span>
        <span className="numeric font-display mt-1.5 text-[15px] font-bold">{centerValue}</span>
      </div>
    </div>
  );
}

function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  const w = 600, h = 56;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - ((v - min) / span) * (h - 8) - 4,
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`h-14 w-full ${className}`}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill="var(--accent)" />
    </svg>
  );
}
