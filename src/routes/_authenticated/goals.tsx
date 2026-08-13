import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useExpenses } from "@/hooks/use-profile";
import { formatCurrency } from "@/lib/format";
import { computeTotals } from "@/lib/finance";
import {
  computeAutoAllocations,
  currentPeriodKey,
  type Goal,
  type AutoAllocationMode,
} from "@/lib/goals";
import { Plus, Trash2, ChevronRight, Zap, Hand, Sparkles, TrendingDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({ meta: [{ title: "Goals — Budge" }] }),
  component: GoalsPage,
});

function GoalsPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [initial, setInitial] = useState("");
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("manual");
  const [weight, setWeight] = useState("1");
  const [priority, setPriority] = useState("0");

  const { data: goals = [] } = useQuery({
    queryKey: ["goals"],
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select("id, name, target_amount, current_amount, target_date, progress_mode, priority, weight, completed_at, last_auto_period")
        .order("completed_at", { ascending: true, nullsFirst: true })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        target_amount: Number(r.target_amount),
        current_amount: Number(r.current_amount),
        target_date: r.target_date,
        progress_mode: r.progress_mode,
        priority: r.priority ?? 0,
        weight: Number(r.weight ?? 1),
        completed_at: r.completed_at,
        last_auto_period: r.last_auto_period,
      }));
    },
  });

  const totals = useMemo(
    () => (profile ? computeTotals(profile.net_income, profile.gross_income, expenses) : null),
    [profile, expenses],
  );
  const disposable = totals?.disposable ?? 0;
  const allocMode: AutoAllocationMode = (profile as any)?.auto_allocation_mode ?? "weighted";
  const autoTiming: string = (profile as any)?.auto_contribution_timing ?? "on_demand";
  const allocations = useMemo(
    () => computeAutoAllocations(goals, Math.max(0, disposable), allocMode),
    [goals, disposable, allocMode],
  );

  // Auto-apply on the 1st: if timing is monthly_1st and any auto goal hasn't
  // been applied for this period yet, log those contributions once per session.
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    if (autoTiming !== "monthly_1st") return;
    if (!goals.length) return;
    const period = currentPeriodKey();
    const toApply = goals.filter(
      (g) => g.progress_mode === "auto" && !g.completed_at && g.last_auto_period !== period && (allocations[g.id] ?? 0) > 0,
    );
    if (toApply.length === 0) return;
    appliedRef.current = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      for (const g of toApply) {
        const amt = allocations[g.id] ?? 0;
        await supabase.from("goal_contributions").insert({
          user_id: u.user.id, goal_id: g.id, amount: amt,
          occurred_on: new Date().toISOString().slice(0, 10),
          note: `Auto (monthly, ${allocMode})`, source: "auto",
        });
        const newAmount = g.current_amount + amt;
        await supabase.from("savings_goals").update({
          current_amount: newAmount,
          last_auto_period: period,
          completed_at: newAmount >= g.target_amount ? new Date().toISOString() : null,
        }).eq("id", g.id);
      }
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success(`Auto-applied ${toApply.length} goal${toApply.length > 1 ? "s" : ""} for this month`);
    })();
  }, [goals, allocations, autoTiming, allocMode, qc]);

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !target) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const initialAmt = parseFloat(initial || "0");
    const { data: inserted, error } = await supabase
      .from("savings_goals")
      .insert({
        user_id: u.user.id,
        name,
        target_amount: parseFloat(target),
        current_amount: initialAmt,
        target_date: date || null,
        progress_mode: mode,
        weight: parseFloat(weight || "1"),
        priority: parseInt(priority || "0", 10),
      })
      .select("id")
      .single();
    if (error || !inserted) return toast.error(error?.message ?? "Failed");
    if (initialAmt > 0) {
      await supabase.from("goal_contributions").insert({
        user_id: u.user.id,
        goal_id: inserted.id,
        amount: initialAmt,
        occurred_on: new Date().toISOString().slice(0, 10),
        note: "Starting balance",
        source: "initial",
      });
    }
    setName(""); setTarget(""); setInitial(""); setDate(""); setMode("manual"); setWeight("1"); setPriority("0");
    qc.invalidateQueries({ queryKey: ["goals"] });
    toast.success("Goal added");
  }

  async function deleteGoal(id: string) {
    if (!confirm("Delete this goal and all its contribution history?")) return;
    await supabase.from("savings_goals").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  async function applyAuto(goalId: string, amount: number) {
    if (amount <= 0) return toast.error("Nothing to allocate this month");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const period = currentPeriodKey();
    if (goal.last_auto_period === period) {
      if (!confirm("This month's auto contribution was already applied. Apply again?")) return;
    }
    const { error: cErr } = await supabase.from("goal_contributions").insert({
      user_id: u.user.id,
      goal_id: goalId,
      amount,
      occurred_on: new Date().toISOString().slice(0, 10),
      note: `Auto from monthly disposable (${allocMode})`,
      source: "auto",
    });
    if (cErr) return toast.error(cErr.message);
    const newAmount = goal.current_amount + amount;
    const completed = newAmount >= goal.target_amount;
    await supabase.from("savings_goals").update({
      current_amount: newAmount,
      last_auto_period: period,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", goalId);
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["goal_contributions", goalId] });
    toast.success(`Applied ${formatCurrency(amount, currency)}`);
  }

  async function quickAddContribution(goalId: string, amount: number, kind: "deposit" | "withdrawal") {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const signed = kind === "withdrawal" ? -Math.abs(amount) : Math.abs(amount);
    const { error } = await supabase.from("goal_contributions").insert({
      user_id: u.user.id, goal_id: goalId, amount: signed,
      occurred_on: new Date().toISOString().slice(0, 10),
      note: null, source: "manual",
    });
    if (error) return toast.error(error.message);
    const newAmount = goal.current_amount + signed;
    await supabase.from("savings_goals").update({
      current_amount: newAmount,
      completed_at: newAmount >= goal.target_amount ? new Date().toISOString() : null,
    }).eq("id", goalId);
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["goal_contributions", goalId] });
    toast.success(kind === "withdrawal" ? "Withdrawal logged" : `Added ${formatCurrency(Math.abs(amount), currency)}`);
  }

  const currency = profile?.currency_code ?? "USD";
  const active = goals.filter((g) => !g.completed_at);
  const completed = goals.filter((g) => g.completed_at);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Goals</span>
      </header>

      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full space-y-8">
        <div className="animate-enter">
          <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight">What are you saving for?</h1>
          <p className="text-xs text-muted-foreground font-mono mt-2">
            Monthly disposable: <span className="text-accent">{formatCurrency(Math.max(0, disposable), currency)}</span> ·
            Auto mode: <span className="text-foreground uppercase">{allocMode}</span>
          </p>
        </div>

        <form onSubmit={addGoal} className="panel p-5 space-y-3 animate-enter [animation-delay:100ms]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name (e.g. Emergency fund)"
            className="field" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <LabeledInput label="Target amount" value={target} setValue={setTarget} type="number" />
            <LabeledInput label="Already saved" value={initial} setValue={setInitial} type="number" placeholder="0" />
            <LabeledInput label="Target date (optional)" value={date} setValue={setDate} type="date" />
          </div>

          <div className="pt-2 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Progress mode</span>
            <div className="grid grid-cols-2 gap-2">
              <ModeButton active={mode === "manual"} onClick={() => setMode("manual")}
                icon={<Hand className="size-3.5" />} title="Manual" desc="You log each contribution yourself." />
              <ModeButton active={mode === "auto"} onClick={() => setMode("auto")}
                icon={<Zap className="size-3.5" />} title="Auto" desc="Progressed from monthly disposable." />
            </div>
            {mode === "auto" && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <LabeledInput label={allocMode === "weighted" ? "Weight" : "Priority order (lower = first)"}
                  value={allocMode === "weighted" ? weight : priority}
                  setValue={allocMode === "weighted" ? setWeight : setPriority}
                  type="number" />
                <div className="text-[11px] text-muted-foreground self-center leading-relaxed">
                  {allocMode === "weighted"
                    ? "Higher weight = larger share of the monthly split."
                    : "Fills goals in order — top goal first, overflow spills to the next."}
                  <br />Change mode in Settings.
                </div>
              </div>
            )}
          </div>

          <button type="submit" className="w-full btn-accent py-2.5 text-sm font-bold flex items-center justify-center gap-2">
            <Plus className="size-3.5" /> Add goal
          </button>
        </form>

        <section className="space-y-3">
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Active ({active.length})</h2>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No active goals yet.</p>
          ) : active.map((g) => (
            <GoalCard key={g.id} g={g} currency={currency}
              autoAlloc={g.progress_mode === "auto" ? allocations[g.id] ?? 0 : null}
              period={currentPeriodKey()}
              onApply={() => applyAuto(g.id, allocations[g.id] ?? 0)}
              onDelete={() => deleteGoal(g.id)}
              onQuickAdd={(amt, kind) => quickAddContribution(g.id, amt, kind)} />
          ))}
        </section>

        {completed.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Sparkles className="size-3" /> Completed ({completed.length})
            </h2>
            {completed.map((g) => (
              <GoalCard key={g.id} g={g} currency={currency} autoAlloc={null} period={currentPeriodKey()}
                onApply={() => {}} onDelete={() => deleteGoal(g.id)} onQuickAdd={() => {}} completed />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function GoalCard({ g, currency, autoAlloc, period, onApply, onDelete, onQuickAdd, completed }: {
  g: Goal; currency: string; autoAlloc: number | null; period: string;
  onApply: () => void; onDelete: () => void;
  onQuickAdd: (amount: number, kind: "deposit" | "withdrawal") => void;
  completed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [quickAmt, setQuickAmt] = useState("");
  const pct = Math.min(100, (g.current_amount / Math.max(1, g.target_amount)) * 100);
  const appliedThisMonth = g.last_auto_period === period;
  return (
    <div className={`panel p-5 group animate-enter ${completed ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <Link to="/goals/$goalId" params={{ goalId: g.id }} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-lg truncate">{g.name}</h3>
            <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${
              g.progress_mode === "auto" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
            }`}>
              {g.progress_mode === "auto" ? "AUTO" : "MANUAL"}
            </span>
            {completed && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-accent text-accent-foreground">DONE</span>}
          </div>
          {g.target_date && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              by {new Date(g.target_date).toLocaleDateString()}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/goals/$goalId" params={{ goalId: g.id }} className="text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-4" />
          </Link>
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-alert transition">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span className="font-mono">{formatCurrency(g.current_amount, currency)}</span>
        <span className="font-mono text-muted-foreground">/ {formatCurrency(g.target_amount, currency)}</span>
      </div>
      <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
        <span className="text-accent">{pct.toFixed(0)}%</span>
        <span className="text-muted-foreground">
          {formatCurrency(Math.max(0, g.target_amount - g.current_amount), currency)} to go
        </span>
      </div>
      {!completed && g.progress_mode === "auto" && autoAlloc !== null && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground">
            This month's share:{" "}
            <span className="font-mono text-foreground">{formatCurrency(autoAlloc, currency)}</span>
            {appliedThisMonth && <span className="ml-2 text-accent">· applied ✓</span>}
          </div>
          <button onClick={onApply} disabled={autoAlloc <= 0}
            className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded bg-foreground text-background disabled:opacity-40 hover:opacity-90">
            Apply
          </button>
        </div>
      )}
      {!completed && (
        <div className="mt-3 pt-3 border-t border-border">
          {open ? (
            <div className="flex items-center gap-2">
              <input type="number" step="0.01" autoFocus value={quickAmt} onChange={(e) => setQuickAmt(e.target.value)}
                placeholder="Amount"
                className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
              <button
                onClick={() => { const v = parseFloat(quickAmt); if (!v) return; onQuickAdd(v, "deposit"); setQuickAmt(""); setOpen(false); }}
                className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded bg-accent text-accent-foreground hover:opacity-90">
                + Add
              </button>
              <button
                onClick={() => { const v = parseFloat(quickAmt); if (!v) return; onQuickAdd(v, "withdrawal"); setQuickAmt(""); setOpen(false); }}
                title="Withdraw"
                className="text-muted-foreground hover:text-alert p-1.5">
                <TrendingDown className="size-3.5" />
              </button>
              <button onClick={() => { setOpen(false); setQuickAmt(""); }} className="text-muted-foreground hover:text-foreground text-xs px-1">✕</button>
            </div>
          ) : (
            <button onClick={() => setOpen(true)}
              className="w-full text-[10px] font-mono uppercase tracking-widest py-1.5 rounded border border-dashed border-border hover:border-accent hover:text-accent text-muted-foreground flex items-center justify-center gap-1">
              <Plus className="size-3" /> Add payment
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left p-3 rounded-lg border transition ${active ? "border-accent bg-accent/10" : "border-border bg-background hover:border-muted-foreground"}`}>
      <div className="flex items-center gap-2 text-sm font-bold">{icon}{title}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{desc}</div>
    </button>
  );
}

function LabeledInput({ label, value, setValue, type, placeholder }: {
  label: string; value: string; setValue: (v: string) => void; type: string; placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => setValue(e.target.value)} type={type} step="0.01" placeholder={placeholder}
        className="field" />
    </label>
  );
}
