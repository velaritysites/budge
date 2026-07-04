import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useProfile } from "@/hooks/use-profile";
import { CATEGORY_LABELS, type ExpenseCategory, type ExpenseFrequency, monthlyEquivalent } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { Plus, Trash2, Calculator, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/planner")({
  head: () => ({ meta: [{ title: "Salary Planner — Budge" }] }),
  component: PlannerPage,
});

type IdealExpense = {
  id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
};

const CATEGORIES: ExpenseCategory[] = [
  "housing_rent", "transport_fuel", "vehicle_finance", "insurance",
  "medical_insurance", "groceries", "debt", "subscriptions", "food", "other",
];

function PlannerPage() {
  const { data: profile } = useProfile();
  const [items, setItems] = useState<IdealExpense[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("housing_rent");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [leftover, setLeftover] = useState("");
  const [taxRatePct, setTaxRatePct] = useState<string>(() => {
    if (!profile) return "25";
    const g = Number(profile.gross_income ?? 0);
    const n = Number(profile.net_income ?? 0);
    if (g > 0 && n > 0 && n <= g) return ((1 - n / g) * 100).toFixed(1);
    return "25";
  });

  const currency = profile?.currency_code ?? "USD";

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!name || !amt) return;
    setItems([...items, { id: crypto.randomUUID(), name, amount: amt, category, frequency }]);
    setName(""); setAmount("");
  }

  function removeItem(id: string) {
    setItems(items.filter((i) => i.id !== id));
  }

  const monthlyExpenses = useMemo(
    () => items.reduce((s, i) => s + monthlyEquivalent(i), 0),
    [items],
  );

  const leftoverNum = parseFloat(leftover || "0");
  const requiredNet = monthlyExpenses + leftoverNum;
  const taxRate = Math.max(0, Math.min(80, parseFloat(taxRatePct || "0"))) / 100;
  const requiredGross = taxRate < 1 ? requiredNet / (1 - taxRate) : requiredNet;
  const currentNet = Number(profile?.net_income ?? 0);
  const gap = requiredNet - currentNet;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Calculator className="size-3.5" /> Salary Planner
        </span>
        <span className="text-xs text-muted-foreground">
          Ideal monthly: <span className="text-foreground font-mono font-bold">{formatCurrency(monthlyExpenses, currency)}</span>
        </span>
      </header>

      <div className="p-6 md:p-8 max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <section className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic">Work backwards.</h1>
            <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
              Sketch the life you want — every recurring cost, plus how much you'd like left over. We'll tell you what your paycheck needs to be.
            </p>
          </section>

          <form onSubmit={addItem} className="bg-surface border border-border rounded-lg p-5 space-y-3">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Add an ideal expense</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dream apartment"
                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="Amount"
                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}
                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <button type="submit" className="w-full bg-accent text-accent-foreground rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2">
              <Plus className="size-3.5" /> Add
            </button>
          </form>

          <div className="space-y-1">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
                Start sketching your ideal life above.
              </p>
            ) : items.map((i) => (
              <div key={i.id} className="group flex items-center gap-3 p-3 hover:bg-surface rounded-lg transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{i.name}</span>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                      {CATEGORY_LABELS[i.category]} · {i.frequency}
                    </span>
                  </div>
                </div>
                <span className="font-mono text-sm">
                  {formatCurrency(i.amount, currency)}
                  {i.frequency !== "monthly" && (
                    <span className="text-muted-foreground text-xs"> ({formatCurrency(monthlyEquivalent(i), currency)}/mo)</span>
                  )}
                </span>
                <button onClick={() => removeItem(i.id)}
                  className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-alert">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-surface border border-border rounded-xl p-5 space-y-4 sticky top-6">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Your target</h3>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Leftover per month after expenses</label>
              <input type="number" step="0.01" value={leftover} onChange={(e) => setLeftover(e.target.value)} placeholder="0.00"
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-lg font-mono font-bold focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Effective tax rate</label>
              <div className="flex items-center gap-2">
                <input type="number" step="0.5" min="0" max="80" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              {profile && Number(profile.gross_income) > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Pre-filled from your current gross/net ratio. Adjust if your bracket would change.
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-border space-y-3">
              <ResultRow label="Ideal monthly expenses" value={formatCurrency(monthlyExpenses, currency)} />
              <ResultRow label="+ Leftover target" value={formatCurrency(leftoverNum, currency)} />
              <ResultRow label="Required NET / month" value={formatCurrency(requiredNet, currency)} strong />
              <ResultRow label={`Required GROSS / month`} value={formatCurrency(requiredGross, currency)} strong accent />
              <ResultRow label="Annual gross" value={formatCurrency(requiredGross * 12, currency)} muted />
            </div>

            {profile && currentNet > 0 && (
              <div className={`rounded-lg p-3 text-xs ${gap <= 0 ? "bg-accent/10 text-accent border border-accent/20" : "bg-caution/10 text-caution border border-caution/20"}`}>
                {gap <= 0 ? (
                  <>Your current take-home already covers this by <span className="font-mono font-bold">{formatCurrency(-gap, currency)}</span>/mo. Nice.</>
                ) : (
                  <>You'd need <span className="font-mono font-bold">{formatCurrency(gap, currency)}</span> more per month (net) to fund this lifestyle.</>
                )}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground leading-relaxed pt-2 border-t border-border">
              Rough estimate — real payroll deductions vary by locale, pension, benefits, and bracket edges. Use it as a target, not a payslip.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ label, value, strong, muted, accent }: { label: string; value: string; strong?: boolean; muted?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={`text-xs ${muted ? "text-muted-foreground/70" : "text-muted-foreground"}`}>{label}</span>
      <span className={`font-mono ${strong ? "text-lg font-bold" : "text-sm"} ${accent ? "text-accent" : muted ? "text-muted-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
