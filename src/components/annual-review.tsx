import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { categoryColor, categoryLabel, normalizeCategory } from "@/lib/categories";
import { FileDown, Share2, Trophy, TrendingDown, TrendingUp } from "lucide-react";
import { estimatePaye } from "@/lib/tax";
import { toast } from "sonner";

type Snap = {
  month: string;
  net_income: number;
  total_expenses: number;
  disposable_income: number;
  savings_rate: number;
  expenses_by_category: Record<string, number> | null;
  net_worth: number | null;
  liabilities_total: number | null;
};

function monthName(m: string) {
  return new Date(m).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function AnnualReview({ currency }: { currency: string }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(new Date().getMonth() === 0 ? thisYear - 1 : thisYear);
  const shareRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: all = [] } = useQuery({
    queryKey: ["snapshots", "annual"],
    queryFn: async (): Promise<Snap[]> => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select("month, net_income, total_expenses, disposable_income, savings_rate, expenses_by_category, net_worth, liabilities_total")
        .order("month", { ascending: true })
        .limit(60);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        month: r.month,
        net_income: Number(r.net_income),
        total_expenses: Number(r.total_expenses),
        disposable_income: Number(r.disposable_income),
        savings_rate: Number(r.savings_rate),
        expenses_by_category: r.expenses_by_category ?? {},
        net_worth: r.net_worth === null || r.net_worth === undefined ? null : Number(r.net_worth),
        liabilities_total: r.liabilities_total === null || r.liabilities_total === undefined ? null : Number(r.liabilities_total),
      }));
    },
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", "annual"],
    queryFn: async () => {
      const { data } = await supabase.from("savings_goals").select("name, completed_at, target_amount, current_amount");
      return data ?? [];
    },
  });

  const { data: scores = [] } = useQuery({
    queryKey: ["budge_scores", "annual"],
    queryFn: async () => {
      const { data } = await supabase.from("budge_scores").select("month, score").order("month", { ascending: true });
      return data ?? [];
    },
  });

  const years = useMemo(
    () => Array.from(new Set(all.map((s) => new Date(s.month).getFullYear()))).sort((a, b) => b - a),
    [all],
  );

  const review = useMemo(() => {
    const inYear = all.filter((s) => new Date(s.month).getFullYear() === year);
    if (inYear.length === 0) return null;
    const prev = all.filter((s) => new Date(s.month).getFullYear() === year - 1);

    const totals: Record<string, number> = {};
    for (const s of inYear)
      for (const [k, v] of Object.entries(s.expenses_by_category ?? {}))
        totals[normalizeCategory(k)] = (totals[normalizeCategory(k)] ?? 0) + Number(v || 0);

    const prevTotals: Record<string, number> = {};
    for (const s of prev)
      for (const [k, v] of Object.entries(s.expenses_by_category ?? {}))
        prevTotals[normalizeCategory(k)] = (prevTotals[normalizeCategory(k)] ?? 0) + Number(v || 0);

    const changes = Object.entries(totals)
      .map(([k, v]) => ({ key: k, delta: v - (prevTotals[k] ?? 0), pct: prevTotals[k] ? (v / prevTotals[k] - 1) * 100 : null }))
      .filter((c) => prevTotals[c.key])
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 4);

    const best = [...inYear].sort((a, b) => b.disposable_income - a.disposable_income)[0];
    const worst = [...inYear].sort((a, b) => a.disposable_income - b.disposable_income)[0];
    const yearScores = (scores as any[]).filter((s) => new Date(s.month).getFullYear() === year);

    return {
      months: inYear.length,
      income: inYear.reduce((s, x) => s + x.net_income, 0),
      spent: inYear.reduce((s, x) => s + x.total_expenses, 0),
      avgSavings: inYear.reduce((s, x) => s + x.savings_rate, 0) / inYear.length,
      byCategory: Object.entries(totals).sort((a, b) => b[1] - a[1]),
      changes,
      best,
      worst,
      scoreStart: yearScores[0]?.score ?? null,
      scoreEnd: yearScores[yearScores.length - 1]?.score ?? null,
      trend: inYear.map((s) => ({ month: s.month, rate: s.savings_rate })),
      netWorthStart: inYear.find((s) => s.net_worth !== null)?.net_worth ?? null,
      netWorthEnd: [...inYear].reverse().find((s) => s.net_worth !== null)?.net_worth ?? null,
      liabilitiesStart: inYear.find((s) => s.liabilities_total !== null)?.liabilities_total ?? null,
      liabilitiesEnd: [...inYear].reverse().find((s) => s.liabilities_total !== null)?.liabilities_total ?? null,
      saved: inYear.reduce((s, x) => s + Math.max(0, x.disposable_income), 0),
      invested: totals["investments"] ?? 0,
      prevTotals,
      prevIncome: prev.reduce((s, x) => s + x.net_income, 0),
    };
  }, [all, scores, year]);

  const achieved = (goals as any[]).filter(
    (g) => g.completed_at && new Date(g.completed_at).getFullYear() === year,
  ).length;
  const missed = (goals as any[]).filter((g) => !g.completed_at).length;

  async function share() {
    if (!shareRef.current) return;
    setSharing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(shareRef.current, { backgroundColor: "#0b0d12", scale: 2 });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `budge-${year}-review.png`;
      a.click();
      toast.success("Shareable image saved — amounts are hidden, only trends show.");
    } catch {
      toast.error("Couldn't generate the image");
    } finally {
      setSharing(false);
    }
  }

  async function exportPdf() {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { default: jsPDF } = await import("jspdf");
      const canvas = await html2canvas(reportRef.current, { backgroundColor: "#0A0A1A", scale: 2 });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const h = (canvas.height * w) / canvas.width;
      let y = 0;
      while (y < h) {
        pdf.addImage(img, "PNG", 0, -y, w, h);
        y += pageH;
        if (y < h) pdf.addPage();
      }
      pdf.save(`budge-annual-financial-review-${year}.pdf`);
    } catch {
      toast.error("Couldn't build the PDF");
    } finally {
      setExporting(false);
    }
  }

  if (!review) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Your annual review appears once Budge has stored monthly snapshots for a year. Keep logging — it builds itself.
      </p>
    );
  }

  const money = (n: number) => formatCurrency(n, currency, { decimals: 0 });

  const netWorthChange =
    review.netWorthStart !== null && review.netWorthEnd !== null ? review.netWorthEnd - review.netWorthStart : null;
  const debtReduction =
    review.liabilitiesStart !== null && review.liabilitiesEnd !== null
      ? review.liabilitiesStart - review.liabilitiesEnd
      : null;
  const taxRate = estimatePaye({ annualIncome: review.income }).effectiveRate;

  const recommendations: string[] = [];
  {
    const top = review.byCategory[0];
    if (review.avgSavings < 15) {
      recommendations.push(
        `Lift your savings rate from ${review.avgSavings.toFixed(0)}% towards 15% — on this year's income that's ${money((0.15 - review.avgSavings / 100) * review.income)} more banked.`,
      );
    } else {
      recommendations.push(
        `Hold your ${review.avgSavings.toFixed(0)}% savings rate and move the surplus into an interest-bearing account rather than leaving it in your current account.`,
      );
    }
    if (top) {
      recommendations.push(
        `${categoryLabel(top[0])} took ${money(top[1])} — ${review.income > 0 ? ((top[1] / review.income) * 100).toFixed(0) : 0}% of your income. Setting a monthly cap here is the single biggest lever you have.`,
      );
    }
    if (debtReduction !== null && debtReduction <= 0) {
      recommendations.push("Your total debt did not come down this year. Pick the highest-rate account and add whatever you can spare to it each month.");
    } else if (review.invested === 0) {
      recommendations.push("Nothing was logged as invested this year. Even a small monthly retirement annuity contribution is deductible up to 27.5% of taxable income.");
    } else {
      recommendations.push(`You invested ${money(review.invested)} this year. Increasing that by 10% next year compounds far more than it costs you monthly.`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest transition ${
                y === year ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportPdf} disabled={exporting} className="btn-ghost">
            <FileDown className="size-3.5" /> {exporting ? "Building…" : "Export PDF"}
          </button>
          <button onClick={share} disabled={sharing} className="btn-ghost">
            <Share2 className="size-3.5" /> {sharing ? "Preparing…" : "Share"}
          </button>
        </div>
      </div>

      <div ref={reportRef} className="flex flex-col gap-6 rounded-2xl bg-background p-1">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">Budge Annual Financial Review — {year}</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Big label="Total income" value={money(review.income)} />
        <Big label="Total spent" value={money(review.spent)} />
        <Big label="Average savings rate" value={`${review.avgSavings.toFixed(0)}%`} accent />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <span className="label-xs flex items-center gap-2">
            <Trophy className="size-3.5 text-accent" /> Best month
          </span>
          <p className="mt-2 text-lg font-semibold">{monthName(review.best.month)}</p>
          <p className="numeric mt-1 font-mono text-sm text-accent">{money(review.best.disposable_income)} left over</p>
        </div>
        <div className="panel p-5">
          <span className="label-xs flex items-center gap-2">
            <TrendingDown className="size-3.5 text-alert" /> Hardest month
          </span>
          <p className="mt-2 text-lg font-semibold">{monthName(review.worst.month)}</p>
          <p className="numeric mt-1 font-mono text-sm text-alert">{money(review.worst.disposable_income)} left over</p>
        </div>
      </div>

      <div className="panel p-5">
        <span className="label-xs">Where it went</span>
        <div className="mt-4 flex flex-col gap-2.5">
          {review.byCategory.slice(0, 10).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-36 shrink-0 truncate text-[12px]">{categoryLabel(k)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(v / review.byCategory[0][1]) * 100}%`, background: categoryColor(k) }}
                />
              </div>
              <span className="numeric w-24 shrink-0 text-right font-mono text-[11px]">{money(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {review.changes.length > 0 && (
        <div className="panel p-5">
          <span className="label-xs">Biggest changes vs {year - 1}</span>
          <ul className="mt-3 flex flex-col gap-2">
            {review.changes.map((c) => (
              <li key={c.key} className="flex items-center justify-between text-[12px]">
                <span>{categoryLabel(c.key)}</span>
                <span className={`numeric font-mono ${c.delta > 0 ? "text-alert" : "text-accent"}`}>
                  {c.delta > 0 ? <TrendingUp className="mr-1 inline size-3" /> : <TrendingDown className="mr-1 inline size-3" />}
                  {money(Math.abs(c.delta))} {c.delta > 0 ? "more" : "less"}
                  {c.pct !== null && ` (${Math.abs(c.pct).toFixed(0)}%)`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <span className="label-xs">Goals</span>
          <p className="mt-2 text-[13px]">
            <strong className="text-accent">{achieved}</strong> achieved · <strong>{missed}</strong> still open
          </p>
        </div>
        <div className="panel p-5">
          <span className="label-xs">Budge Score trajectory</span>
          <p className="mt-2 text-[13px]">
            {review.scoreStart && review.scoreEnd
              ? `${review.scoreStart} → ${review.scoreEnd} (${review.scoreEnd - review.scoreStart >= 0 ? "+" : ""}${review.scoreEnd - review.scoreStart} points)`
              : "Not enough score history for this year yet."}
          </p>
        </div>
      </div>


      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Big label="Net worth change" value={netWorthChange === null ? "—" : `${netWorthChange >= 0 ? "+" : "−"}${money(Math.abs(netWorthChange))}`} />
        <Big label="Effective tax rate" value={`${taxRate.toFixed(1)}%`} />
        <Big label="Debt reduced" value={debtReduction === null ? "—" : money(Math.max(0, debtReduction))} />
        <Big label="Total invested" value={money(review.invested)} accent />
      </div>

      <div className="panel p-5">
        <span className="label-xs">Savings rate month by month</span>
        <div className="mt-4 flex items-end gap-1.5" style={{ height: 120 }}>
          {review.trend.map((t) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-accent/70"
                style={{ height: `${Math.max(2, Math.min(100, t.rate))}%` }}
                title={`${monthName(t.month)} · ${t.rate.toFixed(0)}%`}
              />
              <span className="font-mono text-[9px] uppercase text-muted-foreground">
                {new Date(t.month).toLocaleDateString(undefined, { month: "narrow" })}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Total put aside across the year: {money(review.saved)}.
        </p>
      </div>

      {review.prevIncome > 0 && (
        <div className="panel p-5">
          <span className="label-xs">Category spend as a share of income — {year} vs {year - 1}</span>
          <div className="mt-3 flex flex-col gap-1.5">
            {review.byCategory.slice(0, 10).map(([k, v]) => {
              const now = review.income > 0 ? (v / review.income) * 100 : 0;
              const before = ((review.prevTotals[k] ?? 0) / review.prevIncome) * 100;
              return (
                <div key={k} className="flex items-center justify-between text-[12px]">
                  <span>{categoryLabel(k)}</span>
                  <span className="numeric font-mono">
                    {now.toFixed(1)}% <span className="text-muted-foreground">vs {before.toFixed(1)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel p-5">
        <span className="label-xs">Three things to do next year</span>
        <ol className="mt-3 flex flex-col gap-2">
          {recommendations.map((r, i) => (
            <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
              <span className="numeric font-mono text-accent">{i + 1}.</span>
              <span>{r}</span>
            </li>
          ))}
        </ol>
      </div>
      </div>

      {/* Privacy-safe shareable card — percentages and trends only */}
      <div className="overflow-hidden" style={{ height: 0 }}>
        <div ref={shareRef} className="w-[720px] bg-[#0b0d12] p-10 text-white">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#7BD9A5]">Budge · {year} in review</p>
          <h2 className="mt-4 text-5xl font-extrabold tracking-tight">My year in money</h2>
          <div className="mt-8 grid grid-cols-2 gap-6">
            <ShareStat label="Average savings rate" value={`${review.avgSavings.toFixed(0)}%`} />
            <ShareStat label="Months tracked" value={`${review.months}`} />
            <ShareStat label="Goals achieved" value={`${achieved}`} />
            <ShareStat
              label="Score trajectory"
              value={
                review.scoreStart && review.scoreEnd
                  ? `${review.scoreEnd - review.scoreStart >= 0 ? "+" : ""}${review.scoreEnd - review.scoreStart}`
                  : "—"
              }
            />
          </div>
          <p className="mt-8 text-sm text-white/50">Amounts hidden. Trends only.</p>
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel p-6">
      <span className="label-xs">{label}</span>
      <p className={`numeric font-display mt-2 text-3xl font-extrabold tracking-tight ${accent ? "text-accent" : ""}`}>{value}</p>
    </div>
  );
}

function ShareStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-1 text-4xl font-extrabold">{value}</p>
    </div>
  );
}
