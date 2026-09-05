import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { categoryColor, categoryLabel, normalizeCategory } from "@/lib/categories";
import { BRACKET_LABELS, MIN_BRACKET_SAMPLE, bracketFor } from "@/lib/benchmarks";
import { ShieldCheck } from "lucide-react";

type Row = { category: string; avg_pct: number; sample_size: number };

export function BenchmarksTab({
  netIncome,
  categoryTotals,
}: {
  netIncome: number;
  categoryTotals: Record<string, number>;
}) {
  const { data: profile } = useProfile();
  const bracket = bracketFor(netIncome);

  const { data: benchmarks = [] } = useQuery({
    queryKey: ["spending_benchmarks", bracket],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("spending_benchmarks")
        .select("category, avg_pct, sample_size")
        .eq("income_bracket", bracket);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        category: normalizeCategory(r.category),
        avg_pct: Number(r.avg_pct),
        sample_size: Number(r.sample_size),
      }));
    },
  });

  const mine = useMemo(() => {
    const out: Record<string, number> = {};
    if (netIncome <= 0) return out;
    for (const [k, v] of Object.entries(categoryTotals ?? {})) {
      const key = normalizeCategory(k);
      const pct = (Number(v || 0) / netIncome) * 100;
      if (pct > 0) out[key] = (out[key] ?? 0) + pct;
    }
    return out;
  }, [categoryTotals, netIncome]);

  // Contribute this month's anonymised shares so the averages keep improving.
  useEffect(() => {
    if (!profile || netIncome <= 0 || Object.keys(mine).length === 0) return;
    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    supabase
      .from("benchmark_samples")
      .upsert(
        { user_id: profile.id, month, income_bracket: bracket, category_pcts: mine },
        { onConflict: "user_id,month" },
      )
      .then(() => undefined);
  }, [profile, bracket, mine, netIncome]);

  const sample = Math.max(0, ...benchmarks.map((b) => b.sample_size));
  const notice = (
    <div className="flex items-start gap-2 rounded-xl border border-hairline bg-surface-2/50 p-4 text-[13px] leading-relaxed">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
      <span>Benchmarks are based on anonymised, aggregated data from Budge users. No personal data is shared.</span>
    </div>
  );

  if (sample < MIN_BRACKET_SAMPLE) {
    return (
      <div className="space-y-4">
        {notice}
        <div className="panel p-6">
          <p className="label-xs">Your bracket · {BRACKET_LABELS[bracket]}</p>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Not enough data yet for your income bracket. Check back as more users join.
          </p>
        </div>
      </div>
    );
  }

  const keys = [...new Set([...Object.keys(mine), ...benchmarks.map((b) => b.category)])].sort(
    (a, b) => (mine[b] ?? 0) - (mine[a] ?? 0),
  );

  return (
    <div className="space-y-4">
      {notice}
      <div className="panel p-6">
        <p className="label-xs">Your bracket · {BRACKET_LABELS[bracket]}</p>
        <div className="mt-5 space-y-5">
          {keys.map((k) => {
            const yours = mine[k] ?? 0;
            const avg = benchmarks.find((b) => b.category === k)?.avg_pct ?? 0;
            const max = Math.max(1, yours, avg);
            const diff = yours - avg;
            return (
              <div key={k}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium">{categoryLabel(k)}</span>
                  <span className={diff > 0 ? "text-caution" : "text-accent"}>
                    {Math.abs(diff).toFixed(1)} pts {diff > 0 ? "above" : "below"} average
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  <Bar label="You" pct={yours} width={(yours / max) * 100} color={categoryColor(k)} />
                  <Bar label="Bracket average" pct={avg} width={(avg / max) * 100} color="var(--surface-3)" muted />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, pct, width, color, muted }: { label: string; pct: number; width: number; color: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-32 shrink-0 text-[11px] ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, width)}%`, background: color, opacity: muted ? 0.6 : 1 }} />
      </span>
      <span className="numeric w-14 text-right font-mono text-[11px] text-muted-foreground">{pct.toFixed(1)}%</span>
    </div>
  );
}
