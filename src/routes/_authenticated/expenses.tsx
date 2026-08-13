import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useExpenses, useProfile } from "@/hooks/use-profile";
import { CATEGORY_LABELS, type ExpenseCategory, type ExpenseFrequency, monthlyEquivalent } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { upsertCurrentMonthSnapshot } from "@/lib/snapshot";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, X, Pencil, Bell, BellOff, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Budge" }] }),
  component: ExpensesPage,
});

const CATEGORIES: ExpenseCategory[] = [
  "housing_rent", "transport_fuel", "vehicle_finance", "insurance",
  "medical_insurance", "groceries", "debt", "subscriptions", "food", "other",
];
const FREQUENCIES: { value: ExpenseFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "yearly", label: "Yearly" },
  { value: "one_off", label: "One-off" },
];

type DeletedExpense = {
  id: string; name: string; category: ExpenseCategory; amount: number;
  frequency: ExpenseFrequency; is_fixed: boolean; deleted_at: string;
};

function ExpensesPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("housing_rent");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [isFixed, setIsFixed] = useState(true);
  const [dueDay, setDueDay] = useState("");
  const [notify, setNotify] = useState(false);
  const [lead, setLead] = useState("3");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [deleted, setDeleted] = useState<DeletedExpense[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function loadDeleted() {
    const { data } = await supabase
      .from("expenses")
      .select("id, name, category, amount, frequency, is_fixed, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    setDeleted((data ?? []).map((r: any) => ({
      id: r.id, name: r.name, category: r.category, amount: Number(r.amount),
      frequency: r.frequency, is_fixed: r.is_fixed, deleted_at: r.deleted_at,
    })));
  }

  useEffect(() => { loadDeleted(); }, []);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["expenses"] });
    if (profile) {
      const { data: fresh } = await supabase
        .from("expenses").select("id, name, category, amount, frequency, is_fixed")
        .is("deleted_at", null);
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
    await loadDeleted();
  }

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const dueDayNum = dueDay ? Math.max(1, Math.min(31, parseInt(dueDay))) : null;
    const { error } = await supabase.from("expenses").insert({
      user_id: u.user.id, name, amount: parseFloat(amount), category, frequency, is_fixed: isFixed,
      due_day: dueDayNum,
      notify_enabled: notify && !!dueDayNum,
      notify_lead_days: parseInt(lead || "3"),
    });
    if (error) return toast.error(error.message);
    setName(""); setAmount(""); setDueDay(""); setNotify(false);
    await refresh();
    toast.success("Added");
  }

  async function deleteExpense(id: string) {
    const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Removed — restore anytime");
  }

  async function restoreExpense(id: string) {
    const { error } = await supabase.from("expenses").update({ deleted_at: null }).eq("id", id);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Restored");
  }

  async function purgeExpense(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await loadDeleted();
  }

  async function saveRename(id: string) {
    if (!editName.trim()) return setEditingId(null);
    const { error } = await supabase.from("expenses").update({ name: editName.trim() }).eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    await refresh();
    toast.success("Renamed");
  }

  async function toggleNotify(id: string, current: boolean, hasDueDay: boolean) {
    if (!current && !hasDueDay) return toast.error("Add a due day first (click the pencil).");
    const { error } = await supabase.from("expenses").update({ notify_enabled: !current }).eq("id", id);
    if (error) return toast.error(error.message);
    await refresh();
  }

  async function setExpenseDueDay(id: string, day: number | null) {
    const { error } = await supabase.from("expenses").update({ due_day: day }).eq("id", id);
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
          <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight">Where the money goes.</h1>
          <button onClick={() => setBulkMode(!bulkMode)}
            className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
            {bulkMode ? "← Single" : "Bulk add"}
          </button>
        </div>

        {bulkMode ? (
          <div className="panel p-5 space-y-3 animate-enter">
            <p className="text-xs text-muted-foreground">
              One per line: <span className="font-mono">name, amount, category</span>. Defaults to monthly + fixed.
            </p>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6}
              placeholder="Rent, 1200, housing_rent&#10;Spotify, 11, subscriptions&#10;Groceries, 400, groceries"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
            <button onClick={addBulk} className="w-full btn-accent py-2.5 text-sm font-bold">Add all</button>
          </div>
        ) : (
          <form onSubmit={addOne} className="panel p-5 space-y-3 animate-enter">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Rent)"
                className="field" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="Amount"
                className="field" />
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="field">
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}
                className="field">
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <input value={dueDay} onChange={(e) => setDueDay(e.target.value)} type="number" min="1" max="31" placeholder="Due day of month (optional)"
                className="field" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setNotify(!notify)}
                  className={`flex-1 py-2.5 rounded-lg border text-xs font-medium transition flex items-center justify-center gap-1.5 ${notify ? "bg-accent/10 border-accent/40 text-accent" : "bg-background border-border text-muted-foreground"}`}>
                  {notify ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
                  {notify ? "Remind me" : "No reminder"}
                </button>
                {notify && (
                  <select value={lead} onChange={(e) => setLead(e.target.value)}
                    className="bg-background border border-border rounded-lg px-2 py-2.5 text-xs focus:outline-none">
                    <option value="0">Day of</option>
                    <option value="1">1 day ahead</option>
                    <option value="3">3 days ahead</option>
                    <option value="7">7 days ahead</option>
                  </select>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setIsFixed(!isFixed)}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium transition ${isFixed ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground"}`}>
                {isFixed ? "Fixed" : "Variable"}
              </button>
              <button type="submit" className="flex-1 btn-accent py-2 text-sm font-bold flex items-center justify-center gap-2">
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
                {editingId === e.id ? (
                  <div className="flex items-center gap-2">
                    <input autoFocus value={editName} onChange={(ev) => setEditName(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === "Enter") saveRename(e.id); if (ev.key === "Escape") setEditingId(null); }}
                      className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
                    <button onClick={() => saveRename(e.id)} className="p-1 text-accent hover:opacity-80"><Check className="size-4" /></button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{e.name}</span>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                      {CATEGORY_LABELS[e.category]} · {e.frequency} · {e.is_fixed ? "fixed" : "variable"}
                      {e.due_day ? ` · due ${e.due_day}` : ""}
                    </span>
                    {e.notify_enabled && <Bell className="size-3 text-accent" />}
                  </div>
                )}
              </div>
              {editingId !== e.id && (
                <>
                  <span className="font-mono text-sm">{formatCurrency(e.amount, currency)}</span>
                  <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                    <input type="number" min="1" max="31" defaultValue={e.due_day ?? ""}
                      placeholder="Day"
                      onBlur={(ev) => {
                        const v = ev.target.value ? Math.max(1, Math.min(31, parseInt(ev.target.value))) : null;
                        if (v !== (e.due_day ?? null)) setExpenseDueDay(e.id, v);
                      }}
                      className="w-14 bg-background border border-border rounded px-2 py-1 text-xs" title="Due day of month" />
                    <button onClick={() => toggleNotify(e.id, !!e.notify_enabled, !!e.due_day)}
                      className={`p-1 rounded hover:bg-background ${e.notify_enabled ? "text-accent" : "text-muted-foreground"}`}
                      title={e.notify_enabled ? "Reminder on" : "Turn reminder on"}>
                      {e.notify_enabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
                    </button>
                    <button onClick={() => { setEditingId(e.id); setEditName(e.name); }}
                      className="p-1 rounded hover:bg-background text-muted-foreground" title="Rename">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => deleteExpense(e.id)}
                      className="p-1 rounded hover:bg-background text-muted-foreground hover:text-alert" aria-label="Remove">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border">
          <button onClick={() => setShowDeleted((s) => !s)}
            className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground flex items-center gap-2">
            <RotateCcw className="size-3" />
            Recently removed {deleted.length > 0 && <span className="text-foreground">({deleted.length})</span>}
            <span className="text-muted-foreground/60">{showDeleted ? "▾" : "▸"}</span>
          </button>
          {showDeleted && (
            <div className="mt-4 space-y-1 animate-enter">
              {deleted.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">Nothing here yet. Deleted expenses show up here so you can bring them back.</p>
              ) : deleted.map((e) => (
                <div key={e.id} className="group flex items-center gap-3 p-3 bg-surface/40 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate text-muted-foreground line-through">{e.name}</span>
                      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
                        {CATEGORY_LABELS[e.category]} · {e.frequency} · removed {new Date(e.deleted_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">{formatCurrency(e.amount, currency)}</span>
                  <button onClick={() => restoreExpense(e.id)}
                    className="text-[10px] font-mono uppercase tracking-widest text-accent hover:opacity-80 flex items-center gap-1">
                    <RotateCcw className="size-3" /> Restore
                  </button>
                  <button onClick={() => purgeExpense(e.id)}
                    className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-alert"
                    title="Delete permanently">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
