import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useExpenses, useProfile } from "@/hooks/use-profile";
import { computeTotals, evaluateAffordability, monthlyEquivalent, VERDICT_LABEL, CATEGORY_LABELS, type Verdict, type ExpenseCategory, type ExpenseFrequency } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { upsertCurrentMonthSnapshot } from "@/lib/snapshot";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, PlusCircle, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/checker")({
  head: () => ({ meta: [{ title: "Affordability Checker — Budge" }] }),
  component: CheckerPage,
});

const CATEGORIES: ExpenseCategory[] = [
  "housing_rent", "transport_fuel", "vehicle_finance", "insurance",
  "medical_insurance", "groceries", "debt", "subscriptions", "food", "other",
];

function CheckerPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [recurring, setRecurring] = useState(false);
  const [result, setResult] = useState<{ verdict: Verdict; reasoning: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<ExpenseCategory>("subscriptions");
  const [addFrequency, setAddFrequency] = useState<ExpenseFrequency>("monthly");

  const { data: history = [] } = useQuery({
    queryKey: ["affordability_checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affordability_checks")
        .select("id, item_name, amount, is_recurring, verdict, reasoning, created_at, currency_code")
        .order("created_at", { ascending: false }).limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    if (!profile) return null;
    return computeTotals(Number(profile.net_income), Number(profile.gross_income), expenses);
  }, [profile, expenses]);

  const debtMonthly = useMemo(
    () => expenses.filter((e) => e.category === "debt").reduce((s, e) => s + monthlyEquivalent(e), 0),
    [expenses],
  );

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !totals) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    setSubmitting(true);
    const evaluation = evaluateAffordability({
      amount: amt, isRecurring: recurring, totals,
      safetyBufferPct: Number(profile.safety_buffer_pct),
      debtMonthly, grossIncome: Number(profile.gross_income),
    });
    setResult(evaluation);
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("affordability_checks").insert({
        user_id: u.user.id, item_name: name || "Untitled", amount: amt,
        is_recurring: recurring, verdict: evaluation.verdict, reasoning: evaluation.reasoning,
        currency_code: profile.currency_code,
      });
      qc.invalidateQueries({ queryKey: ["affordability_checks"] });
    }
    setSubmitting(false);
  }

  async function addToExpenses() {
    if (!profile) return;
    const amt = parseFloat(amount);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || !amt) return;
    const { error } = await supabase.from("expenses").insert({
      user_id: u.user.id, name: name || "New commitment", amount: amt,
      category: addCategory, frequency: addFrequency, is_fixed: true,
    });
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["expenses"] });
    await upsertCurrentMonthSnapshot({
      netIncome: Number(profile.net_income), grossIncome: Number(profile.gross_income),
      expenses, currencyCode: profile.currency_code,
    });
    setAddOpen(false);
    toast.success("Added to your expenses");
  }

  if (!profile) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Affordability Checker</span>
      </header>

      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full space-y-10">
        <section className="space-y-2 animate-enter">
          <h1 className="text-4xl md:text-5xl font-display font-extrabold tracking-tight">Thinking it through.</h1>
          <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
            Give us the item and amount. We'll do the math against your real numbers and tell you straight.
          </p>
        </section>

        <form onSubmit={handleCheck} className="space-y-6 animate-enter [animation-delay:100ms]">
          <Field label="What is it?">
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New bike, gym membership"
              className="w-full panel px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
          </Field>
          <Field label={`Amount (${profile.currency_code})`}>
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              className="w-full panel px-3 py-3 text-2xl font-bold tracking-tight focus:outline-none focus:ring-1 focus:ring-accent" />
          </Field>
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Cost type</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRecurring(false)}
                className={`py-3 rounded-lg border text-sm font-medium transition-colors ${!recurring ? "bg-foreground text-background border-foreground" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}>One-off</button>
              <button type="button" onClick={() => setRecurring(true)}
                className={`py-3 rounded-lg border text-sm font-medium transition-colors ${recurring ? "bg-foreground text-background border-foreground" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}>Recurring (monthly)</button>
            </div>
          </div>
          <button type="submit" disabled={submitting}
            className="w-full btn-accent py-3 text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
            Run the check
          </button>
        </form>

        {result && (
          <div className="space-y-3">
            <VerdictCard result={result} />
            {recurring && (
              <button onClick={() => setAddOpen(true)}
                className="w-full flex items-center justify-center gap-2 border border-border bg-surface rounded-lg py-3 text-sm font-medium hover:bg-background transition">
                <PlusCircle className="size-4" /> Add this to my expenses
              </button>
            )}
          </div>
        )}

        <section className="space-y-3 animate-enter [animation-delay:200ms]">
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Recent checks</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. Run a check above to start a log.</p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {history.map((h: any) => (
                <div key={h.id} className="p-4 flex items-center gap-4 bg-surface/50">
                  <VerdictDot verdict={h.verdict} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{h.item_name}</span>
                      <span className="font-mono text-xs">
                        {formatCurrency(Number(h.amount), h.currency_code ?? profile.currency_code)}
                        {h.is_recurring ? "/mo" : ""}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{h.reasoning}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAddOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="panel p-6 w-full max-w-sm space-y-4 animate-enter">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Add to expenses</h3>
              <button onClick={() => setAddOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">
              Adding <span className="text-foreground font-medium">{name || "this commitment"}</span> at {formatCurrency(parseFloat(amount) || 0, profile.currency_code)}.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Category</label>
              <select value={addCategory} onChange={(e) => setAddCategory(e.target.value as ExpenseCategory)}
                className="field">
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Frequency</label>
              <select value={addFrequency} onChange={(e) => setAddFrequency(e.target.value as ExpenseFrequency)}
                className="field">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <button onClick={addToExpenses} className="w-full btn-accent py-2.5 text-sm font-bold">
              Add expense
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function VerdictDot({ verdict }: { verdict: Verdict }) {
  const c = verdict === "comfortable" ? "bg-accent" : verdict === "tight" ? "bg-caution" : "bg-alert";
  return <span className={`size-2 rounded-full shrink-0 ${c}`} />;
}

function VerdictCard({ result }: { result: { verdict: Verdict; reasoning: string } }) {
  const v = result.verdict;
  const Icon = v === "comfortable" ? CheckCircle2 : v === "tight" ? AlertTriangle : XCircle;
  const tone = v === "comfortable" ? "border-accent/30 bg-accent/5 text-accent"
    : v === "tight" ? "border-caution/30 bg-caution/5 text-caution"
    : "border-alert/30 bg-alert/5 text-alert";
  return (
    <div className={`border rounded-lg p-6 animate-enter ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon className="size-5" />
        <span className="text-[10px] font-mono uppercase tracking-widest font-bold">{VERDICT_LABEL[v]}</span>
      </div>
      <p className="mt-3 text-sm text-foreground leading-relaxed">{result.reasoning}</p>
    </div>
  );
}
