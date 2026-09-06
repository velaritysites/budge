import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { formatCurrency } from "@/lib/format";
import { categoryLabel, normalizeCategory } from "@/lib/categories";
import { FileDown, Receipt } from "lucide-react";
import { toast } from "sonner";

/** SA tax year runs 1 March → end of February. */
export function taxYearRange(now = new Date()): { start: Date; end: Date; label: string } {
  const y = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: new Date(y, 2, 1),
    end: new Date(y + 1, 1, 29),
    label: `${y}/${String((y + 1) % 100).padStart(2, "0")}`,
  };
}

const DEDUCTIBLE: Record<string, string> = {
  household: "Home office portion may be deductible",
  medical_aid: "Medical contributions and qualifying expenses above the SARS threshold",
  investments: "Retirement annuity contributions are deductible up to the annual cap",
  subscriptions: "Professional subscriptions and memberships may be deductible",
};

export function TaxSummary() {
  const { data: profile } = useProfile();
  const currency = profile?.currency_code ?? "ZAR";
  const [exporting, setExporting] = useState(false);
  const range = taxYearRange();

  const { data: snaps = [] } = useQuery({
    queryKey: ["snapshots", "tax", range.label],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select("month, net_income, gross_income, total_expenses, expenses_by_category")
        .gte("month", range.start.toISOString().slice(0, 10))
        .lte("month", range.end.toISOString().slice(0, 10))
        .order("month", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: analyses = [] } = useQuery({
    queryKey: ["statement_analyses", "tax", range.label],
    queryFn: async () => {
      const { data } = await supabase
        .from("statement_analyses")
        .select("created_at, total_income, category_totals")
        .gte("created_at", range.start.toISOString())
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const byCategory: Record<string, number> = {};
    let income = 0;
    for (const s of snaps as any[]) {
      income += Number(s.gross_income || s.net_income || 0);
      for (const [k, v] of Object.entries((s.expenses_by_category ?? {}) as Record<string, number>)) {
        const key = normalizeCategory(k);
        byCategory[key] = (byCategory[key] ?? 0) + Number(v || 0);
      }
    }
    for (const a of analyses as any[]) {
      for (const [k, v] of Object.entries((a.category_totals ?? {}) as Record<string, number>)) {
        const key = normalizeCategory(k);
        byCategory[`stmt:${key}`] = (byCategory[`stmt:${key}`] ?? 0) + Number(v || 0);
      }
    }
    const planned = Object.entries(byCategory).filter(([k]) => !k.startsWith("stmt:"));
    return {
      income,
      months: snaps.length,
      rows: planned.sort((a, b) => b[1] - a[1]),
      medical: byCategory["medical_aid"] ?? 0,
      retirement: byCategory["investments"] ?? 0,
      totalExpenses: planned.reduce((s, [, v]) => s + v, 0),
    };
  }, [snaps, analyses]);

  async function exportPdf() {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const money = (n: number) => formatCurrency(n, currency, { decimals: 2 });
      let y = 56;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(`Tax year summary ${range.label}`, 48, y);
      y += 22;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(
        `${profile?.display_name ?? "Loot user"} · 1 March ${range.start.getFullYear()} – end February ${range.end.getFullYear()}`,
        48,
        y,
      );
      y += 28;

      doc.setFont("helvetica", "bold");
      doc.text("Total income for the tax year", 48, y);
      doc.text(money(summary.income), 420, y);
      y += 18;
      doc.text("Total expenses recorded", 48, y);
      doc.text(money(summary.totalExpenses), 420, y);
      y += 26;

      doc.text("Expenses by category", 48, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      for (const [key, amount] of summary.rows) {
        if (y > 760) { doc.addPage(); y = 56; }
        doc.text(categoryLabel(key), 48, y);
        doc.text(money(amount), 420, y);
        if (DEDUCTIBLE[key]) {
          y += 12;
          doc.setFontSize(8);
          doc.text(`Possibly SARS-deductible: ${DEDUCTIBLE[key]}`, 60, y);
          doc.setFontSize(10);
        }
        y += 16;
      }

      y += 12;
      doc.setFont("helvetica", "bold");
      doc.text("Total medical aid contributions", 48, y);
      doc.text(money(summary.medical), 420, y);
      y += 18;
      doc.text("Total retirement annuity / investment contributions", 48, y);
      doc.text(money(summary.retirement), 420, y);

      y += 34;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text(
        "This summary is for reference only and does not constitute tax advice.",
        48,
        y,
      );
      y += 12;
      doc.text("Consult a registered tax practitioner for your eFiling submission.", 48, y);
      doc.save(`loot-tax-summary-${range.label.replace("/", "-")}.pdf`);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't build the PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="-mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Receipt className="size-3.5" /> South African tax year {range.label} (March – February), built from your
        monthly snapshots and statement history.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <p className="label-xs">Total income</p>
          <p className="numeric font-display mt-1 text-xl font-bold">{formatCurrency(summary.income, currency, { decimals: 0 })}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{summary.months} months recorded</p>
        </div>
        <div className="panel p-4">
          <p className="label-xs">Total expenses</p>
          <p className="numeric font-display mt-1 text-xl font-bold">{formatCurrency(summary.totalExpenses, currency, { decimals: 0 })}</p>
        </div>
      </div>

      <div className="panel p-4">
        <p className="label-xs">Expenses by category</p>
        {summary.rows.length === 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">No data recorded for this tax year yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--hairline)]">
            {summary.rows.map(([key, amount]) => (
              <div key={key} className="py-2">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{categoryLabel(key)}</span>
                  {DEDUCTIBLE[key] && <span className="pill text-accent">Possibly deductible</span>}
                  <span className="numeric text-[13px] font-semibold">{formatCurrency(amount, currency, { decimals: 0 })}</span>
                </div>
                {DEDUCTIBLE[key] && <p className="mt-1 text-[11px] text-muted-foreground">{DEDUCTIBLE[key]}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <p className="label-xs">Medical aid contributions</p>
          <p className="numeric mt-1 text-lg font-bold">{formatCurrency(summary.medical, currency, { decimals: 0 })}</p>
        </div>
        <div className="panel p-4">
          <p className="label-xs">Retirement annuity / investments</p>
          <p className="numeric mt-1 text-lg font-bold">{formatCurrency(summary.retirement, currency, { decimals: 0 })}</p>
        </div>
      </div>

      <p className="text-[11px] italic text-muted-foreground">
        This summary is for reference only and does not constitute tax advice. Consult a registered tax practitioner
        for your eFiling submission.
      </p>

      <button type="button" onClick={exportPdf} disabled={exporting} className="btn-accent">
        <FileDown className="size-3.5" /> {exporting ? "Building PDF…" : "Export as PDF"}
      </button>
    </div>
  );
}
