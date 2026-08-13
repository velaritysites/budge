import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { CATEGORY_LABELS, type ExpenseCategory, type ExpenseFrequency, monthlyEquivalent } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { Plus, Trash2, Calculator, Save, FileText, Copy, Layers, X, Pencil, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Send, Clock, Download, Image as ImageIcon, Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PlanExportSheet, exportPlanImage, exportPlanPdf, type ExportPlan } from "@/lib/export-plan";

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

type Phase = {
  id: string;
  name: string;
  leftover: number;
  items: IdealExpense[];
  /** Soft-deleted items, kept so users can restore anything removed by accident. */
  trash?: IdealExpense[];
};

type SavedPlan = {
  id: string;
  name: string;
  tax_rate_pct: number;
  phases: Phase[];
  notes: string | null;
  updated_at: string;
};

const CATEGORIES: ExpenseCategory[] = [
  "housing_rent", "transport_fuel", "vehicle_finance", "insurance",
  "medical_insurance", "groceries", "debt", "subscriptions", "food", "other",
];

function makePhase(name = "Phase 1"): Phase {
  return { id: crypto.randomUUID(), name, leftover: 0, items: [], trash: [] };
}

function PlannerPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState("Untitled plan");
  const [phases, setPhases] = useState<Phase[]>([makePhase()]);
  const [activePhaseId, setActivePhaseId] = useState<string>(() => "");
  const [taxRatePct, setTaxRatePct] = useState("25");
  const [notes, setNotes] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);

  // form state (scoped to active phase)
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("housing_rent");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");

  // inline item editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; amount: string; category: ExpenseCategory; frequency: ExpenseFrequency }>(
    { name: "", amount: "", category: "housing_rent", frequency: "monthly" },
  );
  const [showTrash, setShowTrash] = useState(false);

  // export state
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportTarget, setExportTarget] = useState<ExportPlan | null>(null);
  const [exportBusy, setExportBusy] = useState<null | "png" | "pdf">(null);

  const currency = profile?.currency_code ?? "USD";

  // initialize active phase & tax pre-fill once profile loads
  useEffect(() => {
    if (!activePhaseId && phases[0]) setActivePhaseId(phases[0].id);
  }, [phases, activePhaseId]);

  useEffect(() => {
    if (!profile) return;
    const g = Number(profile.gross_income ?? 0);
    const n = Number(profile.net_income ?? 0);
    if (g > 0 && n > 0 && n <= g && taxRatePct === "25") {
      setTaxRatePct(((1 - n / g) * 100).toFixed(1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const { data: savedPlans = [] } = useQuery({
    queryKey: ["planner_plans"],
    queryFn: async (): Promise<SavedPlan[]> => {
      const { data, error } = await supabase
        .from("planner_plans")
        .select("id, name, tax_rate_pct, phases, notes, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        tax_rate_pct: Number(r.tax_rate_pct),
        phases: (r.phases as Phase[]) ?? [],
        notes: r.notes,
        updated_at: r.updated_at,
      }));
    },
  });

  const activePhase = phases.find((p) => p.id === activePhaseId) ?? phases[0];

  function updatePhase(id: string, patch: Partial<Phase>) {
    setPhases((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPhase() {
    const next = makePhase(`Phase ${phases.length + 1}`);
    setPhases([...phases, next]);
    setActivePhaseId(next.id);
  }

  function duplicatePhase(id: string) {
    const p = phases.find((x) => x.id === id);
    if (!p) return;
    const copy: Phase = {
      ...p,
      id: crypto.randomUUID(),
      name: `${p.name} (copy)`,
      items: p.items.map((i) => ({ ...i, id: crypto.randomUUID() })),
    };
    setPhases([...phases, copy]);
    setActivePhaseId(copy.id);
  }

  function removePhase(id: string) {
    if (phases.length === 1) return toast.error("Need at least one phase");
    const next = phases.filter((p) => p.id !== id);
    setPhases(next);
    if (activePhaseId === id) setActivePhaseId(next[0].id);
  }

  function movePhase(id: string, dir: -1 | 1) {
    const idx = phases.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= phases.length) return;
    const next = [...phases];
    [next[idx], next[target]] = [next[target], next[idx]];
    setPhases(next);
  }

  // Map planner categories to a valid expenses.category value.
  function mapCat(c: ExpenseCategory): ExpenseCategory {
    const allowed: ExpenseCategory[] = [
      "housing_rent","transport_fuel","debt","subscriptions","food",
      "groceries","vehicle_finance","insurance","medical_insurance","other",
    ];
    return allowed.includes(c) ? c : "other";
  }

  async function applyPlanToExpenses(plan: SavedPlan) {
    const totalItems = plan.phases.reduce((s, p) => s + p.items.length, 0);
    if (totalItems === 0) return toast.error("This plan has no expenses to apply");
    if (!confirm(`Add ${totalItems} planned expense${totalItems === 1 ? "" : "s"} from "${plan.name}" to your real expenses?`)) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const rows = plan.phases.flatMap((ph) =>
      ph.items.map((i) => ({
        user_id: u.user!.id,
        name: plan.phases.length > 1 ? `[${ph.name}] ${i.name}` : i.name,
        amount: i.amount,
        category: mapCat(i.category),
        frequency: i.frequency,
        is_fixed: true,
      })),
    );
    const { error } = await supabase.from("expenses").insert(rows);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expenses"] });
    toast.success(`Applied ${rows.length} expense${rows.length === 1 ? "" : "s"} from "${plan.name}"`);
  }


  function addItem(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!name || !amt || !activePhase) return;
    updatePhase(activePhase.id, {
      items: [...activePhase.items, { id: crypto.randomUUID(), name, amount: amt, category, frequency }],
    });
    setName(""); setAmount("");
  }

  function removeItem(itemId: string) {
    if (!activePhase) return;
    const item = activePhase.items.find((i) => i.id === itemId);
    if (!item) return;
    updatePhase(activePhase.id, {
      items: activePhase.items.filter((i) => i.id !== itemId),
      trash: [item, ...(activePhase.trash ?? [])],
    });
    if (editingId === itemId) setEditingId(null);
    toast("Removed — restore it from Recently removed", { duration: 3000 });
  }

  function restoreItem(itemId: string) {
    if (!activePhase) return;
    const item = (activePhase.trash ?? []).find((i) => i.id === itemId);
    if (!item) return;
    updatePhase(activePhase.id, {
      items: [...activePhase.items, item],
      trash: (activePhase.trash ?? []).filter((i) => i.id !== itemId),
    });
    toast.success(`Restored "${item.name}"`);
  }

  function purgeItem(itemId: string) {
    if (!activePhase) return;
    updatePhase(activePhase.id, { trash: (activePhase.trash ?? []).filter((i) => i.id !== itemId) });
  }

  function startEdit(item: IdealExpense) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, amount: String(item.amount), category: item.category, frequency: item.frequency });
  }

  function saveEdit() {
    if (!activePhase || !editingId) return;
    const amt = parseFloat(editDraft.amount);
    if (!editDraft.name.trim() || !Number.isFinite(amt)) return toast.error("Name and amount are required");
    updatePhase(activePhase.id, {
      items: activePhase.items.map((i) =>
        i.id === editingId
          ? { ...i, name: editDraft.name.trim(), amount: amt, category: editDraft.category, frequency: editDraft.frequency }
          : i,
      ),
    });
    setEditingId(null);
  }

  function newPlan() {
    setCurrentPlanId(null);
    setPlanName("Untitled plan");
    setPhases([makePhase()]);
    setNotes("");
    setShowLibrary(false);
  }

  function loadPlan(p: SavedPlan) {
    setCurrentPlanId(p.id);
    setPlanName(p.name);
    setPhases(p.phases.length > 0 ? p.phases : [makePhase()]);
    setTaxRatePct(String(p.tax_rate_pct));
    setNotes(p.notes ?? "");
    setActivePhaseId(p.phases[0]?.id ?? "");
    setShowLibrary(false);
    toast.success(`Loaded "${p.name}"`);
  }

  async function savePlan(asNew = false) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const payload = {
      user_id: u.user.id,
      name: planName || "Untitled plan",
      tax_rate_pct: parseFloat(taxRatePct || "0"),
      phases,
      notes: notes || null,
    };
    if (currentPlanId && !asNew) {
      const { error } = await supabase.from("planner_plans").update(payload).eq("id", currentPlanId);
      if (error) return toast.error(error.message);
      toast.success("Plan updated");
    } else {
      const { data, error } = await supabase.from("planner_plans").insert(payload).select("id").single();
      if (error || !data) return toast.error(error?.message ?? "Failed");
      setCurrentPlanId(data.id);
      toast.success(asNew ? "Saved as new plan" : "Plan saved");
    }
    qc.invalidateQueries({ queryKey: ["planner_plans"] });
  }

  async function deletePlan(id: string) {
    if (!confirm("Delete this saved plan?")) return;
    const { error } = await supabase.from("planner_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (currentPlanId === id) newPlan();
    qc.invalidateQueries({ queryKey: ["planner_plans"] });
    toast.success("Deleted");
  }

  async function runExport(plan: ExportPlan, kind: "png" | "pdf") {
    setExportTarget(plan);
    setExportBusy(kind);
    // Wait two frames so the hidden sheet is in the DOM and laid out.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const node = exportRef.current;
      if (!node) throw new Error("Export node not ready");
      if (kind === "png") await exportPlanImage(node, plan.name);
      else await exportPlanPdf(node, plan.name);
      toast.success(kind === "png" ? "Image downloaded" : "PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExportBusy(null);
      setExportTarget(null);
    }
  }

  function currentAsExportPlan(): ExportPlan {
    return {
      name: planName || "Untitled plan",
      tax_rate_pct: parseFloat(taxRatePct || "0"),
      phases,
      notes: notes || null,
    };
  }

  // computations
  const phaseMonthly = (p: Phase) => p.items.reduce((s, i) => s + monthlyEquivalent(i), 0);
  const totalMonthly = phases.reduce((s, p) => s + phaseMonthly(p), 0);
  const totalLeftover = phases.reduce((s, p) => s + (Number(p.leftover) || 0), 0);
  const requiredNet = totalMonthly + totalLeftover;
  const taxRate = Math.max(0, Math.min(80, parseFloat(taxRatePct || "0"))) / 100;
  const requiredGross = taxRate < 1 ? requiredNet / (1 - taxRate) : requiredNet;
  const currentNet = Number(profile?.net_income ?? 0);
  const gap = requiredNet - currentNet;

  const activeMonthly = activePhase ? phaseMonthly(activePhase) : 0;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center justify-between px-6 md:px-8 gap-3">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Calculator className="size-3.5" /> Salary Planner
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLibrary(true)}
            className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded border border-border hover:border-accent flex items-center gap-1.5">
            <FileText className="size-3" /> Saved ({savedPlans.length})
          </button>
          <button onClick={newPlan}
            className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded border border-border hover:border-accent">
            + New
          </button>
        </div>
      </header>

      {/* Saved plans drawer */}
      {showLibrary && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center p-6 overflow-y-auto"
          onClick={() => setShowLibrary(false)}>
          <div className="panel max-w-2xl w-full mt-16 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2"><Clock className="size-3.5" /> Plan history</h3>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
                  {savedPlans.length} saved · newest first
                </p>
              </div>
              <button onClick={() => setShowLibrary(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
              {savedPlans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No saved plans yet.</p>
              ) : savedPlans.map((p) => (
                <SavedPlanRow key={p.id} p={p} currency={currency} isCurrent={currentPlanId === p.id}
                  onLoad={() => loadPlan(p)} onDelete={() => deletePlan(p.id)} onApply={() => applyPlanToExpenses(p)}
                  onExport={(kind) => runExport({ name: p.name, tax_rate_pct: p.tax_rate_pct, phases: p.phases, notes: p.notes }, kind)}
                  exportBusy={exportBusy} />
              ))}
            </div>
          </div>

        </div>
      )}

      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          {/* Plan name */}
          <section className="space-y-2 animate-enter">
            <div className="flex items-center gap-2">
              <Pencil className="size-3 text-muted-foreground shrink-0" />
              <input value={planName} onChange={(e) => setPlanName(e.target.value)}
                className="flex-1 bg-transparent border-none text-3xl md:text-4xl font-display font-extrabold tracking-tight focus:outline-none" />
            </div>
            <p className="text-muted-foreground text-sm max-w-md leading-relaxed">
              Sketch the life you want across one or more phases — different lifestyles, timelines, or "what-ifs". We'll tell you what your paycheck needs to be.
            </p>
          </section>

          {/* Phase tabs */}
          <section className="space-y-3 animate-enter [animation-delay:50ms]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Layers className="size-3" /> Phases
              </span>
              {phases.map((p, idx) => (
                <div key={p.id} className={`flex items-center rounded-lg border transition ${
                  activePhaseId === p.id ? "border-accent bg-accent/10" : "border-border hover:border-muted-foreground"
                }`}>
                  <button onClick={() => setActivePhaseId(p.id)}
                    className={`text-xs px-3 py-1.5 ${activePhaseId === p.id ? "text-accent" : "text-muted-foreground"}`}>
                    {p.name}
                    <span className="ml-2 text-[9px] font-mono opacity-60">{formatCurrency(phaseMonthly(p), currency)}</span>
                  </button>
                  {phases.length > 1 && (
                    <div className="flex items-center border-l border-border">
                      <button onClick={() => movePhase(p.id, -1)} disabled={idx === 0}
                        title="Move left" className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ArrowUp className="size-3 -rotate-90" />
                      </button>
                      <button onClick={() => movePhase(p.id, 1)} disabled={idx === phases.length - 1}
                        title="Move right" className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 border-l border-border">
                        <ArrowDown className="size-3 -rotate-90" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button onClick={addPhase}
                className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg border border-dashed border-border hover:border-accent hover:text-accent flex items-center gap-1">
                <Plus className="size-3" /> Phase
              </button>
            </div>

            {activePhase && (
              <div className="panel p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="md:col-span-2 block space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Phase name</span>
                    <input value={activePhase.name} onChange={(e) => updatePhase(activePhase.id, { name: e.target.value })}
                      className="field" />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Leftover this phase</span>
                    <input type="number" step="0.01" value={activePhase.leftover || ""}
                      onChange={(e) => updatePhase(activePhase.id, { leftover: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                  </label>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
                  <button onClick={() => duplicatePhase(activePhase.id)} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Copy className="size-3" /> Duplicate
                  </button>
                  {phases.length > 1 && (
                    <button onClick={() => removePhase(activePhase.id)} className="text-muted-foreground hover:text-alert flex items-center gap-1">
                      <Trash2 className="size-3" /> Remove phase
                    </button>
                  )}
                  <span className="ml-auto text-muted-foreground normal-case">
                    Phase monthly: <span className="text-foreground">{formatCurrency(activeMonthly, currency)}</span>
                  </span>
                </div>
              </div>
            )}
          </section>

          <form onSubmit={addItem} className="panel p-5 space-y-3 animate-enter [animation-delay:100ms]">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Add expense to "{activePhase?.name}"
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dream apartment"
                className="field" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="Amount"
                className="field" />
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
            <button type="submit" className="w-full btn-accent py-2 text-sm font-bold flex items-center justify-center gap-2">
              <Plus className="size-3.5" /> Add
            </button>
          </form>

          <div className="space-y-1">
            {!activePhase || activePhase.items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
                Start sketching this phase above.
              </p>
            ) : activePhase.items.map((i) => (
              editingId === i.id ? (
                <div key={i.id} className="bg-surface border border-accent/40 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      placeholder="Name"
                      className="field" />
                    <input value={editDraft.amount} onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                      type="number" step="0.01" placeholder="Amount"
                      className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                    <select value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value as ExpenseCategory })}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </select>
                    <select value={editDraft.frequency} onChange={(e) => setEditDraft({ ...editDraft, frequency: e.target.value as ExpenseFrequency })}
                      className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={saveEdit}
                      className="btn-accent px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                      <Check className="size-3" /> Save
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="border border-border rounded-lg px-3 py-1.5 text-xs font-bold hover:border-accent">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
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
                  <button onClick={() => startEdit(i)} title="Edit"
                    className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-accent">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => removeItem(i.id)} title="Remove"
                    className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-alert">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )
            ))}
          </div>

          {/* Recently removed from this phase */}
          {activePhase && (activePhase.trash?.length ?? 0) > 0 && (
            <div className="border border-border rounded-lg bg-surface/50">
              <button onClick={() => setShowTrash((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
                <span className="flex items-center gap-2">
                  <Undo2 className="size-3" /> Recently removed ({activePhase.trash!.length})
                </span>
                {showTrash ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
              {showTrash && (
                <div className="border-t border-border p-2 space-y-1">
                  {activePhase.trash!.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-surface">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs truncate text-muted-foreground">{i.name}</span>
                        <span className="ml-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
                          {CATEGORY_LABELS[i.category]} · {i.frequency}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{formatCurrency(i.amount, currency)}</span>
                      <button onClick={() => restoreItem(i.id)}
                        className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border border-accent/40 text-accent hover:bg-accent/10">
                        Restore
                      </button>
                      <button onClick={() => purgeItem(i.id)} title="Remove permanently"
                        className="text-muted-foreground hover:text-alert">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          <label className="block space-y-1 pt-4">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Assumptions, context, anything worth remembering later…"
              className="field resize-none" />
          </label>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="panel p-5 space-y-4 sticky top-6">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Your target</h3>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Effective tax rate</label>
              <div className="flex items-center gap-2">
                <input type="number" step="0.5" min="0" max="80" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            {phases.length > 1 && (
              <div className="pt-3 border-t border-border space-y-1.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Phase breakdown</span>
                {phases.map((p) => (
                  <div key={p.id} className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground truncate">{p.name}</span>
                    <span className="font-mono">{formatCurrency(phaseMonthly(p) + (p.leftover || 0), currency)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-border space-y-3">
              <ResultRow label="Ideal monthly expenses" value={formatCurrency(totalMonthly, currency)} />
              <ResultRow label="+ Leftover target" value={formatCurrency(totalLeftover, currency)} />
              <ResultRow label="Required NET / month" value={formatCurrency(requiredNet, currency)} strong />
              <ResultRow label="Required GROSS / month" value={formatCurrency(requiredGross, currency)} strong accent />
              <ResultRow label="Annual gross" value={formatCurrency(requiredGross * 12, currency)} muted />
            </div>

            {profile && currentNet > 0 && (
              <div className={`rounded-lg p-3 text-xs ${gap <= 0 ? "bg-accent/10 text-accent border border-accent/20" : "bg-caution/10 text-caution border border-caution/20"}`}>
                {gap <= 0 ? (
                  <>Your current take-home already covers this by <span className="font-mono font-bold">{formatCurrency(-gap, currency)}</span>/mo.</>
                ) : (
                  <>You'd need <span className="font-mono font-bold">{formatCurrency(gap, currency)}</span> more per month (net) to fund this.</>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-border grid grid-cols-2 gap-2">
              <button onClick={() => savePlan(false)}
                className="btn-accent py-2 text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90">
                <Save className="size-3" /> {currentPlanId ? "Update" : "Save"}
              </button>
              <button onClick={() => savePlan(true)}
                className="border border-border rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-accent">
                <Copy className="size-3" /> Save as new
              </button>
            </div>
            <button
              onClick={async () => {
                // Apply the current in-editor state as a plan (save first if unsaved to keep traceability).
                let planToApply: SavedPlan | null = savedPlans.find((sp) => sp.id === currentPlanId) ?? null;
                if (!planToApply) {
                  if (!confirm("Save this plan first, then apply its expenses?")) return;
                  await savePlan(false);
                  // fall through: use in-memory phases as source of truth
                }
                const live: SavedPlan = planToApply ?? {
                  id: currentPlanId ?? "temp",
                  name: planName || "Untitled plan",
                  tax_rate_pct: parseFloat(taxRatePct || "0"),
                  phases,
                  notes: notes || null,
                  updated_at: new Date().toISOString(),
                };
                // use in-memory phases if editing
                await applyPlanToExpenses({ ...live, phases });
              }}
              className="w-full border border-accent/40 text-accent rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-accent/10">
              <Send className="size-3" /> Apply plan to expenses
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => runExport(currentAsExportPlan(), "pdf")}
                disabled={!!exportBusy}
                className="border border-border rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-accent disabled:opacity-50">
                <Download className="size-3" /> {exportBusy === "pdf" ? "Exporting…" : "Download PDF"}
              </button>
              <button
                onClick={() => runExport(currentAsExportPlan(), "png")}
                disabled={!!exportBusy}
                className="border border-border rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-accent disabled:opacity-50">
                <ImageIcon className="size-3" /> {exportBusy === "png" ? "Exporting…" : "Download PNG"}
              </button>
            </div>




            <p className="text-[10px] text-muted-foreground leading-relaxed pt-2 border-t border-border">
              Rough estimate — real payroll deductions vary by locale, pension, benefits, and bracket edges.
            </p>
          </div>
        </div>
      </div>

      {/* Hidden export sheet — rendered off-screen while an export is in flight */}
      {exportTarget && (
        <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none", zIndex: -1 }} aria-hidden>
          <PlanExportSheet plan={exportTarget} currency={currency} innerRef={exportRef} />
        </div>
      )}
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

function SavedPlanRow({ p, currency, isCurrent, onLoad, onDelete, onApply, onExport, exportBusy }: {
  p: SavedPlan; currency: string; isCurrent: boolean;
  onLoad: () => void; onDelete: () => void; onApply: () => void;
  onExport: (kind: "png" | "pdf") => void; exportBusy: null | "png" | "pdf";
}) {
  const [open, setOpen] = useState(false);
  const phaseMonthly = (ph: Phase) => ph.items.reduce((s, i) => s + monthlyEquivalent(i), 0);
  const totalMonthly = p.phases.reduce((s, ph) => s + phaseMonthly(ph), 0);
  const totalItems = p.phases.reduce((s, ph) => s + ph.items.length, 0);
  const ts = new Date(p.updated_at);
  return (
    <div className={`rounded-lg border transition ${isCurrent ? "border-accent bg-accent/5" : "border-border"}`}>
      <div className="flex items-center gap-2 p-3">
        <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground">
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <button onClick={onLoad} className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium truncate">{p.name}</div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            {p.phases.length} phase{p.phases.length !== 1 ? "s" : ""} · {totalItems} item{totalItems !== 1 ? "s" : ""} · {formatCurrency(totalMonthly, currency)}/mo
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
            {ts.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </button>
        <button onClick={onApply} title="Apply expenses to your real expense list"
          className="text-[10px] font-mono uppercase tracking-widest px-2 py-1.5 rounded border border-accent/40 text-accent hover:bg-accent/10 flex items-center gap-1">
          <Send className="size-3" /> Apply
        </button>
        <button onClick={onDelete} className="text-muted-foreground hover:text-alert" title="Delete plan">
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {open && (
        <div className="border-t border-border p-3 space-y-3 bg-background/40">
          {p.notes && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{p.notes}</p>
          )}
          {p.phases.map((ph) => (
            <div key={ph.id} className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold">{ph.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {formatCurrency(phaseMonthly(ph), currency)}/mo
                  {ph.leftover > 0 && <> · +{formatCurrency(ph.leftover, currency)} leftover</>}
                </span>
              </div>
              {ph.items.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic pl-2">No items</p>
              ) : (
                <ul className="pl-2 space-y-0.5">
                  {ph.items.map((i) => (
                    <li key={i.id} className="flex items-baseline justify-between text-[11px]">
                      <span className="truncate text-muted-foreground">{i.name} <span className="opacity-60">· {i.frequency}</span></span>
                      <span className="font-mono">{formatCurrency(i.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className="pt-2 border-t border-border flex items-baseline justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Tax rate</span>
            <span className="text-xs font-mono">{p.tax_rate_pct}%</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={() => onExport("pdf")} disabled={!!exportBusy}
              className="text-[10px] font-mono uppercase tracking-widest px-2 py-1.5 rounded border border-border hover:border-accent flex items-center justify-center gap-1 disabled:opacity-50">
              <Download className="size-3" /> {exportBusy === "pdf" ? "Exporting…" : "PDF"}
            </button>
            <button onClick={() => onExport("png")} disabled={!!exportBusy}
              className="text-[10px] font-mono uppercase tracking-widest px-2 py-1.5 rounded border border-border hover:border-accent flex items-center justify-center gap-1 disabled:opacity-50">
              <ImageIcon className="size-3" /> {exportBusy === "png" ? "Exporting…" : "Image"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

