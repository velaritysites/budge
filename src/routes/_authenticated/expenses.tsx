import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useExpenses, useProfile } from "@/hooks/use-profile";
import { CATEGORY_LABELS, type ExpenseCategory, type ExpenseFrequency, monthlyEquivalent } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { upsertCurrentMonthSnapshot } from "@/lib/snapshot";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Expenses — CanIAfford" }] }),
  component: ExpensesPage,
});

const CATEGORIES: ExpenseCategory[] = ["housing", "transport", "debt", "subscriptions", "food", "other"];
const FREQUENCIES: { value: ExpenseFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "yearly", label: "Yearly" },
  { value: "one_off", label: "One-off" },
];

function ExpensesPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("housing");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [isFixed, setIsFixed] = useState(true);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");

  async function refresh() {
    const { data: fresh } = await supabase.from("expenses").select("id, name, category, amount, frequency, is_fixed").order("created_at", { ascending: false });
    qc.setQueryData(["expenses"], (fresh ?? []).map((r: any) => ({
      id: r.id, name: r.name, category: r.category, amount: Number(r.amount),
      frequency: r.frequency, is_fixed: r.is_fixed,
    })));
    if (profile) {
      await upsertCurrentMonthSnapshot({
        netIncome: Number(profile.net_income),
        grossIncome: Number(profile.gross_income),
        expenses: (fresh ?? []).map((r: any) => ({
          id: r.id, name: r.name, category: r.category, amount: Number(r.amount),
          frequency: r.frequency, is_fixed: r.is_fixed,
        })),
        currencyCode: profile.currency_code,
      });
    }
  }

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("expenses").insert({
      user_id: u.user.id, name, amount: parseFloat(amount), category, frequency, is_fixed: isFixed,
    });
    if (error) return toast.error(error.message);
    setName(""); setAmount("");
    await refresh();
    toast.success("Added");
  }

  async function deleteExpense(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await refresh();
  }

  async function addBulk() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      const [n, amt, cat] = parts;
      const amtNum = parseFloat(amt);
      if (!n || !amtNum) return null;
      const c = (CATEGORIES as string[]).includes(cat) ? (cat as ExpenseCategory) : "other";
      return { user_id: u.user!.id, name: n, amount: amtNum, category: c, frequency: "monthly" as const, is_fixed: true };
    }).filter(Boolean) as any[];
    if (!rows.length) return toast.error("No valid rows");
    const { error } = await supabase.from("expenses").insert(rows);
    if (error) return toast.error(error.message);
    setBulkText("");
    await refresh();
    toast.success(`Added ${rows.length} expenses`);
  }

  const currency = profile?.currency_code ?? "USD";
  const total = expenses.reduce((s, e) => s + monthlyEquivalent(e), 0);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Expenses</span>
        <span className="text-xs text-muted-foreground">
          Monthly total: <span className="text-foreground font-mono font-bold">{formatCurrency(total, currency)}</span>
        </span>
      </header>

      <div className="p-6 md:p-8 max-w-4xl mx-auto w-full space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic">Where the money goes.</h1>
          <button
            onClick={() => setBulkMode(!bulkMode)}
            className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >{bulkMode ? "← Single" : "Bulk add"}</button>
        </div>

        {bulkMode ? (
          <div className="bg-surface border border-border rounded-lg p-5 space-y-3 animate-enter">
            <p className="text-xs text-muted-foreground">
              One per line: <span className="font-mono">name, amount, category</span>. Defaults to monthly + fixed.
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder="Rent, 1200, housing&#10;Spotify, 11, subscriptions&#10;Gym, 30, other"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button onClick={addBulk} className="w-full bg-accent text-accent-foreground rounded-lg py-2.5 text-sm font-bold">
              Add all
            </button>
          </div>
        ) : (
          <form onSubmit={addOne} className="bg-surface border border-border rounded-lg p-5 space-y-3 animate-enter">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Rent)"
                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="Amount"
                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent">
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}
                className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent">
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setIsFixed(!isFixed)}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium transition ${isFixed ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground"}`}>
                {isFixed ? "Fixed" : "Variable"}
              </button>
              <button type="submit" className="flex-1 bg-accent text-accent-foreground rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2">
                <Plus className="size-3.5" /> Add
              </button>
            </div>
          </form>
        )}

        <div className="space-y-1">
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No expenses yet.</p>
          ) : expenses.map((e) => (
            <div key={e.id} className="group flex items-center gap-3 p-3 hover:bg-surface rounded-lg transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{e.name}</span>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                    {CATEGORY_LABELS[e.category]} · {e.frequency} · {e.is_fixed ? "fixed" : "variable"}
                  </span>
                </div>
              </div>
              <span className="font-mono text-sm">{formatCurrency(e.amount, currency)}</span>
              <button onClick={() => deleteExpense(e.id)} className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-alert">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
