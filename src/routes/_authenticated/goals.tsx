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
  commitmentTimeline,
  requiredMonthly,
  remainingAmount,
  monthsUntil,
  formatMonthYear,
  monthInputToDate,
  dateToMonthInput,
  suggestedOrder,
  isActiveGoal,
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABEL,
  type PlannerGoal,
  type AutoAllocationMode,
} from "@/lib/goals";
import {
  Plus, Trash2, ChevronRight, ChevronDown, Zap, Hand, Sparkles, TrendingDown,
  Pause, Play, GripVertical, AlertTriangle, Wand2, Info,
  Car, Laptop, Plane, Home, GraduationCap, Shield, Shirt, HeartPulse, Gift, Target,
  type LucideIcon,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({ meta: [{ title: "Goals — Loot" }, { name: "description", content: "Plan every savings goal, see your total monthly commitment and how it lightens over time." }, { property: "og:title", content: "Goals — Loot" }, { property: "og:description", content: "Plan every savings goal, see your total monthly commitment and how it lightens over time." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: GoalsPage,
});

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Car, Laptop, Plane, Home, GraduationCap, Shield, Shirt, HeartPulse, Gift, Target,
};

function categoryIcon(category?: string): LucideIcon {
  const def = GOAL_CATEGORIES.find((c) => c.key === (category ?? "other"));
  return CATEGORY_ICONS[def?.icon ?? "Target"] ?? Target;
}

type Preview = {
  label: string;
  goalId: string;
  extraMonths?: number;
  pause?: boolean;
};

function GoalsPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [initial, setInitial] = useState("");
  const [month, setMonth] = useState("");
  const [category, setCategory] = useState("other");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">("manual");
  const [weight, setWeight] = useState("1");
  const [priority, setPriority] = useState("0");
  const [showCompleted, setShowCompleted] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: goals = [] } = useQuery({
    queryKey: ["goals"],
    queryFn: async (): Promise<PlannerGoal[]> => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select(
          "id, name, target_amount, current_amount, target_date, progress_mode, priority, weight, completed_at, last_auto_period, category, note, sort_order, is_paused, resume_date, is_completed",
        )
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
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
        category: r.category ?? "other",
        note: r.note ?? null,
        sort_order: r.sort_order ?? 0,
        is_paused: !!r.is_paused,
        resume_date: r.resume_date ?? null,
        is_completed: !!r.is_completed,
      }));
    },
  });

  const totals = useMemo(
    () => (profile ? computeTotals(profile.net_income, profile.gross_income, expenses) : null),
    [profile, expenses],
  );
  const disposable = totals?.disposable ?? 0;
  const netIncome = profile?.net_income ?? 0;
  const currency = profile?.currency_code ?? "USD";
  const allocMode: AutoAllocationMode = (profile as any)?.auto_allocation_mode ?? "weighted";
  const autoTiming: string = (profile as any)?.auto_contribution_timing ?? "on_demand";
  const allocations = useMemo(
    () => computeAutoAllocations(goals, Math.max(0, disposable), allocMode),
    [goals, disposable, allocMode],
  );

  // Auto-resume paused goals whose resume date has arrived.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || !goals.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const due = goals.filter((g) => g.is_paused && g.resume_date && g.resume_date <= today);
    if (!due.length) return;
    resumedRef.current = true;
    (async () => {
      for (const g of due) {
        await supabase.from("savings_goals")
          .update({ is_paused: false, resume_date: null })
          .eq("id", g.id);
      }
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success(`${due.length} paused goal${due.length > 1 ? "s" : ""} resumed — monthly amounts recalculated`);
    })();
  }, [goals, qc]);

  // Notify when a paused goal with a resume date is about to reactivate.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current || !goals.length) return;
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const upcoming = goals.filter(
      (g) => g.is_paused && g.resume_date && new Date(g.resume_date) <= soon && new Date(g.resume_date) > new Date(),
    );
    if (!upcoming.length) return;
    notifiedRef.current = true;
    toast.message(`${upcoming[0].name} resumes on ${formatMonthYear(upcoming[0].resume_date)}`, {
      description: "Its monthly contribution will be added back to your commitment.",
    });
  }, [goals]);

  // Auto-apply on the 1st (unchanged behaviour).
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    if (autoTiming !== "monthly_1st") return;
    if (!goals.length) return;
    const period = currentPeriodKey();
    const toApply = goals.filter(
      (g) => g.progress_mode === "auto" && !g.completed_at && !g.is_paused && g.last_auto_period !== period && (allocations[g.id] ?? 0) > 0,
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
        const done = newAmount >= g.target_amount;
        await supabase.from("savings_goals").update({
          current_amount: newAmount,
          last_auto_period: period,
          completed_at: done ? new Date().toISOString() : null,
          is_completed: done,
        }).eq("id", g.id);
      }
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success(`Auto-applied ${toApply.length} goal${toApply.length > 1 ? "s" : ""} for this month`);
    })();
  }, [goals, allocations, autoTiming, allocMode, qc]);

  const active = goals.filter((g) => isActiveGoal(g));
  const completed = goals.filter((g) => !isActiveGoal(g));

  // Live monthly contribution while filling in the form.
  const formMonthly = useMemo(() => {
    const t = parseFloat(target || "0");
    const already = parseFloat(initial || "0");
    if (!t || t <= already) return 0;
    return requiredMonthly(
      { target_amount: t, current_amount: already, target_date: monthInputToDate(month) },
    );
  }, [target, initial, month]);

  /* -------- commitment maths (with optional un-saved preview) -------- */
  const previewExtras = useMemo(() => {
    const map: Record<string, number> = {};
    if (preview?.extraMonths) map[preview.goalId] = preview.extraMonths;
    return map;
  }, [preview]);

  const contributing = active.filter((g) => {
    if (preview?.pause && preview.goalId === g.id) return false;
    return !g.is_paused;
  });

  const rows = contributing.map((g) => ({
    goal: g,
    monthly: requiredMonthly(g, previewExtras[g.id] ?? 0),
  }));
  const totalCommitment = rows.reduce((s, r) => s + r.monthly, 0);
  const remainingDisposable = disposable - totalCommitment;
  const remainingPct = netIncome > 0 ? (remainingDisposable / netIncome) * 100 : 0;
  const status = remainingPct >= 15 ? "comfortable" : remainingPct >= 5 ? "tight" : "strained";

  const previewGoals = preview?.pause
    ? goals.map((g) => (g.id === preview.goalId ? { ...g, is_paused: true } : g))
    : goals;
  const timeline = useMemo(
    () => commitmentTimeline(previewGoals, 24, previewExtras),
    [previewGoals, previewExtras],
  );

  /* -------- shortfall suggestions -------- */
  const shortfall = Math.max(0, totalCommitment - Math.max(0, disposable - netIncome * 0.05));
  const inShortfall = totalCommitment > disposable || remainingPct < 5;

  const suggestions = useMemo(() => {
    const out: { key: string; text: string; saving: number; apply: Preview }[] = [];
    for (const { goal: g, monthly } of rows) {
      for (const ext of [3, 6, 12]) {
        const next = requiredMonthly(g, ext);
        const saving = monthly - next;
        if (saving <= 0.5) continue;
        out.push({
          key: `${g.id}-${ext}`,
          saving,
          text: `Extending ${g.name} by ${ext} months reduces your monthly commitment by ${formatCurrency(saving, currency)}.`,
          apply: { label: `${g.name} +${ext} months`, goalId: g.id, extraMonths: ext },
        });
      }
    }
    if (rows.length > 1) {
      const shortest = [...rows].sort(
        (a, b) => monthsUntil(a.goal.target_date) - monthsUntil(b.goal.target_date),
      )[0];
      const priciest = [...rows].sort((a, b) => b.monthly - a.monthly)[0];
      if (shortest.goal.id !== priciest.goal.id) {
        out.push({
          key: `pause-${priciest.goal.id}`,
          saving: priciest.monthly,
          text: `${shortest.goal.name} completes in ${monthsUntil(shortest.goal.target_date)} months. Pausing ${priciest.goal.name} until then reduces your current commitment by ${formatCurrency(priciest.monthly, currency)}.`,
          apply: { label: `Pause ${priciest.goal.name}`, goalId: priciest.goal.id, pause: true },
        });
      }
    }
    return out.sort((a, b) => b.saving - a.saving).slice(0, 6);
  }, [rows, currency]);

  /* -------- ordering -------- */
  const suggested = suggestedOrder(active);
  const orderFlags = useMemo(() => {
    const flags: string[] = [];
    active.forEach((g, i) => {
      const m = monthsUntil(g.target_date);
      if (m >= 3) return;
      const above = active.slice(0, i).find((o) => monthsUntil(o.target_date) > m);
      if (above) flags.push(`${g.name} is due in ${m} month${m === 1 ? "" : "s"} but is ranked below ${above.name}. Consider moving it up.`);
    });
    return flags;
  }, [active]);

  async function persistOrder(ordered: PlannerGoal[]) {
    await Promise.all(
      ordered.map((g, i) => supabase.from("savings_goals").update({ sort_order: i + 1 }).eq("id", g.id)),
    );
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return setDragId(null);
    const list = [...active];
    const from = list.findIndex((g) => g.id === dragId);
    const to = list.findIndex((g) => g.id === targetId);
    if (from < 0 || to < 0) return setDragId(null);
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setDragId(null);
    persistOrder(list);
  }

  /* -------- mutations -------- */
  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !target) return;
    if (!month) return toast.error("Pick a target month and year");
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
        target_date: monthInputToDate(month),
        progress_mode: mode,
        weight: parseFloat(weight || "1"),
        priority: parseInt(priority || "0", 10),
        category,
        note: note || null,
        sort_order: goals.length + 1,
      })
      .select("id")
      .single();
    if (error || !inserted) return toast.error(error?.message ?? "Failed");
    if (initialAmt > 0) {
      await supabase.from("goal_contributions").insert({
        user_id: u.user.id, goal_id: inserted.id, amount: initialAmt,
        occurred_on: new Date().toISOString().slice(0, 10),
        note: "Starting balance", source: "initial",
      });
    }
    setName(""); setTarget(""); setInitial(""); setMonth(""); setCategory("other");
    setNote(""); setMode("manual"); setWeight("1"); setPriority("0");
    qc.invalidateQueries({ queryKey: ["goals"] });
    toast.success("Goal added");
  }

  async function deleteGoal(id: string) {
    if (!confirm("Delete this goal and all its contribution history?")) return;
    await supabase.from("savings_goals").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  async function pauseGoal(g: PlannerGoal) {
    const answer = prompt(
      "When would you like to resume this goal? Enter a month as YYYY-MM, or leave blank to resume manually.",
      "",
    );
    if (answer === null) return;
    const resume = answer.trim() ? monthInputToDate(answer.trim().slice(0, 7)) : null;
    await supabase.from("savings_goals").update({ is_paused: true, resume_date: resume }).eq("id", g.id);
    qc.invalidateQueries({ queryKey: ["goals"] });
    toast.success(resume ? `Paused until ${formatMonthYear(resume)}` : "Goal paused");
  }

  async function resumeGoal(g: PlannerGoal) {
    await supabase.from("savings_goals").update({ is_paused: false, resume_date: null }).eq("id", g.id);
    qc.invalidateQueries({ queryKey: ["goals"] });
    toast.success("Goal resumed — monthly amount recalculated");
  }

  async function applyPreview() {
    if (!preview) return;
    const g = goals.find((x) => x.id === preview.goalId);
    if (!g) return;
    if (preview.pause) {
      await supabase.from("savings_goals").update({ is_paused: true }).eq("id", g.id);
    } else if (preview.extraMonths) {
      const d = new Date(g.target_date ?? new Date().toISOString().slice(0, 10));
      const next = new Date(d.getFullYear(), d.getMonth() + preview.extraMonths, 1);
      await supabase.from("savings_goals")
        .update({ target_date: next.toISOString().slice(0, 10) })
        .eq("id", g.id);
    }
    setPreview(null);
    qc.invalidateQueries({ queryKey: ["goals"] });
    toast.success("Plan updated");
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
      user_id: u.user.id, goal_id: goalId, amount,
      occurred_on: new Date().toISOString().slice(0, 10),
      note: `Auto from monthly disposable (${allocMode})`, source: "auto",
    });
    if (cErr) return toast.error(cErr.message);
    const newAmount = goal.current_amount + amount;
    const done = newAmount >= goal.target_amount;
    await supabase.from("savings_goals").update({
      current_amount: newAmount,
      last_auto_period: period,
      completed_at: done ? new Date().toISOString() : null,
      is_completed: done,
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
    const done = newAmount >= goal.target_amount;
    await supabase.from("savings_goals").update({
      current_amount: newAmount,
      completed_at: done ? new Date().toISOString() : null,
      is_completed: done,
    }).eq("id", goalId);
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["goal_contributions", goalId] });
    if (done) toast.success(`${goal.name} is complete — nice work!`);
    else toast.success(kind === "withdrawal" ? "Withdrawal logged" : `Added ${formatCurrency(Math.abs(amount), currency)}`);
  }

  const statusColor =
    status === "comfortable" ? "text-accent" : status === "tight" ? "text-caution" : "text-alert";
  const statusLabel =
    status === "comfortable" ? "Comfortable" : status === "tight" ? "Tight" : "Not feasible at current timelines";

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

        {/* ---------------- create goal ---------------- */}
        <form onSubmit={addGoal} className="panel p-5 space-y-3 animate-enter [animation-delay:100ms]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name (e.g. Emergency fund)"
            className="field" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <LabeledInput label="Target amount" value={target} setValue={setTarget} type="number" />
            <LabeledInput label="Already saved" value={initial} setValue={setInitial} type="number" placeholder="0" />
            <LabeledInput label="Target month" value={month} setValue={setMonth} type="month" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="field">
                {GOAL_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </label>
            <LabeledInput label="Note (optional)" value={note} setValue={setNote} type="text" placeholder="Why this matters" />
          </div>

          <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Monthly contribution needed
            </span>
            <span className="font-mono font-bold text-accent">
              {formMonthly > 0 ? `${formatCurrency(formMonthly, currency)} / mo` : "—"}
            </span>
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

        {/* ---------------- shortfall ---------------- */}
        {inShortfall && rows.length > 0 && (
          <section className="panel p-5 border-alert/40 space-y-3 animate-enter">
            <div className="flex items-center gap-2 text-alert">
              <AlertTriangle className="size-4" />
              <h2 className="text-sm font-bold">Your goals need more than you have spare</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Shortfall of <span className="font-mono text-alert">{formatCurrency(shortfall, currency)}</span> a month.
              Here's what helps most, biggest impact first.
            </p>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button key={s.key} onClick={() => setPreview(s.apply)}
                  className="w-full text-left rounded-lg border border-border bg-background px-3 py-2.5 hover:border-accent transition text-xs flex items-start gap-2">
                  <Wand2 className="size-3.5 mt-0.5 text-accent shrink-0" />
                  <span className="flex-1">{s.text}</span>
                  <span className="font-mono text-accent shrink-0">−{formatCurrency(s.saving, currency)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {preview && (
          <div className="panel p-4 border-accent/50 flex items-center justify-between gap-3 animate-enter">
            <div className="text-xs">
              <span className="text-[10px] font-mono uppercase tracking-widest text-accent">Previewing</span>
              <div className="font-bold">{preview.label}</div>
              <div className="text-muted-foreground">Nothing is saved until you apply.</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-border hover:text-foreground text-muted-foreground">Cancel</button>
              <button onClick={applyPreview} className="text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded bg-accent text-accent-foreground hover:opacity-90">Apply this change</button>
            </div>
          </div>
        )}

        {/* ---------------- ordering suggestion ---------------- */}
        {active.length > 1 && (
          <div className="panel p-4 space-y-2 animate-enter">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <Info className="size-3.5 mt-0.5 text-accent shrink-0" />
                Suggested order: shortest deadline first — this ensures you don't miss time-sensitive goals.
              </p>
              <button onClick={() => persistOrder(suggested)}
                className="shrink-0 text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-border hover:border-accent hover:text-accent">
                Use suggested order
              </button>
            </div>
            {orderFlags.map((f) => (
              <p key={f} className="text-[11px] text-caution flex items-start gap-2">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />{f}
              </p>
            ))}
          </div>
        )}

        {/* ---------------- active goals ---------------- */}
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
              onPause={() => pauseGoal(g)}
              onResume={() => resumeGoal(g)}
              onQuickAdd={(amt, kind) => quickAddContribution(g.id, amt, kind)}
              draggable
              dragging={dragId === g.id}
              onDragStart={() => setDragId(g.id)}
              onDropOn={() => onDrop(g.id)} />
          ))}
        </section>

        {/* ---------------- monthly commitment ---------------- */}
        {rows.length > 0 && (
          <section className="panel p-5 space-y-4 animate-enter">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Monthly commitment</h2>
            <div className="space-y-1.5">
              {rows.map(({ goal, monthly }) => (
                <div key={goal.id} className="flex items-center justify-between text-xs border-b border-border/60 pb-1.5">
                  <span className="truncate">{goal.name}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-muted-foreground font-mono text-[10px]">{formatMonthYear(goal.target_date)}</span>
                    <span className="font-mono">{formatCurrency(monthly, currency)}</span>
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Total monthly goal commitment</div>
              <div className="text-3xl font-display font-extrabold">{formatCurrency(totalCommitment, currency)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-background border border-border p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Disposable income</div>
                <div className="font-mono mt-1">{formatCurrency(disposable, currency)}</div>
              </div>
              <div className="rounded-lg bg-background border border-border p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Left after goals</div>
                <div className={`font-mono mt-1 ${statusColor}`}>{formatCurrency(remainingDisposable, currency)}</div>
              </div>
            </div>
            <div className={`text-xs font-bold ${statusColor}`}>
              {statusLabel} · {remainingPct.toFixed(0)}% of net income left over
            </div>
          </section>
        )}

        {/* ---------------- 24-month timeline ---------------- */}
        {rows.length > 0 && (
          <section className="panel p-5 space-y-3 animate-enter">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Next 24 months</h2>
            <p className="text-xs text-muted-foreground">
              Your commitment lightens as each goal finishes. Highlighted bars mark a goal completing.
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={2} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any) => formatCurrency(Number(v), currency)}
                    labelFormatter={(l: any, p: any) => {
                      const done = p?.[0]?.payload?.completing ?? [];
                      return done.length ? `${l} — ${done.join(", ")} completes` : String(l);
                    }} />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                    {timeline.map((m, i) => (
                      <Cell key={i} fill={m.completing.length ? "hsl(var(--chart-2))" : "hsl(var(--accent))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* ---------------- completed ---------------- */}
        {completed.length > 0 && (
          <section className="space-y-3">
            <button onClick={() => setShowCompleted((s) => !s)}
              className="w-full text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2 hover:text-foreground">
              {showCompleted ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              <Sparkles className="size-3" /> Completed goals ({completed.length})
            </button>
            {showCompleted && completed.map((g) => (
              <GoalCard key={g.id} g={g} currency={currency} autoAlloc={null} period={currentPeriodKey()}
                onApply={() => {}} onDelete={() => deleteGoal(g.id)}
                onPause={() => {}} onResume={() => {}} onQuickAdd={() => {}} completed />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function GoalCard({
  g, currency, autoAlloc, period, onApply, onDelete, onPause, onResume, onQuickAdd, completed,
  draggable, dragging, onDragStart, onDropOn,
}: {
  g: PlannerGoal; currency: string; autoAlloc: number | null; period: string;
  onApply: () => void; onDelete: () => void; onPause: () => void; onResume: () => void;
  onQuickAdd: (amount: number, kind: "deposit" | "withdrawal") => void;
  completed?: boolean;
  draggable?: boolean; dragging?: boolean;
  onDragStart?: () => void; onDropOn?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [quickAmt, setQuickAmt] = useState("");
  const pct = Math.min(100, (g.current_amount / Math.max(1, g.target_amount)) * 100);
  const appliedThisMonth = g.last_auto_period === period;
  const Icon = categoryIcon(g.category);
  const months = monthsUntil(g.target_date);
  const monthly = requiredMonthly(g);
  const left = remainingAmount(g);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => draggable && e.preventDefault()}
      onDrop={onDropOn}
      className={`panel p-5 group animate-enter ${completed ? "opacity-70" : ""} ${dragging ? "ring-1 ring-accent" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {draggable && (
            <GripVertical className="size-4 mt-1 text-muted-foreground cursor-grab shrink-0" />
          )}
          <span className="size-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
            <Icon className="size-4" />
          </span>
          <Link to="/goals/$goalId" params={{ goalId: g.id }} className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-lg truncate">{g.name}</h3>
              <span className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ${
                g.progress_mode === "auto" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
              }`}>
                {g.progress_mode === "auto" ? "AUTO" : "MANUAL"}
              </span>
              {g.is_paused && !completed && (
                <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-caution/20 text-caution">PAUSED</span>
              )}
              {completed && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-accent text-accent-foreground">DONE</span>}
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {GOAL_CATEGORY_LABEL[g.category ?? "other"]} · {formatMonthYear(g.target_date)}
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {!completed && (
            g.is_paused ? (
              <button onClick={onResume} title="Resume" className="text-caution hover:text-accent">
                <Play className="size-3.5" />
              </button>
            ) : (
              <button onClick={onPause} title="Pause" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-caution transition">
                <Pause className="size-3.5" />
              </button>
            )
          )}
          <Link to="/goals/$goalId" params={{ goalId: g.id }} title="Edit" className="text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-4" />
          </Link>
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-alert transition">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {completed && (
        <p className="mt-3 text-xs text-accent">Goal reached — congratulations, you saved every cent of it.</p>
      )}

      {!completed && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Monthly needed" value={g.is_paused ? "Paused" : `${formatCurrency(monthly, currency)}`} />
          <Stat label="Remaining" value={formatCurrency(left, currency)} />
          <Stat label="Months left" value={String(months)} />
        </div>
      )}

      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span className="font-mono">{formatCurrency(g.current_amount, currency)}</span>
        <span className="font-mono text-muted-foreground">/ {formatCurrency(g.target_amount, currency)}</span>
      </div>
      <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
        <span className="text-accent">{pct.toFixed(0)}%</span>
        <span className="text-muted-foreground">{formatCurrency(left, currency)} to go</span>
      </div>

      {g.note && <p className="mt-3 text-[11px] text-muted-foreground italic">{g.note}</p>}

      {!completed && g.category === "vehicle" && (
        <p className="mt-3 text-[11px] text-muted-foreground bg-background border border-border rounded-lg px-3 py-2">
          SA banks typically require a 10–20% deposit. On a {formatCurrency(g.target_amount, currency)} purchase
          that's {formatCurrency(g.target_amount * 0.1, currency)}–{formatCurrency(g.target_amount * 0.2, currency)}.
        </p>
      )}
      {!completed && g.category === "property" && (
        <p className="mt-3 text-[11px] text-muted-foreground bg-background border border-border rounded-lg px-3 py-2">
          Most SA banks require a 10% deposit plus transfer costs of approximately 8–10% of purchase price.
        </p>
      )}
      {!completed && g.is_paused && g.resume_date && (
        <p className="mt-3 text-[11px] text-caution">Resumes {formatMonthYear(g.resume_date)}.</p>
      )}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background border border-border py-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-xs font-mono mt-0.5">{value}</div>
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
      <input value={value} onChange={(e) => setValue(e.target.value)} type={type}
        step={type === "number" ? "0.01" : undefined} placeholder={placeholder}
        className="field" />
    </label>
  );
}
