export type ExpenseFrequency = "monthly" | "weekly" | "yearly" | "one_off";
export type ExpenseCategory =
  | "housing_rent"
  | "transport_fuel"
  | "vehicle_finance"
  | "insurance"
  | "medical_insurance"
  | "groceries"
  | "debt"
  | "subscriptions"
  | "food"
  | "other";

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  housing_rent: "Housing/Rent",
  transport_fuel: "Transport/Fuel",
  vehicle_finance: "Vehicle Finance",
  insurance: "Insurance",
  medical_insurance: "Medical Insurance",
  groceries: "Groceries",
  debt: "Debt",
  subscriptions: "Subscriptions",
  food: "Food",
  other: "Other",
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  housing_rent: "hsl(142 45% 62%)",
  transport_fuel: "hsl(200 70% 60%)",
  vehicle_finance: "hsl(220 60% 65%)",
  insurance: "hsl(180 45% 60%)",
  medical_insurance: "hsl(340 55% 65%)",
  groceries: "hsl(90 50% 60%)",
  debt: "hsl(0 70% 60%)",
  subscriptions: "hsl(270 50% 65%)",
  food: "hsl(38 82% 65%)",
  other: "hsl(220 10% 55%)",
};

export type Expense = {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  frequency: ExpenseFrequency;
  is_fixed: boolean;
  due_day?: number | null;
  notify_enabled?: boolean;
  notify_lead_days?: number;
};

/** Convert any expense to a monthly-equivalent amount. One-offs treated as 0/month for recurring math. */
export function monthlyEquivalent(e: Pick<Expense, "amount" | "frequency">): number {
  switch (e.frequency) {
    case "monthly":
      return e.amount;
    case "weekly":
      return (e.amount * 52) / 12;
    case "yearly":
      return e.amount / 12;
    case "one_off":
      return 0;
  }
}

export type Totals = {
  netIncome: number;
  grossIncome: number;
  totalExpenses: number;
  disposable: number;
  savingsRate: number; // percentage
  burnRate: number; // percentage of net used by expenses
  byCategory: Record<ExpenseCategory, number>;
};

export function computeTotals(
  netIncome: number,
  grossIncome: number,
  expenses: Expense[],
): Totals {
  const byCategory: Record<ExpenseCategory, number> = {
    housing_rent: 0,
    transport_fuel: 0,
    vehicle_finance: 0,
    insurance: 0,
    medical_insurance: 0,
    groceries: 0,
    debt: 0,
    subscriptions: 0,
    food: 0,
    other: 0,
  };
  let total = 0;
  for (const e of expenses) {
    const m = monthlyEquivalent(e);
    byCategory[e.category] += m;
    total += m;
  }
  const disposable = netIncome - total;
  const savingsRate = netIncome > 0 ? Math.max(0, (disposable / netIncome) * 100) : 0;
  const burnRate = netIncome > 0 ? (total / netIncome) * 100 : 0;
  return {
    netIncome,
    grossIncome,
    totalExpenses: total,
    disposable,
    savingsRate,
    burnRate,
    byCategory,
  };
}

export type HealthLevel = "tight" | "balanced" | "comfortable";

export function healthLevel(savingsRate: number): HealthLevel {
  if (savingsRate < 10) return "tight";
  if (savingsRate < 25) return "balanced";
  return "comfortable";
}

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  tight: "TIGHT",
  balanced: "BALANCED",
  comfortable: "COMFORTABLE",
};

export type Verdict = "comfortable" | "tight" | "not_recommended";

export const VERDICT_LABEL: Record<Verdict, string> = {
  comfortable: "Comfortable",
  tight: "Tight",
  not_recommended: "Not recommended",
};

export const VERDICT_DOT: Record<Verdict, string> = {
  comfortable: "bg-accent",
  tight: "bg-caution",
  not_recommended: "bg-alert",
};

export function evaluateAffordability(params: {
  amount: number;
  isRecurring: boolean;
  totals: Totals;
  safetyBufferPct: number;
  debtMonthly: number;
  grossIncome: number;
}): { verdict: Verdict; reasoning: string } {
  const { amount, isRecurring, totals, safetyBufferPct, debtMonthly, grossIncome } = params;
  const buffer = (totals.netIncome * safetyBufferPct) / 100;
  const disposableAfter = totals.disposable - amount;
  const remainingAfterBuffer = disposableAfter - buffer;


  // Debt-to-income flag (recurring debt-like cost vs gross)
  const projectedDebtRatio = grossIncome > 0
    ? ((debtMonthly + (isRecurring ? amount : 0)) / grossIncome) * 100
    : 0;

  if (totals.netIncome <= 0) {
    return {
      verdict: "not_recommended",
      reasoning:
        "Set your monthly income first — we need a net income figure to give you a real answer.",
    };
  }

  if (disposableAfter < 0) {
    return {
      verdict: "not_recommended",
      reasoning: isRecurring
        ? `This recurring cost (${pct(amount, totals.netIncome)} of your net income) would push you past what you bring in each month. You'd be ${money(-disposableAfter)} short.`
        : `This purchase is larger than what's left of your monthly disposable income. You'd be ${money(-disposableAfter)} short before your safety buffer.`,
    };
  }

  if (isRecurring && projectedDebtRatio > 36) {
    return {
      verdict: "not_recommended",
      reasoning: `Adding this would push your recurring debt-like obligations to ${projectedDebtRatio.toFixed(0)}% of gross income — above the 36% safe ceiling lenders use. Consider trimming an existing commitment first.`,
    };
  }


  if (remainingAfterBuffer < 0) {
    return {
      verdict: "tight",
      reasoning: isRecurring
        ? `Doable, but it'd eat into your ${safetyBufferPct}% safety buffer (${money(buffer)}/mo). You'd still have ${money(disposableAfter)} left, just less cushion for surprises.`
        : `This is within reach, but it would dip into your safety buffer of ${money(buffer)}. You'd have ${money(disposableAfter)} left this month — workable if nothing unexpected comes up.`,
    };
  }

  // Comfortable
  const pctOfDisposable = totals.disposable > 0 ? (amount / totals.disposable) * 100 : 0;
  return {
    verdict: "comfortable",
    reasoning: isRecurring
      ? `Comfortable fit — that's ${pctOfDisposable.toFixed(0)}% of your monthly disposable income. After it kicks in you'd still have ${money(disposableAfter)} left, well above your ${money(buffer)} buffer.`
      : `Comfortable. This is ${pctOfDisposable.toFixed(0)}% of your remaining disposable income; you'd keep ${money(disposableAfter)} after, plenty above your ${money(buffer)} safety buffer.`,
  };

  function money(n: number) {
    return new Intl.NumberFormat(undefined, {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  }
  function pct(a: number, b: number) {
    if (b <= 0) return "0%";
    return `${((a / b) * 100).toFixed(0)}%`;
  }
}

export function monthKey(d: Date | string): string {
  const dd = typeof d === "string" ? new Date(d) : d;
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-01`;
}

export function currentMonthKey(): string {
  return monthKey(new Date());
}
