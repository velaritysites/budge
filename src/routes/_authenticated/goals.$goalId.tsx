import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { formatCurrency } from "@/lib/format";
import type { Goal, GoalContribution } from "@/lib/goals";
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/goals/$goalId")({
  head: () => ({ meta: [{ title: "Goal — Budge" }] }),
  component: GoalDetailPage,
});

function GoalDetailPage() {
  const { goalId } = Route.useParams();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [amount, setAmount] = useState("");
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");

  const { data: goal } = useQuery({
    queryKey: ["goal", goalId],
    queryFn: async (): Promise<Goal | null> => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select("id, name, target_amount, current_amount, target_date, progress_mode, priority, weight, completed_at, last_auto_period")
        .eq("id", goalId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id, name: data.name,
        target_amount: Number(data.target_amount), current_amount: Number(data.current_amount),
        target_date: data.target_date, progress_mode: (data as any).progress_mode,
        priority: (data as any).priority ?? 0, weight: Number((data as any).weight ?? 1),
        completed_at: (data as any).completed_at, last_auto_period: (data as any).last_auto_period,
      };
    },
  });

  const { data: contributions = [] } = useQuery({
    queryKey: ["goal_contributions", goalId],
    queryFn: async (): Promise<GoalContribution[]> => {
      const { data, error } = await supabase
        .from("goal_contributions")
        .select("id, goal_id, amount, occurred_on, note, source, created_at")
        .eq("goal_id", goalId)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, goal_id: r.goal_id, amount: Number(r.amount),
        occurred_on: r.occurred_on, note: r.note, source: r.source, created_at: r.created_at,
      }));
    },
  });

  const currency = profile?.currency_code ?? "USD";

  async function recomputeCurrent(newRows?: GoalContribution[]) {
    const rows = newRows ?? contributions;
    const sum = rows.reduce((s, c) => s + c.amount, 0);
    const completed = goal ? sum >= goal.target_amount : false;
    await supabase.from("savings_goals").update({
      current_amount: sum,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", goalId);
    qc.invalidateQueries({ queryKey: ["goal", goalId] });
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  async function addContribution(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || isNaN(val)) return toast.error("Enter an amount");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const signed = kind === "withdrawal" ? -Math.abs(val) : Math.abs(val);
    const { data: inserted, error } = await supabase.from("goal_contributions").insert({
      user_id: u.user.id, goal_id: goalId, amount: signed,
      occurred_on: when, note: note || null, source: "manual",
    }).select("id, goal_id, amount, occurred_on, note, source, created_at").single();
    if (error) return toast.error(error.message);
    setAmount(""); setNote("");
    const next = [
      { ...(inserted as any), amount: Number(inserted!.amount) } as GoalContribution,
      ...contributions,
    ];
    await recomputeCurrent(next);
    qc.invalidateQueries({ queryKey: ["goal_contributions", goalId] });
    toast.success(kind === "withdrawal" ? "Withdrawal logged" : "Contribution logged");
  }

  async function saveEdit(id: string) {
    const val = parseFloat(editAmount);
    if (isNaN(val)) return toast.error("Invalid amount");
    const { error } = await supabase.from("goal_contributions").update({
      amount: val, occurred_on: editDate, note: editNote || null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    const next = contributions.map((c) => c.id === id ? { ...c, amount: val, occurred_on: editDate, note: editNote || null } : c);
    await recomputeCurrent(next);
    qc.invalidateQueries({ queryKey: ["goal_contributions", goalId] });
  }

  async function deleteContribution(id: string) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("goal_contributions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    const next = contributions.filter((c) => c.id !== id);
    await recomputeCurrent(next);
    qc.invalidateQueries({ queryKey: ["goal_contributions", goalId] });
  }

  const stats = useMemo(() => {
    const deposits = contributions.filter((c) => c.amount > 0);
    const withdrawals = contributions.filter((c) => c.amount < 0);
    const totalIn = deposits.reduce((s, c) => s + c.amount, 0);
    const totalOut = withdrawals.reduce((s, c) => s + c.amount, 0);
    const avg = deposits.length ? totalIn / deposits.length : 0;
    return { deposits: deposits.length, withdrawals: withdrawals.length, totalIn, totalOut, avg };
  }, [contributions]);

  if (!goal) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  const pct = Math.min(100, (goal.current_amount / Math.max(1, goal.target_amount)) * 100);
  const remaining = Math.max(0, goal.target_amount - goal.current_amount);

  // Projection: how many months at avg deposit
  const monthsToGo = stats.avg > 0 ? Math.ceil(remaining / stats.avg) : null;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center px-6 md:px-8 gap-3">
        <button onClick={() => navigate({ to: "/goals" })} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </button>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Goal detail</span>
      </header>

      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full space-y-8">
        {/* Overview */}
        <section className="animate-enter space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight">{goal.name}</h1>
            <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded ${
              goal.progress_mode === "auto" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
            }`}>{goal.progress_mode}</span>
            {goal.completed_at && (
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded bg-accent text-accent-foreground">Completed</span>
            )}
          </div>
          <div className="panel p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono">{formatCurrency(goal.current_amount, currency)}</span>
              <span className="font-mono text-sm text-muted-foreground">/ {formatCurrency(goal.target_amount, currency)}</span>
            </div>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-accent">{pct.toFixed(1)}%</span>
              <span className="text-muted-foreground">{formatCurrency(remaining, currency)} to go</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Deposits" value={String(stats.deposits)} />
            <Stat label="Total in" value={formatCurrency(stats.totalIn, currency)} />
            <Stat label="Withdrawals" value={String(stats.withdrawals)} />
            <Stat label="Avg deposit" value={formatCurrency(stats.avg, currency)} />
          </div>

          {monthsToGo !== null && !goal.completed_at && (
            <p className="text-xs text-muted-foreground">
              At your average deposit, this goal is <span className="text-foreground font-medium">{monthsToGo} contributions</span> away.
              {goal.target_date && ` Target date: ${new Date(goal.target_date).toLocaleDateString()}.`}
            </p>
          )}
        </section>

        {/* Add contribution */}
        <section className="space-y-3 animate-enter [animation-delay:100ms]">
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Log a contribution</h2>
          <form onSubmit={addContribution} className="panel p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setKind("deposit")}
                className={`py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 ${kind === "deposit" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"}`}>
                <TrendingUp className="size-3.5" /> Deposit
              </button>
              <button type="button" onClick={() => setKind("withdrawal")}
                className={`py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 ${kind === "withdrawal" ? "border-alert bg-alert/10 text-alert" : "border-border text-muted-foreground"}`}>
                <TrendingDown className="size-3.5" /> Withdrawal
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount"
                className="field" />
              <input type="date" value={when} onChange={(e) => setWhen(e.target.value)}
                className="field" />
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
              className="field" />
            <button type="submit" className="w-full btn-accent py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              <Plus className="size-3.5" /> Log entry
            </button>
          </form>
        </section>

        {/* History */}
        <section className="space-y-3 animate-enter [animation-delay:200ms]">
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            History ({contributions.length})
          </h2>
          {contributions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No entries yet.</p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {contributions.map((c) => {
                const isEdit = editingId === c.id;
                const neg = c.amount < 0;
                return (
                  <div key={c.id} className="p-3 bg-surface/40 group">
                    {isEdit ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                            className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                          <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                            className="bg-background border border-border rounded px-2 py-1.5 text-sm" />
                        </div>
                        <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Note"
                          className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm" />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(c.id)} className="flex-1 bg-accent text-accent-foreground rounded py-1.5 text-xs font-bold flex items-center justify-center gap-1">
                            <Check className="size-3" /> Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="flex-1 border border-border rounded py-1.5 text-xs flex items-center justify-center gap-1">
                            <X className="size-3" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className={`size-2 rounded-full ${neg ? "bg-alert" : c.source === "auto" ? "bg-accent" : c.source === "initial" ? "bg-muted-foreground" : "bg-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-mono text-sm font-bold ${neg ? "text-alert" : ""}`}>
                              {neg ? "−" : "+"}{formatCurrency(Math.abs(c.amount), currency)}
                            </span>
                            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                              {c.source}
                            </span>
                          </div>
                          {c.note && <div className="text-[11px] text-muted-foreground truncate">{c.note}</div>}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {new Date(c.occurred_on).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                          <button onClick={() => { setEditingId(c.id); setEditAmount(String(c.amount)); setEditDate(c.occurred_on); setEditNote(c.note ?? ""); }}
                            className="text-muted-foreground hover:text-foreground">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => deleteContribution(c.id)} className="text-muted-foreground hover:text-alert">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <Link to="/goals" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-3" /> Back to all goals
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border p-3 rounded-lg">
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
      <div className="text-sm font-bold mt-1 font-mono">{value}</div>
    </div>
  );
}
