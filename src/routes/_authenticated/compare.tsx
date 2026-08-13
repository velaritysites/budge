import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { CATEGORY_LABELS, CATEGORY_COLORS, type ExpenseCategory, type ExpenseFrequency, monthlyEquivalent } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { GitCompare, Download, Image as ImageIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { PlanExportSheet, exportPlanImage, exportPlanPdf, type ExportPlan } from "@/lib/export-plan";

export const Route = createFileRoute("/_authenticated/compare")({
  head: () => ({
    meta: [
      { title: "Compare Plans — Budge" },
      { name: "description", content: "Put your saved salary plans side by side and see exactly what each lifestyle asks of your paycheck." },
      { property: "og:title", content: "Compare Plans — Budge" },
      { property: "og:description", content: "Put your saved salary plans side by side and see exactly what each lifestyle asks of your paycheck." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComparePage,
});

type Item = { id: string; name: string; amount: number; category: ExpenseCategory; frequency: ExpenseFrequency };
type Phase = { id: string; name: string; leftover: number; items: Item[]; trash?: Item[] };
type SavedPlan = {
  id: string;
  name: string;
  tax_rate_pct: number;
  phases: Phase[];
  notes: string | null;
  updated_at: string;
};

function planStats(p: SavedPlan) {
  const monthly = p.phases.reduce((s, ph) => s + ph.items.reduce((a, i) => a + monthlyEquivalent(i), 0), 0);
  const leftover = p.phases.reduce((s, ph) => s + (Number(ph.leftover) || 0), 0);
  const requiredNet = monthly + leftover;
  const rate = Math.max(0, Math.min(80, Number(p.tax_rate_pct) || 0)) / 100;
  const requiredGross = rate < 1 ? requiredNet / (1 - rate) : requiredNet;
  const byCategory: Partial<Record<ExpenseCategory, number>> = {};
  for (const ph of p.phases) {
    for (const i of ph.items) {
      byCategory[i.category] = (byCategory[i.category] ?? 0) + monthlyEquivalent(i);
    }
  }
  const items = p.phases.reduce((s, ph) => s + ph.items.length, 0);
  return { monthly, leftover, requiredNet, requiredGross, byCategory, items };
}

function ComparePage() {
  const { data: profile } = useProfile();
  const currency = profile?.currency_code ?? "USD";
  const currentNet = Number(profile?.net_income ?? 0);

  const [selected, setSelected] = useState<string[]>([]);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportTarget, setExportTarget] = useState<ExportPlan | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["planner_plans"],
    queryFn: async (): Promise<SavedPlan[]> => {
      const { data, error } = await supabase
        .from("planner_plans")
        .select("id, name, tax_rate_pct, phases, notes, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        tax_rate_pct: Number(r.tax_rate_pct),
        phases: (r.phases as Phase[]) ?? [],
        notes: r.notes,
        updated_at: r.updated_at,
      }));
    },
  });

  const chosen = useMemo(
    () => selected.map((id) => plans.find((p) => p.id === id)).filter(Boolean) as SavedPlan[],
    [selected, plans],
  );

  const rows = useMemo(() => chosen.map((p) => ({ plan: p, stats: planStats(p) })), [chosen]);

  const cheapest = rows.length > 1
    ? rows.reduce((a, b) => (b.stats.requiredGross < a.stats.requiredGross ? b : a)).plan.id
    : null;

  const allCategories = useMemo(() => {
    const set = new Set<ExpenseCategory>();
    for (const r of rows) for (const k of Object.keys(r.stats.byCategory)) set.add(k as ExpenseCategory);
    return [...set];
  }, [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast.error("Compare up to 4 plans at a time");
        return prev;
      }
      return [...prev, id];
    });
  }

  async function runExport(plan: SavedPlan, kind: "png" | "pdf") {
    setExportTarget({ name: plan.name, tax_rate_pct: plan.tax_rate_pct, phases: plan.phases, notes: plan.notes });
    setExportBusy(`${plan.id}:${kind}`);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const node = exportRef.current;
      if (!node) throw new Error("Export node not ready");
      if (kind === "png") await exportPlanImage(node, plan.name);
      else await exportPlanPdf(node, plan.name);
      toast.success(kind === "png" ? "Image downloaded" : "PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExportBusy(null);
      setExportTarget(null);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <GitCompare className="size-3.5" /> Compare plans
        </span>
      </header>

      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8">
        <section className="space-y-2 animate-enter">
          <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight">Side by side</h1>
          <p className="text-muted-foreground text-sm max-w-lg leading-relaxed">
            Pick up to four saved plans and see exactly what each one asks of your paycheck — no guessing which life is the affordable one.
          </p>
        </section>

        {/* Plan picker */}
        <section className="space-y-3 animate-enter [animation-delay:50ms]">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Your plans {plans.length > 0 && `(${selected.length}/${Math.min(4, plans.length)} selected)`}
          </span>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
              No saved plans yet — build one in the Planner first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)}
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition ${
                      on ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}>
                    {on && <Check className="size-3" />}
                    <span className="font-medium">{p.name}</span>
                    <span className="font-mono text-[10px] opacity-70">
                      {formatCurrency(planStats(p).requiredGross, currency)}/mo gross
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {rows.length === 0 ? (
          plans.length > 0 && (
            <p className="text-sm text-muted-foreground py-10 text-center border border-dashed border-border rounded-lg">
              Select at least one plan above to start comparing.
            </p>
          )
        ) : (
          <>
            {/* Headline comparison */}
            <section className="overflow-x-auto animate-enter [animation-delay:100ms]">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-medium p-3 border-b border-border w-44">
                      Metric
                    </th>
                    {rows.map(({ plan }) => (
                      <th key={plan.id} className="text-right p-3 border-b border-border">
                        <div className="text-sm font-bold truncate">{plan.name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                          {plan.phases.length} phase{plan.phases.length !== 1 ? "s" : ""}
                          {cheapest === plan.id && <span className="text-accent"> · leanest</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Monthly expenses" rows={rows} pick={(s) => s.monthly} currency={currency} />
                  <CompareRow label="Leftover target" rows={rows} pick={(s) => s.leftover} currency={currency} />
                  <CompareRow label="Required net / mo" rows={rows} pick={(s) => s.requiredNet} currency={currency} strong />
                  <CompareRow label="Required gross / mo" rows={rows} pick={(s) => s.requiredGross} currency={currency} strong accent />
                  <CompareRow label="Annual gross" rows={rows} pick={(s) => s.requiredGross * 12} currency={currency} muted />
                  <tr>
                    <td className="p-3 text-xs text-muted-foreground border-b border-border">Tax rate</td>
                    {rows.map(({ plan }) => (
                      <td key={plan.id} className="p-3 text-right font-mono text-sm border-b border-border">{plan.tax_rate_pct}%</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 text-xs text-muted-foreground border-b border-border">Line items</td>
                    {rows.map(({ plan, stats }) => (
                      <td key={plan.id} className="p-3 text-right font-mono text-sm border-b border-border">{stats.items}</td>
                    ))}
                  </tr>
                  {currentNet > 0 && (
                    <tr>
                      <td className="p-3 text-xs text-muted-foreground border-b border-border">vs your take-home</td>
                      {rows.map(({ plan, stats }) => {
                        const gap = stats.requiredNet - currentNet;
                        return (
                          <td key={plan.id} className={`p-3 text-right font-mono text-sm border-b border-border ${gap <= 0 ? "text-accent" : "text-caution"}`}>
                            {gap <= 0 ? `+${formatCurrency(-gap, currency)}` : `−${formatCurrency(gap, currency)}`}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            {/* Category breakdown */}
            {allCategories.length > 0 && (
              <section className="space-y-3 animate-enter [animation-delay:150ms]">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Monthly spend by category</span>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse">
                    <tbody>
                      {allCategories.map((c) => (
                        <tr key={c}>
                          <td className="p-3 text-xs border-b border-border w-44">
                            <span className="inline-flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
                              {CATEGORY_LABELS[c]}
                            </span>
                          </td>
                          {rows.map(({ plan, stats }) => (
                            <td key={plan.id} className="p-3 text-right font-mono text-sm border-b border-border">
                              {stats.byCategory[c] ? formatCurrency(stats.byCategory[c]!, currency) : <span className="text-muted-foreground/50">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Per-plan exports */}
            <section className="space-y-3 animate-enter [animation-delay:200ms]">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Export</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rows.map(({ plan }) => (
                  <div key={plan.id} className="panel p-4 space-y-3">
                    <div className="text-sm font-bold truncate">{plan.name}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => runExport(plan, "pdf")} disabled={!!exportBusy}
                        className="border border-border rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-accent disabled:opacity-50">
                        <Download className="size-3" /> {exportBusy === `${plan.id}:pdf` ? "Exporting…" : "PDF"}
                      </button>
                      <button onClick={() => runExport(plan, "png")} disabled={!!exportBusy}
                        className="border border-border rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-accent disabled:opacity-50">
                        <ImageIcon className="size-3" /> {exportBusy === `${plan.id}:png` ? "Exporting…" : "PNG"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {exportTarget && (
        <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none", zIndex: -1 }} aria-hidden>
          <PlanExportSheet plan={exportTarget} currency={currency} innerRef={exportRef} />
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, rows, pick, currency, strong, accent, muted }: {
  label: string;
  rows: { plan: SavedPlan; stats: ReturnType<typeof planStats> }[];
  pick: (s: ReturnType<typeof planStats>) => number;
  currency: string;
  strong?: boolean;
  accent?: boolean;
  muted?: boolean;
}) {
  const values = rows.map(({ stats }) => pick(stats));
  const min = Math.min(...values);
  return (
    <tr>
      <td className="p-3 text-xs text-muted-foreground border-b border-border">{label}</td>
      {rows.map(({ plan }, idx) => (
        <td key={plan.id}
          className={`p-3 text-right border-b border-border font-mono ${strong ? "text-base font-bold" : "text-sm"} ${
            accent ? "text-accent" : muted ? "text-muted-foreground" : "text-foreground"
          }`}>
          {formatCurrency(values[idx], currency)}
          {strong && rows.length > 1 && values[idx] === min && (
            <span className="block text-[9px] font-mono uppercase tracking-widest text-muted-foreground">lowest</span>
          )}
        </td>
      ))}
    </tr>
  );
}
