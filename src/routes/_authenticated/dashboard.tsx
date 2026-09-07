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
import { CATEGORY_KEYS, GROUPED_CATEGORIES, isPositiveCategory } from "@/lib/categories";
import { CategoryOptions, CategoryAvatar as CatAvatar } from "@/components/category-select";
import { ForecastCard } from "@/components/forecast-card";
import { LootScoreCard } from "@/components/budge-score-card";
import { MonthlyCloseCard } from "@/components/monthly-close";
import { BriefingCard } from "@/components/briefing-card";
import { useNotificationEngine } from "@/lib/use-notification-engine";
import { getCurrency } from "@/lib/currencies";
import { LootSelect } from "@/components/ui/loot-select";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Loot" },
      { name: "description", content: "Your live monthly position: income, expenses, disposable cash and savings rate at a glance." },
      { property: "og:title", content: "Dashboard — Loot" },
      { property: "og:description", content: "Your live monthly position: income, expenses, disposable cash and savings rate at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});


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
  const householdOn = !!profile?.household_view;
  const { data: expenses = [] } = useExpenses(householdOn);
  const { data: snaps = [] } = useSnapshots();
  const qc = useQueryClient();

  // In Household view, add the partner's income to your own.
  const { data: partnerIncome } = useQuery({
    queryKey: ["household_income", householdOn],
    enabled: householdOn,
    queryFn: async () => {
      const zero = { net: 0, gross: 0 };
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return zero;
      const { data: members } = await supabase.from("household_members").select("household_id, user_id");
      const mine = (members ?? []).find((m: any) => m.user_id === u.user!.id);
      if (!mine) return zero;
      const partnerIds = (members ?? [])
        .filter((m: any) => m.household_id === mine.household_id && m.user_id !== u.user!.id)
        .map((m: any) => m.user_id);
      if (partnerIds.length === 0) return zero;
      const { data } = await supabase
        .from("profiles")
        .select("id, net_income, gross_income")
        .in("id", partnerIds);
      return (data ?? []).reduce(
        (acc: { net: number; gross: number }, p: any) => ({
          net: acc.net + Number(p.net_income ?? 0),
          gross: acc.gross + Number(p.gross_income ?? 0),
        }),
        zero,
      );
    },
  });

  const [qName, setQName] = useState("");
  const [qAmount, setQAmount] = useState("");
  const [qCategory, setQCategory] = useState<ExpenseCategory>("other");
  const [qFrequency, setQFrequency] = useState<ExpenseFrequency>("monthly");
  const [saving, setSaving] = useState(false);

  const totals = computeTotals(
    Number(profile?.net_income ?? 0) + (householdOn ? partnerIncome?.net ?? 0 : 0),
    Number(profile?.gross_income ?? 0) + (householdOn ? partnerIncome?.gross ?? 0 : 0),
    expenses,
  );
  const animatedDisposable = useCountUp(totals.disposable, 900);
  useNotificationEngine({ totals, expenses, snaps, currency: profile?.currency_code ?? "ZAR" });

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
  const spendCats = cats.filter((c) => !isPositiveCategory(c));
  const saveCats = cats.filter((c) => isPositiveCategory(c));
  const savingTotal = saveCats.reduce((s, c) => s + totals.byCategory[c], 0);
  const now = new Date();
  const monthLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });

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
      <div className="grid grid-cols-1 gap-5 p-4 md:p-8 xl:grid-cols-12">
        {/* ---------- Loot overview ---------- */}
        <section className="animate-enter xl:col-span-8">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-background">Overview</h2>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase ${levelStyles[level]}`}>{HEALTH_LABEL[level]}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <OverviewCard
              label="Available loot"
              description="What you have left after your expenses"
              value={formatCurrency(animatedDisposable, currency)}
              delta={deltaDisposable}
              values={spark ?? [0, totals.disposable]}
              accent="lime"
              to="/stats"
            />
            <OverviewCard
              label="Loot going out"
              description="Your total monthly expenses"
              value={formatCurrency(totals.totalExpenses, currency)}
              delta={deltaExpenses}
              values={[...snaps].reverse().map((s) => s.total_expenses).concat(totals.totalExpenses)}
              accent="violet"
              to="/expenses"
            />
            <OverviewCard
              label="Loot coming in"
              description="Your total net income"
              value={formatCurrency(totals.netIncome, currency)}
              delta={deltaIncome}
              values={[...snaps].reverse().map((s) => s.net_income).concat(totals.netIncome)}
              accent="blue"
              to="/settings"
            />
          </div>
        </section>

        {/* ---------- Side column ---------- */}
        <div className="animate-enter flex flex-col gap-5 [animation-delay:80ms] xl:col-span-4">
          <Link to="/checker" className="panel-raised panel-hover group relative overflow-hidden border-b-4 border-b-secondary p-5">
            <span className="label-xs">Affordability checker</span>
            <p className="font-display mt-3 text-xl font-bold leading-tight">
              Thinking about a purchase?
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              A clear yes, maybe, or hold — with the reasoning, not just a number.
            </p>
            <span className="mt-4 flex items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-bold text-background">
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
                    <CatAvatar category={e.category} />
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
              <LootSelect value={qCategory} onValueChange={(v) => setQCategory(v as ExpenseCategory)} ariaLabel="Expense category" groups={GROUPED_CATEGORIES.map((g) => ({ label: g.group, options: g.items.map((i) => ({ value: i.key, label: i.label })) }))} />
              <LootSelect value={qFrequency} onValueChange={(v) => setQFrequency(v as ExpenseFrequency)} ariaLabel="Expense frequency" options={[{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }, { value: "yearly", label: "Yearly" }, { value: "one_off", label: "One-off" }]} />
            </div>
            <button type="submit" disabled={saving} className="btn-accent w-full">
              <Plus className="size-3.5" /> {saving ? "Saving…" : "Add expense"}
            </button>
          </form>
        </div>

        {/* ---------- Predictive forecast ---------- */}
        <div className="animate-enter flex flex-col gap-5 [animation-delay:170ms] xl:col-span-12">
          <LootScoreCard
            currency={currency}
            grossIncome={totals.grossIncome}
            netIncome={totals.netIncome}
            savingsRate={totals.savingsRate}
            disposable={totals.disposable}
            expenses={expenses}
          />

          <ForecastCard />
          <MonthlyCloseCard currency={profile.currency_code} />
          <BriefingCard />
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
              description="Add a few recurring costs and Loot starts showing your real monthly position, health and savings rate."
              steps={[
                "Set your take-home income in Settings",
                "Add your fixed costs — rent, transport, insurance",
                "Run an affordability check before you buy",
              ]}
              examples={[
                { label: "Rent · 8,500 /mo", hint: "Fills the quick-add form", onClick: () => prefill("Rent", "8500", "housing") },
                { label: "Groceries · 3,200 /mo", onClick: () => prefill("Groceries", "3200", "groceries") },
                { label: "Car finance · 4,100 /mo", onClick: () => prefill("Car finance", "4100", "vehicle_finance") },
                { label: "Streaming · 199 /mo", onClick: () => prefill("Streaming", "199", "subscriptions") },
              ]}
              action={{ label: "Open expenses", to: "/expenses" }}
              secondary="Examples fill the quick-add form on the right — edit anything before saving."
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-8 md:flex-row md:items-center">
                <Donut
                  segments={[...spendCats, ...saveCats].map((c) => ({ value: totals.byCategory[c], color: CATEGORY_COLORS[c] }))}
                  centerLabel="Committed"
                  centerValue={formatCurrency(totals.totalExpenses, currency)}
                />
                <div className="w-full flex-1 space-y-4">
                  {/* Distribution bar — spending on the left, saving & growing in green at the right */}
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                      {spendCats.map((c) => (
                        <span
                          key={c}
                          title={`${CATEGORY_LABELS[c]} · ${formatCurrency(totals.byCategory[c], currency)}`}
                          style={{ width: `${(totals.byCategory[c] / totals.totalExpenses) * 100}%`, backgroundColor: CATEGORY_COLORS[c] }}
                        />
                      ))}
                    </div>
                    {saveCats.length > 0 && (
                      <div
                        className="flex h-2.5 overflow-hidden rounded-full ring-1 ring-accent/40"
                        style={{ width: `${Math.max(6, (savingTotal / totals.totalExpenses) * 100)}%` }}
                      >
                        {saveCats.map((c) => (
                          <span
                            key={c}
                            title={`${CATEGORY_LABELS[c]} · ${formatCurrency(totals.byCategory[c], currency)}`}
                            style={{ width: `${(totals.byCategory[c] / savingTotal) * 100}%`, backgroundColor: CATEGORY_COLORS[c] }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {GROUPED_CATEGORIES.filter((g) => g.items.some((i) => cats.includes(i.key as ExpenseCategory))).map((g) => {
                    const rows = g.items.filter((i) => cats.includes(i.key as ExpenseCategory));
                    const positive = g.group === "Saving & Growing";
                    return (
                      <div
                        key={g.group}
                        className={positive ? "rounded-xl border border-accent/25 bg-accent/[0.06] p-3" : ""}
                      >
                        <p className={`label-xs mb-1 ${positive ? "text-accent" : ""}`}>{g.group}</p>
                        <div className="divide-y divide-[var(--hairline)]">
                          {rows.map((i) => {
                            const c = i.key as ExpenseCategory;
                            const share = (totals.byCategory[c] / totals.totalExpenses) * 100;
                            return (
                              <div key={c} className="flex items-center gap-3 py-2">
                                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c] }} />
                                <span className={`flex-1 truncate text-[13px] font-medium ${positive ? "text-accent" : ""}`}>{CATEGORY_LABELS[c]}</span>
                                <span className="numeric w-10 text-right font-mono text-[11px] text-muted-foreground">{share.toFixed(0)}%</span>
                                <span className="numeric w-28 text-right text-[13px] font-semibold">
                                  {formatCurrency(totals.byCategory[c], currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                  <CatAvatar category={e.category} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                      {e.name}
                      {e.original_currency && e.original_currency !== currency && (
                        <span
                          title={`Originally ${formatCurrency(e.original_amount ?? 0, e.original_currency)}`}
                          className="font-mono text-[10px] text-muted-foreground"
                        >
                          {getCurrency(e.original_currency).flag}
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {CATEGORY_LABELS[e.category]} · {e.is_fixed ? "Fixed" : "Variable"}
                      {householdOn && (e.user_id === profile.id ? " · You" : " · Partner")}
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

function OverviewCard({ label, description, value, delta, values, accent, to }: { label: string; description: string; value: string; delta: number | null; values: number[]; accent: "lime" | "violet" | "blue"; to: "/stats" | "/expenses" | "/settings" }) {
  return (
    <article className={`loot-overview-card loot-overview-${accent}`}>
      <div className="relative z-[1]">
        <p className="text-lg font-bold">{label}</p>
        <p className="mt-1 min-h-8 text-xs leading-tight text-muted-foreground">{description}</p>
        <p className="numeric mt-3 text-[clamp(1.55rem,3vw,2.25rem)] font-bold leading-none">{value}</p>
        <div className="mt-2 flex items-center gap-2"><DeltaChip value={delta} /></div>
      </div>
      <Sparkline values={values.length > 1 ? values : [0, values[0] ?? 0]} className="relative z-[1] mt-auto h-16" />
      <Link to={to} className="relative z-[1] ml-auto mt-2 rounded-full bg-foreground/10 px-3 py-1.5 text-[10px] font-bold transition hover:bg-primary hover:text-primary-foreground">View</Link>
    </article>
  );
}

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
