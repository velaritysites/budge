import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useExpenses, useIncomeStreams, useProfile } from "@/hooks/use-profile";
import { monthlyEquivalent } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { categoryLabel, normalizeCategory } from "@/lib/categories";
import {
  TAX_DISCLAIMER,
  TAX_TABLE_LABEL,
  estimatePaye,
  provisionalDates,
  taxYear,
  trackDeductions,
} from "@/lib/tax";
import { AlertTriangle, Calendar, Info, Landmark, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tax")({
  component: TaxPage,
  head: () => ({
    meta: [
      { title: "Tax — Loot" },
      { name: "description", content: "Track your estimated PAYE, provisional tax dates and deductible spending through the South African tax year." },
      { property: "og:title", content: "Tax — Loot" },
      { property: "og:description", content: "Estimated PAYE, provisional tax dates and a running deduction tracker for the SA tax year." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function TaxPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const { data: streams = [] } = useIncomeStreams();
  const ty = useMemo(() => taxYear(), []);
  const currency = profile?.currency_code ?? "ZAR";

  const { data: snaps = [] } = useQuery({
    queryKey: ["snapshots", "tax_year", ty.label],
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_snapshots")
        .select("month, net_income, gross_income, expenses_by_category")
        .gte("month", ty.start.toISOString().slice(0, 10))
        .lte("month", ty.end.toISOString().slice(0, 10))
        .order("month", { ascending: true });
      return data ?? [];
    },
    enabled: !!profile,
  });

  if (!profile) return null;

  const monthlyGross = Number(profile.gross_income ?? 0);
  const annualIncome = monthlyGross * 12;

  // Non-PAYE income streams (anything beyond the primary salary) drive provisional tax.
  const sideMonthly = streams
    .filter((s: any) => s.is_active && !/salary|wage/i.test(s.name))
    .reduce((sum: number, s: any) => sum + Number(s.gross_amount ?? 0), 0);

  const byCategory: Record<string, number> = {};
  for (const s of snaps as any[]) {
    for (const [k, v] of Object.entries(s.expenses_by_category ?? {})) {
      const key = normalizeCategory(k);
      byCategory[key] = (byCategory[key] ?? 0) + Number(v || 0);
    }
  }
  // Blend in the current month's logged expenses when no snapshot exists yet.
  if (snaps.length === 0) {
    for (const e of expenses) {
      const key = normalizeCategory(e.category);
      byCategory[key] = (byCategory[key] ?? 0) + monthlyEquivalent(e);
    }
  }

  const baseEstimate = estimatePaye({ annualIncome });
  const deductions = trackDeductions({
    byCategory,
    taxableIncome: baseEstimate.taxableIncome,
    worksFromHome: !!(profile as any).works_from_home,
    medicalMembers: 0,
  });
  const paye = estimatePaye({ annualIncome, deductions: deductions.total });

  const provisionalLiability = sideMonthly > 0 ? estimatePaye({ annualIncome: sideMonthly * 12 }).annualTax : 0;
  const provisional = provisionalDates(provisionalLiability);
  const dueSoon = provisional.filter((p) => p.daysAway <= 60);

  return (
    <div className="page-enter flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-[4.5rem] items-center gap-4 border-b border-hairline bg-background/60 px-5 backdrop-blur-2xl md:px-8">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight">Tax</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {ty.label} tax year · March to February
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 md:px-8">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Estimated annual income" value={formatCurrency(annualIncome, currency, { decimals: 0 })} caption="Based on your current monthly income" />
          <Stat label="Estimated PAYE" value={formatCurrency(paye.annualTax, currency, { decimals: 0 })} caption={TAX_TABLE_LABEL} tone="alert" />
          <Stat label="Effective tax rate" value={`${paye.effectiveRate.toFixed(1)}%`} caption={`${paye.marginalRate.toFixed(0)}% on your next rand`} />
          <Stat label="Monthly PAYE" value={formatCurrency(paye.monthlyTax, currency, { decimals: 0 })} caption="Roughly what comes off each payslip" tone="caution" />
        </section>

        {dueSoon.length > 0 && (
          <section className="panel border-caution/30 bg-caution/[0.06] p-5">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 text-caution" /> Provisional tax coming up
            </p>
            {dueSoon.map((p) => (
              <p key={p.label} className="text-[13px] text-muted-foreground">
                {p.label} is due {p.date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} — in {p.daysAway} days.
                Estimated {formatCurrency(p.amount, currency, { decimals: 0 })}.
              </p>
            ))}
          </section>
        )}

        {sideMonthly > 0 && (
          <section className="panel p-6">
            <p className="label-xs mb-3 flex items-center gap-2">
              <Calendar className="size-3.5" /> Provisional tax
            </p>
            <p className="text-[13px] text-muted-foreground">
              You have {formatCurrency(sideMonthly, currency, { decimals: 0 })} a month of income outside your salary. That's{" "}
              {formatCurrency(provisionalLiability, currency, { decimals: 0 })} of estimated tax for the year, split across two payments.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {provisional.map((p) => (
                <div key={p.label} className="rounded-xl border border-hairline bg-surface-2 px-4 py-3">
                  <p className="label-xs">{p.label}</p>
                  <p className="numeric text-lg font-semibold">{formatCurrency(p.amount, currency, { decimals: 0 })}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {p.date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · {p.daysAway} days away
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="panel p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="label-xs flex items-center gap-2">
                <Receipt className="size-3.5" /> Deduction tracker
              </p>
              <h2 className="text-lg font-display font-bold tracking-tight">
                You have logged {formatCurrency(deductions.total, currency, { decimals: 0 })} in potentially deductible expenses.
              </h2>
            </div>
          </div>

          {deductions.lines.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Nothing deductible spotted yet this tax year. Medical aid, retirement contributions and professional development all count — and
              home office costs too, once you flag that you work from home in Settings.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {deductions.lines.map((l) => (
                <div key={l.rule.category} className="rounded-xl border border-hairline bg-surface-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{l.rule.label}</span>
                    <span className="numeric text-sm">{formatCurrency(l.claimable, currency, { decimals: 0 })}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {categoryLabel(l.rule.category)} · {formatCurrency(l.logged, currency, { decimals: 0 })} logged
                    {l.capped ? " · capped at the SARS limit" : ""}. {l.rule.note}
                  </p>
                </div>
              ))}
            </div>
          )}

          {deductions.total > 0 && (
            <p className="mt-4 text-[13px] text-muted-foreground">
              Claiming these would cut your estimated tax by about{" "}
              {formatCurrency(Math.max(0, baseEstimate.annualTax - paye.annualTax), currency, { decimals: 0 })} for the year.
            </p>
          )}
        </section>

        {new Date().getMonth() === 1 && (
          <section className="panel p-6">
            <p className="label-xs mb-2 flex items-center gap-2">
              <Landmark className="size-3.5" /> Tax year end
            </p>
            <p className="text-[13px] text-muted-foreground">
              February closes the {ty.label} tax year. Your full year summary — income, expenses by category and the deductions above — is on the
              Stats page under Annual Review, ready to export.
            </p>
          </section>
        )}

        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {TAX_DISCLAIMER}
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, caption, tone = "default" }: { label: string; value: string; caption: string; tone?: "default" | "alert" | "caution" }) {
  const color = tone === "alert" ? "text-alert" : tone === "caution" ? "text-caution" : "text-foreground";
  return (
    <div className="tile p-6">
      <p className="label-xs">{label}</p>
      <div className={`numeric font-display mt-4 text-[1.65rem] font-bold tracking-tight ${color}`}>{value}</div>
      <p className="mt-1.5 text-[12px] text-muted-foreground">{caption}</p>
    </div>
  );
}
