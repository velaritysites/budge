import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { formatCurrency } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({ meta: [{ title: "Goals — CanIAfford" }] }),
  component: GoalsPage,
});

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
};

function GoalsPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [date, setDate] = useState("");

  const { data: goals = [] } = useQuery({
    queryKey: ["goals"],
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select("id, name, target_amount, current_amount, target_date")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string, name: r.name as string,
        target_amount: Number(r.target_amount), current_amount: Number(r.current_amount),
        target_date: r.target_date as string | null,
      }));
    },
  });

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !target) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("savings_goals").insert({
      user_id: u.user.id,
      name, target_amount: parseFloat(target),
      current_amount: parseFloat(current || "0"),
      target_date: date || null,
    });
    if (error) return toast.error(error.message);
    setName(""); setTarget(""); setCurrent(""); setDate("");
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  async function deleteGoal(id: string) {
    await supabase.from("savings_goals").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  async function updateProgress(id: string, val: number) {
    await supabase.from("savings_goals").update({ current_amount: val }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  const currency = profile?.currency_code ?? "USD";

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Goals</span>
      </header>

      <div className="p-6 md:p-8 max-w-3xl mx-auto w-full space-y-8">
        <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic animate-enter">
          What are you saving for?
        </h1>

        <form onSubmit={addGoal} className="bg-surface border border-border rounded-lg p-5 space-y-3 animate-enter [animation-delay:100ms]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name (e.g. Emergency fund)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={target} onChange={(e) => setTarget(e.target.value)} type="number" step="0.01" placeholder="Target amount"
              className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
            <input value={current} onChange={(e) => setCurrent(e.target.value)} type="number" step="0.01" placeholder="Current (optional)"
              className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date"
              className="bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <button type="submit" className="w-full bg-accent text-accent-foreground rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-2">
            <Plus className="size-3.5" /> Add goal
          </button>
        </form>

        <div className="space-y-3">
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No goals yet.</p>
          ) : goals.map((g) => {
            const pct = Math.min(100, (g.current_amount / g.target_amount) * 100);
            return (
              <div key={g.id} className="bg-surface border border-border rounded-lg p-5 group animate-enter">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-lg">{g.name}</h3>
                    {g.target_date && (
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        by {new Date(g.target_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <button onClick={() => deleteGoal(g.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-alert transition">
                    <Trash2 className="size-3.5" />
                  </button>
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
                  <input
                    type="number"
                    defaultValue={g.current_amount}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v !== g.current_amount) updateProgress(g.id, v);
                    }}
                    className="w-24 text-right bg-transparent text-muted-foreground hover:text-foreground focus:text-foreground focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
