import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { formatCurrency } from "@/lib/format";
import { buildForecast, monthProgress, type ForecastSnap } from "@/lib/forecast";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { TrendingUp, AlertTriangle, LineChart } from "lucide-react";

function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ForecastCard() {
  const { data: profile } = useProfile();
  const currency = profile?.currency_code ?? "ZAR";

  const { data: snaps = [] } = useQuery({
    queryKey: ["snapshots", "forecast"],
    queryFn: async (): Promise<ForecastSnap[]> => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select("month, net_income, total_expenses, expenses_by_category")
        .order("month", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        month: r.month,
        net_income: Number(r.net_income),
        total_expenses: Number(r.total_expenses),
        expenses_by_category: (r.expenses_by_category ?? {}) as Record<string, number>,
      }));
    },
  });

  const { data: mtd } = useQuery({
    queryKey: ["statement_analyses", "forecast"],
    queryFn: async (): Promise<Record<string, number> | null> => {
      const { data } = await supabase
        .from("statement_analyses")
        .select("created_at, category_totals")
        .order("created_at", { ascending: false })
        .limit(3);
      const thisMonth = (data ?? []).find(
        (r: any) => currentMonthKey(new Date(r.created_at)) === currentMonthKey(),
      );
      return (thisMonth?.category_totals ?? null) as Record<string, number> | null;
    },
  });

  const history = snaps.filter((s) => s.month !== currentMonthKey());
  const forecast = buildForecast(history, {
    liveIncome: Number(profile?.net_income ?? 0),
    monthToDate: mtd ?? undefined,
    progress: monthProgress(),
  });

  const monthName = new Date().toLocaleDateString(undefined, { month: "long" });

  if (!forecast) {
    return (
      <section className="panel p-7">
        <div className="flex items-center gap-2">
          <LineChart className="size-3.5 text-accent" />
          <span className="label-xs">Monthly forecast</span>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Use Budge for another month and we'll project how {monthName} is likely to end — income, spending
          by category and what's left over. Forecasting needs at least two months of history
          {history.length === 1 ? " (you have one so far)." : "."}
        </p>
      </section>
    );
  }

  const confidenceCopy =
    forecast.confidence === "high"
      ? "High confidence · 3 months of history"
      : "Medium confidence · 2 months of history";

  const top = forecast.byCategory.slice(0, 6);
  const maxAmt = Math.max(1, ...top.map((c) => c.amount));

  return (
    <section className="panel p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-3.5 text-accent" />
            <span className="label-xs">Forecast · end of {monthName}</span>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            A projection based on your recent months — not a guarantee.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
            forecast.confidence === "high"
              ? "border-accent/30 bg-accent/10 text-accent"
              : "border-caution/30 bg-caution/10 text-caution"
          }`}
        >
          {confidenceCopy}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Projected income" value={formatCurrency(forecast.projectedIncome, currency, { decimals: 0 })} />
        <Tile label="Projected spending" value={formatCurrency(forecast.projectedSpend, currency, { decimals: 0 })} />
        <Tile
          label="Projected left over"
          value={formatCurrency(forecast.projectedDisposable, currency, { decimals: 0 })}
          tone={forecast.projectedDisposable >= 0 ? "accent" : "alert"}
        />
      </div>

      {forecast.flags.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {forecast.flags.slice(0, 4).map((f) => (
            <div
              key={f.key}
              className="flex items-start gap-2 rounded-xl border border-caution/25 bg-caution/[0.06] p-3 text-[13px] leading-relaxed"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-caution" />
              <span>
                Your {categoryLabel(f.key)} spend is tracking {f.pctAbove.toFixed(0)}% above your usual monthly
                amount of {formatCurrency(f.average, currency, { decimals: 0 })}.
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-2.5">
        <p className="label-xs">Projected spending by category</p>
        {top.map((c) => (
          <div key={c.key} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-[13px]">{categoryLabel(c.key)}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(c.amount / maxAmt) * 100}%`, background: categoryColor(c.key) }}
              />
            </span>
            <span className="numeric w-24 text-right text-[13px] font-semibold">
              {formatCurrency(c.amount, currency, { decimals: 0 })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "accent" | "alert" }) {
  const color = tone === "accent" ? "text-accent" : tone === "alert" ? "text-alert" : "";
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[color-mix(in_oklab,var(--surface-3)_35%,transparent)] p-4">
      <p className="label-xs">{label}</p>
      <p className={`numeric font-display mt-1.5 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
