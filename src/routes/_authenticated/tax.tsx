import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useExpenses, useIncomeStreams, useProfile } from "@/hooks/use-profile";
import { monthlyEquivalent } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { normalizeCategory } from "@/lib/categories";
import {
  TAX_CENTRE_DISCLAIMER,
  TAX_TABLE_LABEL,
  SARS_KM_RATE,
  DONATION_LIMIT_PCT,
  RA_DEDUCTION_CAP,
  RA_DEDUCTION_PCT,
  estimateTaxSteps,
  medicalCreditAnnual,
  monthsElapsedInTaxYear,
  raDeductionCap,
  taxDeadlines,
  taxYear,
} from "@/lib/tax";
import { useTaxProfile, useSaveTaxYearData, useTaxYearData } from "@/hooks/use-tax-profile";
import { TaxProfileForm } from "@/components/tax-profile-form";
import { GlossaryProvider, GlossaryList, TaxTerm } from "@/components/tax-glossary";
import { AutoAssessmentCallout, GuideAccordion, buildGuideSteps } from "@/components/efiling-guide";
import { pushNotifications } from "@/lib/notify";
import {
  BookOpen, Calendar, CheckCircle2, Info, Receipt, Settings2, Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tax")({
  component: TaxPage,
  head: () => ({
    meta: [
      { title: "Tax Centre — Loot" },
      { name: "description", content: "Understand your South African tax: a step-by-step estimate, deduction tracker, SARS deadlines, an eFiling guide and a plain-language glossary." },
      { property: "og:title", content: "Tax Centre — Loot" },
      { property: "og:description", content: "Estimate your SARS tax, track deductions, never miss a deadline and learn how to file." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function TaxPage() {
  return (
    <GlossaryProvider>
      <TaxCentre />
    </GlossaryProvider>
  );
}

function TaxCentre() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const { data: streams = [] } = useIncomeStreams();
  const { data: taxProfile, isLoading: loadingTaxProfile } = useTaxProfile();
  const ty = useMemo(() => taxYear(), []);
  const { data: yearData } = useTaxYearData(ty.label);
  const saveYearData = useSaveTaxYearData();
  const qc = useQueryClient();
  const currency = profile?.currency_code ?? "ZAR";

  const [editing, setEditing] = useState(false);
  const [km, setKm] = useState("");

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

  const { data: workRelated = [] } = useQuery({
    queryKey: ["work_related_education"],
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("id, name, amount, frequency, category, work_related")
        .eq("category", "education")
        .is("deleted_at", null);
      return (data ?? []) as any[];
    },
    enabled: !!profile,
  });

  /* ---------------- category totals for the tax year ---------------- */
  const byCategory = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of snaps as any[]) {
      for (const [k, v] of Object.entries(s.expenses_by_category ?? {})) {
        const key = normalizeCategory(k);
        out[key] = (out[key] ?? 0) + Number(v || 0);
      }
    }
    const monthsSoFar = Math.max(1, monthsElapsedInTaxYear());
    if (snaps.length === 0) {
      for (const e of expenses) {
        const key = normalizeCategory(e.category);
        out[key] = (out[key] ?? 0) + monthlyEquivalent(e) * monthsSoFar;
      }
    }
    return out;
  }, [snaps, expenses]);

  const monthsSoFar = Math.max(1, Math.min(12, monthsElapsedInTaxYear()));

  /* ---------------- gate: questionnaire first ---------------- */
  const ready = !!profile && !loadingTaxProfile;
  const needsSetup = !taxProfile || editing;

  const monthlyGross = Number(profile?.gross_income ?? 0);
  const annualIncome = monthlyGross * 12;

  const employment = taxProfile?.employment_type ?? "salaried";
  const isFreelance = employment === "freelance" || employment === "both" || employment === "director";
  const isProvisional = taxProfile?.is_provisional_taxpayer === "yes" || isFreelance;
  const hasHomeOffice = (taxProfile?.home_office_enabled ?? "no") !== "no";
  const hasTravel = !!taxProfile?.has_travel_allowance;
  const hasRa = !!taxProfile?.has_ra;
  const hasInvestments = !!taxProfile?.has_investment_income;
  const age = taxProfile?.age ?? 30;

  /* ---------------- deductions ---------------- */
  const raLogged = hasRa ? Number(byCategory["investments"] ?? 0) : 0;
  const medicalLogged = Number(byCategory["medical_aid"] ?? 0);
  const medicalMembers = medicalLogged > 0 ? 2 : 0;
  const medicalCredit = medicalCreditAnnual(medicalMembers);

  const homeShare =
    hasHomeOffice && (taxProfile?.home_total_area_m2 ?? 0) > 0
      ? Math.min(1, (taxProfile!.home_office_area_m2 ?? 0) / taxProfile!.home_total_area_m2)
      : 0;
  const homeCosts = Number(byCategory["housing"] ?? 0) + Number(byCategory["household"] ?? 0) + Number(byCategory["phone_airtime"] ?? 0);
  const homeOfficeDeduction = homeShare * homeCosts * (taxProfile?.home_office_enabled === "partial" ? 0.5 : 1);

  const businessKm = yearData?.business_km ?? 0;
  const travelDeduction = hasTravel ? businessKm * SARS_KM_RATE : 0;

  const donationsLogged = Number(byCategory["giving_charity"] ?? 0);
  const profDev = workRelated
    .filter((e) => e.work_related)
    .reduce((s, e) => s + monthlyEquivalent({ amount: Number(e.amount), frequency: e.frequency }) * monthsSoFar, 0);

  const preliminary = estimateTaxSteps({ grossAnnual: annualIncome, age, medicalMembers });
  const donationLimit = (preliminary.taxableIncome * DONATION_LIMIT_PCT) / 100;
  const donationsClaimable = Math.min(donationsLogged, donationLimit);

  const raCap = raDeductionCap(annualIncome);
  const otherDeductions = homeOfficeDeduction + travelDeduction + donationsClaimable + profDev;

  const steps = estimateTaxSteps({
    grossAnnual: Math.max(0, annualIncome - otherDeductions),
    raContributions: raLogged,
    medicalMembers,
    age,
  });
  const noDeductions = estimateTaxSteps({ grossAnnual: annualIncome, medicalMembers, age });
  const taxSaving = Math.max(0, noDeductions.annualTax - steps.annualTax);
  const totalDeductions = steps.raDeduction + otherDeductions;

  /* ---------------- refund / owing ---------------- */
  const payePaidYtd = (noDeductions.annualTax / 12) * monthsSoFar;
  const liabilityYtd = (steps.annualTax / 12) * monthsSoFar;
  const balance = payePaidYtd - liabilityYtd;

  /* ---------------- provisional ---------------- */
  const sideMonthly = streams
    .filter((s: any) => s.is_active && !/salary|wage/i.test(s.name))
    .reduce((sum: number, s: any) => sum + Number(s.gross_amount ?? 0), 0);
  const payeWithheld = isFreelance && sideMonthly > 0 ? 0 : payePaidYtd;
  const firstPeriod = Math.max(0, steps.annualTax / 2 - payeWithheld / 2);
  const secondPeriod = Math.max(0, steps.annualTax - firstPeriod - payeWithheld / 2);
  const augDate = new Date(ty.startYear, 7, 31);
  const febDate = ty.end;
  const daysTo = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86_400_000);

  /* ---------------- deadlines + notifications ---------------- */
  const deadlines = useMemo(() => taxDeadlines({ provisional: isProvisional }), [isProvisional]);
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current || !taxProfile) return;
    const due = deadlines.filter((d) => !d.past && (d.daysAway <= 30 || (d.daysAway > 30 && d.daysAway <= 60)));
    if (!due.length) return;
    notifiedRef.current = true;
    pushNotifications(
      due.map((d) => ({
        kind: "tax_deadline",
        title: `${d.name} in ${d.daysAway} days`,
        body: d.action,
        link: "/tax",
        dedupe: `tax_${d.key}_${ty.label}_${d.daysAway <= 30 ? 30 : 60}`,
      })),
    ).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
  }, [deadlines, taxProfile, ty.label, qc]);

  async function saveKm() {
    const v = parseFloat(km || "0");
    if (!v || v < 0) return toast.error("Enter your business kilometres");
    await saveYearData.mutateAsync({ tax_year: ty.label, business_km: v });
    setKm("");
    toast.success("Business kilometres saved");
  }

  async function toggleWorkRelated(id: string, next: boolean) {
    await supabase.from("expenses").update({ work_related: next }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["work_related_education"] });
  }

  // Keep the stored tax-year totals in step with what we just calculated.
  const syncedRef = useRef("");
  useEffect(() => {
    if (!taxProfile) return;
    const sig = [raLogged, medicalLogged, homeOfficeDeduction, travelDeduction, donationsClaimable, profDev]
      .map((n) => Math.round(n))
      .join("|");
    if (syncedRef.current === sig) return;
    syncedRef.current = sig;
    saveYearData.mutate({
      tax_year: ty.label,
      ra_contributions: raLogged,
      medical_aid_contributions: medicalLogged,
      home_office_deduction: homeOfficeDeduction,
      travel_deduction: travelDeduction,
      donations: donationsClaimable,
      professional_development: profDev,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raLogged, medicalLogged, homeOfficeDeduction, travelDeduction, donationsClaimable, profDev, taxProfile, ty.label]);

  const guideSteps = buildGuideSteps({
    provisional: isProvisional,
    investmentIncome: hasInvestments,
    deductions: [
      ...(hasRa ? ["Retirement annuity"] : []),
      ...(medicalLogged > 0 ? ["Medical aid"] : []),
      ...(hasHomeOffice ? ["Home office"] : []),
      ...(hasTravel ? ["Travel"] : []),
      ...(donationsLogged > 0 ? ["Donations"] : []),
    ],
  });

  const money = (n: number) => formatCurrency(n, currency, { decimals: 0 });

  if (!ready) return null;

  return (
    <div className="page-enter flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-[4.5rem] items-center justify-between gap-4 border-b border-hairline bg-background/60 px-5 backdrop-blur-2xl md:px-8">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight">Tax Centre</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {ty.label} tax year · March to February
          </p>
        </div>
        {taxProfile && !editing && (
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-2 rounded-xl border border-hairline px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground">
            <Settings2 className="size-3.5" /> Update tax profile
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 md:px-8">
        {needsSetup ? (
          <TaxProfileForm
            initial={taxProfile ?? null}
            onDone={() => setEditing(false)}
            onCancel={taxProfile ? () => setEditing(false) : undefined}
          />
        ) : (
          <>
            <Disclaimer />

            {/* ---------- Section 2: estimate ---------- */}
            <section className="panel p-6">
              <p className="label-xs mb-1 flex items-center gap-2"><Wallet className="size-3.5" /> Your tax estimate</p>
              <h2 className="text-lg font-display font-bold tracking-tight">
                Here's how SARS gets to your number, line by line.
              </h2>
              <p className="mt-1 text-[12px] text-muted-foreground">{TAX_TABLE_LABEL}</p>

              <div className="mt-5 flex flex-col">
                <Line label="Gross annual income" hint="Monthly gross × 12" value={money(steps.grossAnnual + otherDeductions)} />
                {otherDeductions > 0 && (
                  <Line label="Less: other deductions" hint="Home office, travel, donations, professional development"
                    value={`− ${money(otherDeductions)}`} tone="accent" />
                )}
                <Line
                  label={<TaxTerm termKey="ra_deduction"><span>Less: retirement annuity deduction</span></TaxTerm>}
                  hint={`Capped at ${RA_DEDUCTION_PCT}% of income or ${money(RA_DEDUCTION_CAP)} — your cap is ${money(raCap)}`}
                  value={`− ${money(steps.raDeduction)}`} tone="accent" />
                <Line label={<TaxTerm termKey="taxable_income"><span>Taxable income</span></TaxTerm>}
                  value={money(steps.taxableIncome)} strong />
                <Line label="Tax from the SARS tables" hint={`Marginal rate ${steps.marginalRate.toFixed(0)}%`} value={money(steps.grossTax)} />
                <Line label={<TaxTerm termKey="tax_rebate"><span>Less: {steps.rebateLabel}</span></TaxTerm>}
                  value={`− ${money(steps.rebate)}`} tone="accent" />
                <Line label={<TaxTerm termKey="medical_tax_credit"><span>Less: medical tax credit</span></TaxTerm>}
                  hint={medicalMembers > 0 ? `${medicalMembers} members on a scheme` : "No medical aid spend logged"}
                  value={`− ${money(steps.medicalCredit)}`} tone="accent" />
                <Line label="Estimated annual tax" value={money(steps.annualTax)} strong />
                <Line label={<TaxTerm termKey="paye"><span>Estimated monthly PAYE</span></TaxTerm>}
                  hint="Annual tax ÷ 12" value={money(steps.monthlyTax)} />
                <Line label={<TaxTerm termKey="effective_rate"><span>Effective tax rate</span></TaxTerm>}
                  value={`${steps.effectiveRate.toFixed(1)}%`} />
              </div>

              <p className="mt-5 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-[13px]">
                {Math.abs(balance) < 500 ? (
                  <>Based on this estimate, you are likely to <span className="text-foreground">break even</span> at tax year end.</>
                ) : balance > 0 ? (
                  <>Based on this estimate, you are likely to receive a refund of approximately{" "}
                    <span className="text-accent">{money(balance)}</span> at tax year end.</>
                ) : (
                  <>Based on this estimate, you are likely to owe approximately{" "}
                    <span className="text-alert">{money(-balance)}</span> at tax year end.</>
                )}
                <span className="text-muted-foreground"> Comparing {monthsSoFar} months of estimated PAYE paid against your liability so far.</span>
              </p>
            </section>

            {/* ---------- provisional ---------- */}
            {isProvisional && (
              <section className="panel p-6">
                <p className="label-xs mb-3 flex items-center gap-2">
                  <Calendar className="size-3.5" />
                  <TaxTerm termKey="provisional_tax"><span>Provisional tax</span></TaxTerm>
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-hairline bg-surface-2 px-4 py-3">
                    <p className="label-xs">First period · due 31 August</p>
                    <p className="numeric text-lg font-semibold">{money(firstPeriod)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      Half your estimated annual tax, less PAYE withheld.
                      {daysTo(augDate) >= 0 ? ` First period payment due in ${daysTo(augDate)} days.` : " This period has passed."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-hairline bg-surface-2 px-4 py-3">
                    <p className="label-xs">Second period · due 28 February</p>
                    <p className="numeric text-lg font-semibold">{money(secondPeriod)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      The balance of the year's liability.
                      {daysTo(febDate) >= 0 ? ` Due in ${daysTo(febDate)} days.` : ""}
                    </p>
                  </div>
                </div>
                <Disclaimer compact />
              </section>
            )}

            {/* ---------- Section 3: deduction tracker ---------- */}
            <section className="panel p-6">
              <p className="label-xs mb-1 flex items-center gap-2"><Receipt className="size-3.5" /> Deduction tracker</p>
              <h2 className="text-lg font-display font-bold tracking-tight">What you can claim this tax year</h2>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {hasRa && (
                  <Card title="Retirement Annuity">
                    <Progress value={raLogged} max={Math.max(1, raCap)} />
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      {money(raLogged)} logged against a limit of {money(raCap)} ({RA_DEDUCTION_PCT}% of income, or {money(RA_DEDUCTION_CAP)} — whichever is lower).
                      You have {money(Math.max(0, raCap - raLogged))} of deductible RA space remaining this tax year.
                    </p>
                  </Card>
                )}

                <Card title="Medical Aid">
                  <p className="numeric text-lg font-semibold">{money(medicalLogged)}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Contributions logged this tax year. Your estimated medical tax credit is {money(medicalCredit)}
                    {medicalMembers > 0 ? ` (${medicalMembers} members).` : " — log medical aid spend to claim it."}
                  </p>
                </Card>

                {hasHomeOffice && (
                  <Card title="Home Office">
                    <p className="numeric text-lg font-semibold">{money(homeOfficeDeduction)}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {(homeShare * 100).toFixed(0)}% of your home is your office
                      ({taxProfile?.home_office_area_m2}m² of {taxProfile?.home_total_area_m2}m²), applied to rent or bond,
                      electricity, rates and internet. Your estimated home office deduction is {money(homeOfficeDeduction)} for
                      {" "}{monthsSoFar} months worked from home this tax year.
                    </p>
                  </Card>
                )}

                {hasTravel && (
                  <Card title="Travel allowance">
                    <p className="numeric text-lg font-semibold">{money(travelDeduction)}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      You have logged {businessKm.toLocaleString()} business km this tax year at the SARS rate of R{SARS_KM_RATE}/km,
                      giving a deductible travel amount of {money(travelDeduction)}.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <input type="number" min="0" value={km} onChange={(e) => setKm(e.target.value)}
                        placeholder="Business km this tax year" className="field flex-1" />
                      <button onClick={saveKm} className="btn-accent px-4 text-[13px] font-semibold">Save</button>
                    </div>
                  </Card>
                )}

                <Card title="Donations (Section 18A)">
                  <Progress value={donationsLogged} max={Math.max(1, donationLimit)} />
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {money(donationsLogged)} logged against a {DONATION_LIMIT_PCT}% of taxable income limit of {money(donationLimit)}.
                    Only donations to SARS-approved{" "}
                    <TaxTerm termKey="section_18a"><span className="text-foreground">Section 18A</span></TaxTerm>{" "}
                    organisations qualify. Check with the organisation before claiming.
                  </p>
                </Card>

                <Card title="Professional development">
                  <p className="numeric text-lg font-semibold">{money(profDev)}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Mark the education costs that are work-related to include them.
                  </p>
                  <div className="mt-3 flex flex-col gap-1.5">
                    {workRelated.length === 0 && <p className="text-[12px] text-muted-foreground">No education expenses logged yet.</p>}
                    {workRelated.map((e) => (
                      <label key={e.id} className="flex items-center gap-2 text-[12px]">
                        <input type="checkbox" checked={!!e.work_related}
                          onChange={(ev) => toggleWorkRelated(e.id, ev.target.checked)} />
                        <span className="flex-1 truncate">{e.name}</span>
                        <span className="numeric text-muted-foreground">{money(Number(e.amount))}</span>
                      </label>
                    ))}
                  </div>
                </Card>
              </div>

              <p className="mt-5 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-[13px]">
                Total estimated deductions: <span className="text-foreground">{money(totalDeductions)}</span>.
                Estimated tax saving from deductions: <span className="text-accent">{money(taxSaving)}</span>.
              </p>
              <Disclaimer compact />
            </section>

            {/* ---------- Section 4: calendar ---------- */}
            <section className="panel p-6">
              <p className="label-xs mb-1 flex items-center gap-2"><Calendar className="size-3.5" /> Tax calendar</p>
              <h2 className="text-lg font-display font-bold tracking-tight">Dates that apply to you</h2>
              <div className="mt-5 flex flex-col gap-2">
                {deadlines.map((d) => {
                  const tone = d.past
                    ? "border-hairline bg-surface-2 opacity-50"
                    : d.daysAway <= 30
                      ? "border-alert/40 bg-alert/[0.06]"
                      : d.daysAway <= 60
                        ? "border-caution/40 bg-caution/[0.06]"
                        : "border-hairline bg-surface-2";
                  return (
                    <div key={d.key} className={`rounded-xl border px-4 py-3 ${tone}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {d.date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                          {d.past ? " · passed" : ` · in ${d.daysAway} days`}
                        </p>
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">{d.action}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ---------- Section 5: eFiling guide ---------- */}
            <AutoAssessmentCallout />
            <section className="panel p-6">
              <p className="label-xs mb-1 flex items-center gap-2"><CheckCircle2 className="size-3.5" /> How to file your taxes</p>
              <h2 className="mb-4 text-lg font-display font-bold tracking-tight">
                Your <TaxTerm termKey="efiling"><span>eFiling</span></TaxTerm> walkthrough, step by step
              </h2>
              <GuideAccordion steps={guideSteps} />
            </section>

            {/* ---------- Section 6: glossary ---------- */}
            <section className="panel p-6">
              <p className="label-xs mb-1 flex items-center gap-2"><BookOpen className="size-3.5" /> Tax glossary</p>
              <h2 className="mb-4 text-lg font-display font-bold tracking-tight">Every term, in plain language</h2>
              <GlossaryList />
            </section>

            <Disclaimer />
          </>
        )}
      </main>
    </div>
  );
}

function Disclaimer({ compact }: { compact?: boolean }) {
  return (
    <p className={`flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground ${compact ? "mt-4" : ""}`}>
      <Info className="mt-0.5 size-3.5 shrink-0" />
      {TAX_CENTRE_DISCLAIMER}
    </p>
  );
}

function Line({ label, hint, value, tone, strong }: {
  label: React.ReactNode; hint?: string; value: string;
  tone?: "accent"; strong?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 border-b border-hairline py-2.5 ${strong ? "border-b-2" : ""}`}>
      <div className="min-w-0">
        <div className={`text-[13px] ${strong ? "font-semibold" : ""}`}>{label}</div>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <span className={`numeric shrink-0 text-[13px] ${tone === "accent" ? "text-accent" : ""} ${strong ? "text-base font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-2 px-4 py-4">
      <p className="label-xs mb-2">{title}</p>
      {children}
    </div>
  );
}

function Progress({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / Math.max(1, max)) * 100);
  const over = value > max;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-background">
      <div className={`h-full ${over ? "bg-alert" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
