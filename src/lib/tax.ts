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
