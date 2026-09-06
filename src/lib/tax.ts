/**
 * South African tax intelligence.
 *
 * All figures come from the SARS published individual tax tables for the
 * 2025/26 year of assessment (the latest tables published at build time) and
 * are estimates for planning only.
 */

export const TAX_DISCLAIMER =
  "Tax calculations are estimates based on SARS published tables and are for planning purposes only. Consult a registered tax practitioner for your official eFiling submission.";

export const TAX_TABLE_LABEL = "SARS individual tables, 2025/26";

type Bracket = { upTo: number; base: number; rate: number; from: number };

const BRACKETS: Bracket[] = [
  { from: 0, upTo: 237_100, base: 0, rate: 0.18 },
  { from: 237_100, upTo: 370_500, base: 42_678, rate: 0.26 },
  { from: 370_500, upTo: 512_800, base: 77_362, rate: 0.31 },
  { from: 512_800, upTo: 673_000, base: 121_475, rate: 0.36 },
  { from: 673_000, upTo: 857_900, base: 179_147, rate: 0.39 },
  { from: 857_900, upTo: 1_817_000, base: 251_258, rate: 0.41 },
  { from: 1_817_000, upTo: Infinity, base: 644_489, rate: 0.45 },
];

export const PRIMARY_REBATE = 17_235;
/** Monthly medical scheme fees tax credit. */
export const MEDICAL_CREDIT_FIRST_TWO = 364;
export const MEDICAL_CREDIT_ADDITIONAL = 246;
/** Retirement fund contributions: deductible up to 27.5% of taxable income, capped. */
export const RA_DEDUCTION_PCT = 27.5;
export const RA_DEDUCTION_CAP = 350_000;

/** SA tax year: 1 March → end of February. */
export function taxYear(now = new Date()): { start: Date; end: Date; label: string; startYear: number } {
  const y = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: new Date(y, 2, 1),
    end: new Date(y + 1, 1, new Date(y + 1, 2, 0).getDate()),
    label: `${y}/${String((y + 1) % 100).padStart(2, "0")}`,
    startYear: y,
  };
}

export function annualTaxBeforeRebate(taxable: number): number {
  const t = Math.max(0, taxable);
  const b = BRACKETS.find((x) => t <= x.upTo) ?? BRACKETS[BRACKETS.length - 1]!;
  return b.base + (t - b.from) * b.rate;
}

export type PayeEstimate = {
  annualIncome: number;
  deductions: number;
  taxableIncome: number;
  annualTax: number;
  monthlyTax: number;
  effectiveRate: number;
  marginalRate: number;
  medicalCredits: number;
};

export function estimatePaye(params: {
  annualIncome: number;
  deductions?: number;
  medicalMembers?: number;
}): PayeEstimate {
  const annualIncome = Math.max(0, params.annualIncome);
  const deductions = Math.max(0, params.deductions ?? 0);
  const taxableIncome = Math.max(0, annualIncome - deductions);
  const members = Math.max(0, params.medicalMembers ?? 0);
  const medicalCredits =
    12 *
    (Math.min(members, 2) * MEDICAL_CREDIT_FIRST_TWO + Math.max(0, members - 2) * MEDICAL_CREDIT_ADDITIONAL);

  const gross = annualTaxBeforeRebate(taxableIncome);
  const annualTax = Math.max(0, gross - PRIMARY_REBATE - medicalCredits);
  const bracket = BRACKETS.find((x) => taxableIncome <= x.upTo) ?? BRACKETS[BRACKETS.length - 1]!;

  return {
    annualIncome,
    deductions,
    taxableIncome,
    annualTax,
    monthlyTax: annualTax / 12,
    effectiveRate: annualIncome > 0 ? (annualTax / annualIncome) * 100 : 0,
    marginalRate: bracket.rate * 100,
    medicalCredits,
  };
}

/** Deductible cap on retirement contributions for a given taxable income. */
export function raDeductionCap(taxableIncome: number): number {
  return Math.min(RA_DEDUCTION_CAP, Math.max(0, taxableIncome) * (RA_DEDUCTION_PCT / 100));
}

/* ---------------- provisional tax ---------------- */

export type ProvisionalDate = { label: string; date: Date; amount: number; daysAway: number };

/**
 * Provisional taxpayers pay in two instalments: 31 August (first period) and
 * the last day of February (second period). Each is roughly half the year's
 * liability on non-PAYE income.
 */
export function provisionalDates(annualLiability: number, now = new Date()): ProvisionalDate[] {
  const ty = taxYear(now);
  const aug = new Date(ty.startYear, 7, 31);
  const feb = ty.end;
  const days = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  return [
    { label: "First provisional payment", date: aug, amount: annualLiability / 2, daysAway: days(aug) },
    { label: "Second provisional payment", date: feb, amount: annualLiability / 2, daysAway: days(feb) },
  ].filter((d) => d.daysAway >= 0);
}

/* ---------------- deductible expense detection ---------------- */

export type DeductionRule = {
  category: string;
  label: string;
  note: string;
  /** Share of the logged amount that is typically claimable. */
  claimablePct: number;
  /** Only counts when the user flagged this in Settings. */
  requiresWfh?: boolean;
};

export const DEDUCTION_RULES: DeductionRule[] = [
  {
    category: "household",
    label: "Home office",
    note: "A portion of rent, rates, electricity and internet is claimable when you work from home more than half the time.",
    claimablePct: 0.15,
    requiresWfh: true,
  },
  {
    category: "medical_aid",
    label: "Medical above the credit",
    note: "Qualifying medical spend above the SARS medical scheme tax credit can be claimed as an additional credit.",
    claimablePct: 1,
  },
  {
    category: "investments",
    label: "Retirement annuity",
    note: "Retirement fund contributions are deductible up to 27.5% of taxable income (max R350,000 a year).",
    claimablePct: 1,
  },
  {
    category: "education",
    label: "Professional development",
    note: "Course fees and professional bodies tied to your trade may be deductible.",
    claimablePct: 1,
  },
];

export type DeductionLine = {
  rule: DeductionRule;
  logged: number;
  claimable: number;
  capped: boolean;
};

export function trackDeductions(params: {
  byCategory: Record<string, number>;
  taxableIncome: number;
  worksFromHome: boolean;
  medicalMembers: number;
}): { lines: DeductionLine[]; total: number } {
  const lines: DeductionLine[] = [];
  for (const rule of DEDUCTION_RULES) {
    if (rule.requiresWfh && !params.worksFromHome) continue;
    const logged = Number(params.byCategory[rule.category] ?? 0);
    if (logged <= 0) continue;

    let claimable = logged * rule.claimablePct;
    let capped = false;

    if (rule.category === "investments") {
      const cap = raDeductionCap(params.taxableIncome);
      if (claimable > cap) {
        claimable = cap;
        capped = true;
      }
    }
    if (rule.category === "medical_aid") {
      const credit =
        12 *
        (Math.min(params.medicalMembers, 2) * MEDICAL_CREDIT_FIRST_TWO +
          Math.max(0, params.medicalMembers - 2) * MEDICAL_CREDIT_ADDITIONAL);
      claimable = Math.max(0, logged - credit);
      capped = claimable < logged;
    }

    lines.push({ rule, logged, claimable, capped });
  }
  return { lines, total: lines.reduce((s, l) => s + l.claimable, 0) };
}

/* ------------------------------------------------------------------ *
 * Tax Centre — rebates, step-by-step estimate, deadlines
 * ------------------------------------------------------------------ */

export const TAX_CENTRE_DISCLAIMER =
  "All tax figures are estimates based on SARS published tables for the current tax year and are for planning purposes only. Consult a registered tax practitioner for your official eFiling submission.";

export const SECONDARY_REBATE = 9_444;
export const TERTIARY_REBATE = 3_145;
/** SARS prescribed rate per business kilometre (simplified method). */
export const SARS_KM_RATE = 4.84;
/** Section 18A donations are deductible up to 10% of taxable income. */
export const DONATION_LIMIT_PCT = 10;

export function rebateForAge(age: number): { total: number; label: string } {
  if (age >= 75) return { total: PRIMARY_REBATE + SECONDARY_REBATE + TERTIARY_REBATE, label: "Primary + secondary + tertiary rebate (75+)" };
  if (age >= 65) return { total: PRIMARY_REBATE + SECONDARY_REBATE, label: "Primary + secondary rebate (65–74)" };
  return { total: PRIMARY_REBATE, label: "Primary rebate (under 65)" };
}

export function medicalCreditAnnual(members: number): number {
  const m = Math.max(0, members);
  return 12 * (Math.min(m, 2) * MEDICAL_CREDIT_FIRST_TWO + Math.max(0, m - 2) * MEDICAL_CREDIT_ADDITIONAL);
}

export function marginalRate(taxableIncome: number): number {
  const b = BRACKETS.find((x) => taxableIncome <= x.upTo) ?? BRACKETS[BRACKETS.length - 1]!;
  return b.rate * 100;
}

export type TaxSteps = {
  grossAnnual: number;
  raContributions: number;
  raCap: number;
  raDeduction: number;
  taxableIncome: number;
  grossTax: number;
  rebate: number;
  rebateLabel: string;
  medicalCredit: number;
  annualTax: number;
  monthlyTax: number;
  effectiveRate: number;
  marginalRate: number;
};

/** The full SARS calculation, step by step, so the user can follow the maths. */
export function estimateTaxSteps(params: {
  grossAnnual: number;
  raContributions?: number;
  medicalMembers?: number;
  age?: number;
}): TaxSteps {
  const grossAnnual = Math.max(0, params.grossAnnual);
  const raContributions = Math.max(0, params.raContributions ?? 0);
  // The 27.5% cap is measured against income before the RA deduction.
  const raCap = raDeductionCap(grossAnnual);
  const raDeduction = Math.min(raContributions, raCap);
  const taxableIncome = Math.max(0, grossAnnual - raDeduction);
  const grossTax = annualTaxBeforeRebate(taxableIncome);
  const { total: rebate, label: rebateLabel } = rebateForAge(params.age ?? 30);
  const medicalCredit = medicalCreditAnnual(params.medicalMembers ?? 0);
  const annualTax = Math.max(0, grossTax - rebate - medicalCredit);
  return {
    grossAnnual,
    raContributions,
    raCap,
    raDeduction,
    taxableIncome,
    grossTax,
    rebate,
    rebateLabel,
    medicalCredit,
    annualTax,
    monthlyTax: annualTax / 12,
    effectiveRate: grossAnnual > 0 ? (annualTax / grossAnnual) * 100 : 0,
    marginalRate: marginalRate(taxableIncome),
  };
}

/** Months elapsed in the current SA tax year, including the current month. */
export function monthsElapsedInTaxYear(now = new Date()): number {
  const ty = taxYear(now);
  return (now.getFullYear() - ty.startYear) * 12 + (now.getMonth() - 2) + 1;
}

export type Deadline = {
  key: string;
  name: string;
  action: string;
  date: Date;
  daysAway: number;
  past: boolean;
};

/** SARS deadlines that apply to this taxpayer, in date order. */
export function taxDeadlines(opts: { provisional: boolean }, now = new Date()): Deadline[] {
  const ty = taxYear(now);
  const y = ty.startYear;
  const raw: { key: string; name: string; action: string; date: Date; only?: "prov" | "nonprov" }[] = [
    { key: "year_start", name: "New tax year begins", action: "A fresh deduction tracker starts. Keep logging medical aid, retirement and home office costs.", date: new Date(y, 2, 1) },
    { key: "efiling_open", name: "eFiling season opens", action: "Check your IRP5 has been submitted by your employer, then log in to eFiling.", date: new Date(y, 6, 7) },
    { key: "prov_1", name: "Provisional tax — first period (IRP6)", action: "Pay roughly half your estimated annual tax on non-PAYE income.", date: new Date(y, 7, 31), only: "prov" },
    { key: "efiling_close", name: "eFiling deadline — non-provisional", action: "Submit your ITR12 return for the past tax year.", date: new Date(y, 9, 20), only: "nonprov" },
    { key: "efiling_close_prov", name: "eFiling deadline — provisional taxpayers", action: "Submit your ITR12 return for the past tax year.", date: new Date(y + 1, 0, 19), only: "prov" },
    { key: "prov_2", name: "Provisional tax — second period (IRP6)", action: "Top up the balance of your estimated annual tax before the year closes.", date: new Date(y + 1, 1, ty.end.getDate()), only: "prov" },
    { key: "year_end", name: "Tax year ends", action: "Last day to make retirement annuity contributions that count for this tax year.", date: ty.end },
  ];
  return raw
    .filter((d) => !d.only || (d.only === "prov" ? opts.provisional : !opts.provisional))
    .map((d) => {
      const daysAway = Math.ceil((d.date.getTime() - now.getTime()) / 86_400_000);
      return { key: d.key, name: d.name, action: d.action, date: d.date, daysAway, past: daysAway < 0 };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
