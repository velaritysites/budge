import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { categoryLabel, normalizeCategory } from "@/lib/categories";
import { closeMonth, monthLabel, previousMonthKey, useCloseableMonth } from "@/lib/monthly-close";
import { buildBriefing, saveBriefing, type Briefing } from "@/lib/briefing";
import { useBenchmarks } from "@/lib/benchmarks";
import { CheckCircle2, ChevronLeft, ChevronRight, FileDown, Lock, X } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const STEPS = ["Income", "Fixed expenses", "Variable expenses", "Anything unusual", "Confirm"] as const;

export function MonthlyCloseCard({ currency }: { currency: string }) {
  const month = previousMonthKey();
  const { data: snap } = useCloseableMonth(month);
  const [open, setOpen] = useState(false);

  if (!snap) return null;

  return (
    <>
      <div className="panel p-5 flex flex-wrap items-center gap-4">
        <div className={`grid size-10 place-items-center rounded-xl ${snap.locked_at ? "bg-accent/10 text-accent" : "bg-caution/10 text-caution"}`}>
          {snap.locked_at ? <CheckCircle2 className="size-5" /> : <Lock className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="label-xs">Monthly close</p>
          <h3 className="text-lg font-display font-bold tracking-tight">
            {snap.locked_at ? `${monthLabel(month)} is closed.` : `Close off ${monthLabel(month)}.`}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {snap.locked_at
              ? "Locked and summarised. Open it to read or export the one-pager."
              : "A five-step review that confirms last month's numbers and locks them."}
          </p>
        </div>
        <button onClick={() => setOpen(true)} className={snap.locked_at ? "btn-ghost" : "btn-primary"}>
          {snap.locked_at ? "View summary" : "Start close"}
        </button>
      </div>
      {open && <CloseFlow month={month} currency={currency} onClose={() => setOpen(false)} />}
    </>
  );
}

function CloseFlow({ month, currency, onClose }: { month: string; currency: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: snap } = useCloseableMonth(month);
  const [step, setStep] = useState(0);
  const [netIncome, setNetIncome] = useState<string>("");
  const [grossIncome, setGrossIncome] = useState<string>("");
  const [cats, setCats] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  const locked = !!snap?.locked_at;

  const catRows = useMemo(() => {
    const entries = Object.entries(snap?.expenses_by_category ?? {}).map(([k, v]) => [normalizeCategory(k), Number(v || 0)] as const);
    return entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [snap]);

  if (!snap) return null;

  const net = netIncome === "" ? snap.net_income : Number(netIncome) || 0;
  const gross = grossIncome === "" ? snap.gross_income : Number(grossIncome) || 0;
  const byCategory: Record<string, number> = {};
  for (const [k, v] of catRows) byCategory[k] = cats[k] === undefined || cats[k] === "" ? v : Number(cats[k]) || 0;
  const totalExpenses = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const disposable = net - totalExpenses;
  const savingsRate = net > 0 ? Math.max(0, (disposable / net) * 100) : 0;

  async function finish() {
    setSaving(true);
    try {
      await closeMonth({ month, netIncome: net, grossIncome: gross, byCategory, notes });
      const b = await generateBriefing();
      setBriefing(b);
      qc.invalidateQueries({ queryKey: ["monthly_close", month] });
      qc.invalidateQueries({ queryKey: ["monthly_snapshots", "locked"] });
      qc.invalidateQueries({ queryKey: ["monthly_briefings"] });
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      toast.success(`${monthLabel(month)} closed and locked.`);
      setStep(5);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not close the month");
    } finally {
      setSaving(false);
    }
  }

  async function generateBriefing(): Promise<Briefing | null> {
    try {
      const [{ data: prior }, { data: scores }, { data: goals }, { data: debts }] = await Promise.all([
        supabase
          .from("monthly_snapshots")
          .select("month, savings_rate, expenses_by_category")
          .lt("month", month)
          .order("month", { ascending: false })
          .limit(3),
        supabase.from("budge_scores").select("month, score, factors").order("month", { ascending: false }).limit(2),
        supabase.from("savings_goals").select("name, completed_at").not("completed_at", "is", null),
        supabase.from("debts").select("min_payment"),
      ]);

      const debtMonthly = (debts ?? []).reduce((s: number, d: any) => s + Number(d.min_payment ?? 0), 0);
      const factors = (scores?.[0]?.factors ?? []) as any[];
      const weakest = Array.isArray(factors)
        ? [...factors].sort((a, b) => (b.headroom ?? 0) - (a.headroom ?? 0))[0]?.label ?? null
        : null;

      const monthStart = new Date(month);
      const completed = (goals ?? [])
        .filter((g: any) => {
          const d = new Date(g.completed_at);
          return d.getFullYear() === monthStart.getFullYear() && d.getMonth() === monthStart.getMonth();
        })
        .map((g: any) => g.name as string);

      const b = buildBriefing({
        month,
        money: (n) => formatCurrency(n, currency, { decimals: 0 }),
        netIncome: net,
        totalExpenses,
        disposable,
        savingsRate,
        prevSavingsRate: prior?.[0] ? Number((prior[0] as any).savings_rate) : null,
        byCategory,
        history: (prior ?? []).map((p: any) => (p.expenses_by_category ?? {}) as Record<string, number>),
        scoreNow: scores?.[0]?.score ?? null,
        scorePrev: scores?.[1]?.score ?? null,
        topScoreDriver: weakest,
        dtiPct: gross > 0 ? (debtMonthly / gross) * 100 : 0,
        prevDtiPct: null,
        benchmarks: {},
        goalsCompleted: completed,
      });
      await saveBriefing(b);
      return b;
    } catch {
      return null;
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6 md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="label-xs">Monthly close</p>
            <h2 className="text-2xl font-display font-extrabold tracking-tight">{monthLabel(month)}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {locked || step === 5 ? (
          <ClosedSummary month={month} currency={currency} briefing={briefing} />
        ) : (
          <>
            <ol className="mb-6 flex flex-wrap gap-2">
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${
                    i === step
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : i < step
                        ? "border-border text-foreground"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {i + 1}. {s}
                </li>
              ))}
            </ol>

            {step === 0 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Confirm what actually landed in your account last month.</p>
                <Field label="Net income received" value={netIncome} placeholder={String(snap.net_income)} onChange={setNetIncome} />
                <Field label="Gross income" value={grossIncome} placeholder={String(snap.gross_income)} onChange={setGrossIncome} />
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Tick off the fixed commitments that went out as expected.</p>
                {catRows.length === 0 && <p className="text-sm text-muted-foreground">No categories recorded for this month.</p>}
                {catRows.slice(0, 8).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-xl border border-hairline bg-surface-2 px-4 py-3">
                    <span className="text-sm">{categoryLabel(k)}</span>
                    <span className="numeric text-sm">{formatCurrency(v, currency, { decimals: 0 })}</span>
                  </div>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Adjust any category total that didn't match reality.</p>
                {catRows.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm">{categoryLabel(k)}</span>
                    <input
                      inputMode="decimal"
                      value={cats[k] ?? ""}
                      placeholder={String(Math.round(v))}
                      onChange={(e) => setCats({ ...cats, [k]: e.target.value })}
                      className="w-36 rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-right text-sm numeric"
                    />
                  </div>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Anything unusual worth remembering about this month? Optional.</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Car service, bonus paid, medical bill…"
                  className="w-full rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm"
                />
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Once closed, this month is locked and can't be edited.</p>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Income" value={formatCurrency(net, currency, { decimals: 0 })} />
                  <Stat label="Expenses" value={formatCurrency(totalExpenses, currency, { decimals: 0 })} />
                  <Stat label="Disposable" value={formatCurrency(disposable, currency, { decimals: 0 })} />
                  <Stat label="Savings rate" value={`${savingsRate.toFixed(0)}%`} />
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between">
              <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-ghost disabled:opacity-40">
                <ChevronLeft className="size-4" /> Back
              </button>
              {step < 4 ? (
                <button onClick={() => setStep(step + 1)} className="btn-primary">
                  Next <ChevronRight className="size-4" />
                </button>
              ) : (
                <button onClick={finish} disabled={saving} className="btn-primary">
                  {saving ? "Closing…" : "Confirm & close month"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label-xs">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm numeric"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-2 px-4 py-3">
      <p className="label-xs">{label}</p>
      <p className="numeric text-lg font-semibold">{value}</p>
    </div>
  );
}

/* ---------------- one-page summary + PDF ---------------- */

export function ClosedSummary({ month, currency, briefing }: { month: string; currency: string; briefing?: Briefing | null }) {
  const { data: snap } = useCloseableMonth(month);
  const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: benchmarks } = useBenchmarks();
  void benchmarks;

  if (!snap) return null;

  async function download() {
    if (!sheet.current) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(sheet.current, { backgroundColor: "#0A0A1A", scale: 2 });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(img, "PNG", 0, 0, w, Math.min(h, pdf.internal.pageSize.getHeight()));
      pdf.save(`budge-${month.slice(0, 7)}-summary.pdf`);
    } catch {
      toast.error("Could not build the PDF");
    } finally {
      setBusy(false);
    }
  }

  const rows = Object.entries(snap.expenses_by_category)
    .map(([k, v]) => [normalizeCategory(k), Number(v || 0)] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] text-accent">
          <Lock className="size-3.5" /> Locked {snap.locked_at ? new Date(snap.locked_at).toLocaleDateString() : ""}
        </p>
        <button onClick={download} disabled={busy} className="btn-ghost">
          <FileDown className="size-4" /> {busy ? "Building…" : "Export PDF"}
        </button>
      </div>

      <MonthlySummarySheet innerRef={sheet} month={month} currency={currency} snap={snap} rows={rows} briefing={briefing ?? null} />
    </div>
  );
}

function MonthlySummarySheet({
  innerRef,
  month,
  currency,
  snap,
  rows,
  briefing,
}: {
  innerRef: React.Ref<HTMLDivElement>;
  month: string;
  currency: string;
  snap: { net_income: number; total_expenses: number; disposable_income: number; savings_rate: number; close_notes: string | null };
  rows: readonly (readonly [string, number])[];
  briefing: Briefing | null;
}) {
  const bg = "#0A0A1A";
  const surface = "#141432";
  const border = "rgba(200,205,255,0.14)";
  const fg = "#ECEDFA";
  const muted = "#9BA0C6";
  const accent = "#6C63F5";

  return (
    <div
      ref={innerRef}
      style={{
        background: bg,
        color: fg,
        padding: 32,
        borderRadius: 18,
        border: `1px solid ${border}`,
        fontFamily: "Cabin, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <div>
          <div style={{ color: muted, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Budge · monthly summary</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{monthLabel(month)}</div>
        </div>
        <div style={{ color: accent, fontSize: 12 }}>Closed</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          ["Income", formatCurrency(snap.net_income, currency, { decimals: 0 })],
          ["Expenses", formatCurrency(snap.total_expenses, currency, { decimals: 0 })],
          ["Disposable", formatCurrency(snap.disposable_income, currency, { decimals: 0 })],
          ["Savings rate", `${snap.savings_rate.toFixed(0)}%`],
        ].map(([l, v]) => (
          <div key={l} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ color: muted, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ color: muted, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Expenses by category</div>
      <div style={{ marginBottom: 24 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${border}` }}>
            <span style={{ fontSize: 13 }}>{categoryLabel(k)}</span>
            <span style={{ fontSize: 13 }}>{formatCurrency(v, currency, { decimals: 0 })}</span>
          </div>
        ))}
      </div>

      {snap.close_notes && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: muted, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Notes</div>
          <div style={{ fontSize: 13, color: fg }}>{snap.close_notes}</div>
        </div>
      )}

      {briefing && briefing.observations.length > 0 && (
        <div>
          <div style={{ color: muted, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Briefing</div>
          {briefing.observations.map((o, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>• {o}</div>
          ))}
          <div style={{ marginTop: 10, color: accent, fontSize: 13 }}>{briefing.recommendation}</div>
        </div>
      )}
    </div>
  );
}
