import { createFileRoute } from "@tanstack/react-router";
import { useExpenses, useProfile } from "@/hooks/use-profile";
import { computeTotals, healthLevel, HEALTH_LABEL, CATEGORY_LABELS, CATEGORY_COLORS, type ExpenseCategory } from "@/lib/finance";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — CanIAfford" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();

  const totals = computeTotals(
    Number(profile?.net_income ?? 0),
    Number(profile?.gross_income ?? 0),
    expenses,
  );
  const animatedDisposable = useCountUp(totals.disposable, 900);

  if (!profile) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;

  const level = healthLevel(totals.savingsRate);
  const currency = profile.currency_code;

  const levelStyles: Record<typeof level, string> = {
    tight: "bg-alert/10 text-alert border-alert/20",
    balanced: "bg-caution/10 text-caution border-caution/20",
    comfortable: "bg-accent/10 text-accent border-accent/20",
  };

  const cats = (Object.keys(totals.byCategory) as ExpenseCategory[])
    .filter((c) => totals.byCategory[c] > 0)
    .sort((a, b) => totals.byCategory[b] - totals.byCategory[a]);

  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Snapshot / {monthLabel}
        </span>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Savings rate</span>
          <span className="text-xs font-bold text-accent">{formatPercent(totals.savingsRate)}</span>
        </div>
      </header>

      <div className="p-6 md:p-8 grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 flex flex-col gap-8">
          <section className="animate-enter">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Available this month
            </h2>
            <div className="flex flex-wrap items-baseline gap-4">
              <h1 className="text-5xl md:text-7xl xl:text-8xl font-black tracking-tighter italic leading-none">
                {formatCurrency(animatedDisposable, currency)}
              </h1>
              <span className={`px-2 py-0.5 text-[10px] font-mono border rounded ${levelStyles[level]}`}>
                {HEALTH_LABEL[level]}
              </span>
            </div>
            <p className="mt-4 text-muted-foreground max-w-md text-sm leading-relaxed">
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
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-enter [animation-delay:100ms]">
            <Stat label="Net income" value={formatCurrency(totals.netIncome, currency)} />
            <Stat label="Total expenses" value={formatCurrency(totals.totalExpenses, currency)} />
            <Stat
              label="Monthly burn"
              value={formatPercent(totals.burnRate, 0)}
              tone={totals.burnRate > 80 ? "alert" : totals.burnRate > 60 ? "caution" : "default"}
            />
          </div>

          <section className="animate-enter [animation-delay:200ms]">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-4">
              Spending distribution
            </h3>
            <div className="bg-surface border border-border p-6 rounded-lg">
              {cats.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No expenses yet.{" "}
                  <Link to="/expenses" className="text-accent underline-offset-2 hover:underline">
                    Add some →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex h-3 w-full rounded-full overflow-hidden bg-background gap-0.5">
                    {cats.map((c) => (
                      <div
                        key={c}
                        className="h-full transition-all"
                        style={{
                          width: `${(totals.byCategory[c] / totals.totalExpenses) * 100}%`,
                          backgroundColor: CATEGORY_COLORS[c],
                        }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                    {cats.map((c) => (
                      <div key={c} className="flex flex-col">
                        <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c] }} />
                          {CATEGORY_LABELS[c]}
                        </span>
                        <span className="text-sm font-medium">
                          {formatCurrency(totals.byCategory[c], currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-6">
          <Link
            to="/checker"
            className="bg-foreground text-background rounded-xl p-8 animate-enter [animation-delay:300ms] hover:opacity-95 transition-opacity block"
          >
            <h2 className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-60 mb-6">
              Affordability Checker
            </h2>
            <p className="text-2xl font-bold tracking-tight leading-tight">
              Thinking about a purchase?
            </p>
            <p className="text-sm opacity-70 mt-2 leading-relaxed">
              Get a clear yes, maybe, or hold — with the reasoning, not just a number.
            </p>
            <div className="mt-8 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest font-bold">
              Open checker <ArrowRight className="size-3" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "caution" | "alert" }) {
  const color = tone === "alert" ? "text-alert" : tone === "caution" ? "text-caution" : "text-foreground";
  return (
    <div className="bg-surface border border-border p-5 rounded-lg">
      <span className="text-[10px] font-mono text-muted-foreground uppercase">{label}</span>
      <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
