export type DebtAccountType =
  | "credit_card"
  | "personal_loan"
  | "store_account"
  | "vehicle_finance"
  | "home_loan";

export const DEBT_TYPE_LABELS: Record<DebtAccountType, string> = {
  credit_card: "Credit card",
  personal_loan: "Personal loan",
  store_account: "Store account",
  vehicle_finance: "Vehicle finance",
  home_loan: "Home loan",
};

export type Debt = {
  id: string;
  name: string;
  balance: number;
  interest_rate: number; // annual %
  min_payment: number;
  account_type: DebtAccountType;
};

export type PayoffStep = {
  id: string;
  name: string;
  monthsToClear: number;
  clearedLabel: string;
  interestPaid: number;
};

export type PayoffResult = {
  strategy: "avalanche" | "snowball";
  order: PayoffStep[];
  totalInterest: number;
  totalMonths: number;
  firstWinMonths: number;
  monthlyPayment: number;
  impossible: boolean;
};

function monthLabel(start: Date, monthsAhead: number): string {
  const d = new Date(start.getFullYear(), start.getMonth() + monthsAhead, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Simulate a debt payoff plan month by month. */
export function simulatePayoff(
  debts: Debt[],
  strategy: "avalanche" | "snowball",
  extraPayment = 0,
  start = new Date(),
): PayoffResult {
  const working = debts.map((d) => ({ ...d, remaining: Math.max(0, d.balance), interest: 0 }));
  const totalMinimums = working.reduce((s, d) => s + Math.max(0, d.min_payment), 0);
  const budget = totalMinimums + Math.max(0, extraPayment);
  const order: PayoffStep[] = [];
  let month = 0;
  let impossible = false;

  const sortFn = (a: typeof working[number], b: typeof working[number]) =>
    strategy === "avalanche" ? b.interest_rate - a.interest_rate : a.remaining - b.remaining;

  while (working.some((d) => d.remaining > 0.01)) {
    if (month >= 600) {
      impossible = true;
      break;
    }
    month++;

    // accrue interest
    for (const d of working) {
      if (d.remaining <= 0) continue;
      const i = (d.remaining * (d.interest_rate / 100)) / 12;
      d.remaining += i;
      d.interest += i;
    }

    let pool = budget;
    // minimums first
    for (const d of working) {
      if (d.remaining <= 0 || pool <= 0) continue;
      const pay = Math.min(d.remaining, Math.max(0, d.min_payment), pool);
      d.remaining -= pay;
      pool -= pay;
    }
    // everything left goes to the focus debt
    const queue = working.filter((d) => d.remaining > 0.01).sort(sortFn);
    for (const d of queue) {
      if (pool <= 0.01) break;
      const pay = Math.min(d.remaining, pool);
      d.remaining -= pay;
      pool -= pay;
    }

    for (const d of working) {
      if (d.remaining <= 0.01 && !order.some((o) => o.id === d.id)) {
        d.remaining = 0;
        order.push({
          id: d.id,
          name: d.name,
          monthsToClear: month,
          clearedLabel: monthLabel(start, month - 1),
          interestPaid: Math.round(d.interest * 100) / 100,
        });
      }
    }

    // no progress at all — minimums don't cover interest
    if (working.every((d) => d.remaining > 0.01) && budget <= 0) {
      impossible = true;
      break;
    }
  }

  return {
    strategy,
    order,
    totalInterest: Math.round(working.reduce((s, d) => s + d.interest, 0) * 100) / 100,
    totalMonths: month,
    firstWinMonths: order[0]?.monthsToClear ?? 0,
    monthlyPayment: budget,
    impossible,
  };
}
