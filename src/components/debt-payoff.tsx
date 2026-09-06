import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { formatCurrency } from "@/lib/format";
import {
  DEBT_TYPE_LABELS,
  simulatePayoff,
  type Debt,
  type DebtAccountType,
  type PayoffResult,
} from "@/lib/debt";
import { toast } from "sonner";
import { Landmark, Plus, Trash2, Check } from "lucide-react";

export function DebtPayoff() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const currency = profile?.currency_code ?? "ZAR";

  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [rate, setRate] = useState("");
  const [minPay, setMinPay] = useState("");
  const [type, setType] = useState<DebtAccountType>("credit_card");
  const [extra, setExtra] = useState("");

  const { data: debts = [] } = useQuery({
    queryKey: ["debts"],
    queryFn: async (): Promise<Debt[]> => {
      const { data, error } = await supabase
        .from("debts")
        .select("id, name, balance, interest_rate, min_payment, account_type")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        balance: Number(r.balance),
        interest_rate: Number(r.interest_rate),
        min_payment: Number(r.min_payment),
        account_type: r.account_type as DebtAccountType,
      }));
    },
  });

  const extraNum = Number(extra || profile?.debt_extra_payment || 0);

  const avalanche = useMemo(
    () => (debts.length >= 2 ? simulatePayoff(debts, "avalanche", extraNum) : null),
    [debts, extraNum],
  );
  const snowball = useMemo(
    () => (debts.length >= 2 ? simulatePayoff(debts, "snowball", extraNum) : null),
    [debts, extraNum],
  );

  async function addDebt() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (!name || !balance) return toast.error("Name and balance are required");
    const { error } = await supabase.from("debts").insert({
      user_id: u.user.id,
      name,
      balance: parseFloat(balance || "0"),
      interest_rate: parseFloat(rate || "0"),
      min_payment: parseFloat(minPay || "0"),
      account_type: type,
    });
    if (error) return toast.error(error.message);
    setName(""); setBalance(""); setRate(""); setMinPay("");
    qc.invalidateQueries({ queryKey: ["debts"] });
  }

  async function removeDebt(id: string) {
    await supabase.from("debts").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["debts"] });
  }

  async function chooseStrategy(s: "avalanche" | "snowball") {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ debt_strategy: s, debt_extra_payment: extraNum })
      .eq("id", u.user.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success(`${s === "avalanche" ? "Avalanche" : "Snowball"} strategy saved`);
  }

  async function addToExpensePlan(s: "avalanche" | "snowball") {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (extraNum <= 0) return toast.error("Set an extra monthly amount above minimums first");
    const label = `Extra debt repayment (${s === "avalanche" ? "Avalanche" : "Snowball"})`;
    const { data: existing } = await supabase
      .from("expenses")
      .select("id")
      .eq("name", label)
      .is("deleted_at", null)
      .limit(1);
    if (existing && existing.length > 0) {
      await supabase.from("expenses").update({ amount: extraNum }).eq("id", existing[0].id);
    } else {
      const { error } = await supabase.from("expenses").insert({
        user_id: u.user.id,
        name: label,
        category: "debt_repayments",
        amount: extraNum,
        frequency: "monthly",
        is_fixed: true,
      });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["expenses"] });
    toast.success("Suggested repayment added to your expense plan");
  }

  const chosen = (profile as any)?.debt_strategy as "avalanche" | "snowball" | null | undefined;
  const money = (n: number) => formatCurrency(n, currency, { decimals: 0 });

  return (
    <section className="panel p-6 md:p-7">
      <div className="flex items-center gap-2">
        <Landmark className="size-3.5 text-accent" />
        <span className="label-xs">Debt payoff</span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        Add each debt you're carrying and Loot compares two ways of clearing them.
      </p>

      {/* list */}
      <div className="mt-5 flex flex-col gap-1">
        {debts.length === 0 ? (
          <p className="py-3 text-[12px] text-muted-foreground">No debts added yet.</p>
        ) : (
          debts.map((d) => (
            <div key={d.id} className="group flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface-2/40 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {DEBT_TYPE_LABELS[d.account_type] ?? d.account_type} · {d.interest_rate}% · min {money(d.min_payment)}
                </p>
              </div>
              <span className="numeric text-sm font-semibold">{money(d.balance)}</span>
              <button onClick={() => removeDebt(d.id)} className="text-muted-foreground transition hover:text-alert">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* add form */}
      <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-hairline p-3 md:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Debt name" className="field" />
        <select value={type} className="field" onChange={(e) => setType(e.target.value as DebtAccountType)} className="field">
          {(Object.keys(DEBT_TYPE_LABELS) as DebtAccountType[]).map((k) => (
            <option key={k} value={k}>{DEBT_TYPE_LABELS[k]}</option>
          ))}
        </select>
        <input value={balance} onChange={(e) => setBalance(e.target.value)} type="number" step="0.01" placeholder="Outstanding balance" className="field numeric" />
        <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" step="0.01" placeholder="Interest rate % p.a." className="field numeric" />
        <input value={minPay} onChange={(e) => setMinPay(e.target.value)} type="number" step="0.01" placeholder="Minimum monthly payment" className="field numeric" />
        <button onClick={addDebt} className="btn-accent justify-center">
          <Plus className="size-3.5" /> Add debt
        </button>
      </div>

      {debts.length < 2 ? (
        <p className="mt-4 text-[12px] text-muted-foreground">Add at least two debts to compare payoff strategies.</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="label-xs">Extra per month above minimums</label>
              <input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                type="number"
                step="0.01"
                placeholder={String(profile?.debt_extra_payment ?? 0)}
                className="field numeric mt-2 w-full"
              />
            </div>
            <span className="pb-2 text-[12px] text-muted-foreground">
              Total monthly payment: <strong className="numeric">{money(avalanche?.monthlyPayment ?? 0)}</strong>
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StrategyCard
              title="Avalanche"
              subtitle="Highest interest rate first — least interest paid"
              result={avalanche!}
              currency={currency}
              chosen={chosen === "avalanche"}
              onChoose={() => chooseStrategy("avalanche")}
              onApply={() => addToExpensePlan("avalanche")}
            />
            <StrategyCard
              title="Snowball"
              subtitle="Smallest balance first — fastest early wins"
              result={snowball!}
              currency={currency}
              chosen={chosen === "snowball"}
              onChoose={() => chooseStrategy("snowball")}
              onApply={() => addToExpensePlan("snowball")}
            />
          </div>

          <div className="mt-4 rounded-xl border border-hairline bg-surface-2/50 p-4 text-[13px] leading-relaxed">
            The Avalanche method saves you{" "}
            <strong className="numeric">{money(Math.max(0, (snowball!.totalInterest) - avalanche!.totalInterest))}</strong>{" "}
            in interest compared to Snowball. The Snowball method gets you your first win{" "}
            <strong>{Math.max(0, avalanche!.firstWinMonths - snowball!.firstWinMonths)}</strong> months earlier.
          </div>
        </>
      )}
    </section>
  );
}

function StrategyCard({
  title, subtitle, result, currency, chosen, onChoose, onApply,
}: {
  title: string;
  subtitle: string;
  result: PayoffResult;
  currency: string;
  chosen: boolean;
  onChoose: () => void;
  onApply: () => void;
}) {
  const money = (n: number) => formatCurrency(n, currency, { decimals: 0 });
  return (
    <div className={`rounded-2xl border p-5 ${chosen ? "border-accent/40 bg-accent/[0.06]" : "border-hairline bg-surface-2/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold tracking-tight">{title}</p>
          <p className="text-[12px] text-muted-foreground">{subtitle}</p>
        </div>
        {chosen && <span className="pill text-accent">Chosen</span>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="label-xs">Total interest</p>
          <p className="numeric font-display mt-1 text-lg font-bold">{money(result.totalInterest)}</p>
        </div>
        <div>
          <p className="label-xs">Debt free in</p>
          <p className="numeric font-display mt-1 text-lg font-bold">{result.totalMonths} months</p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-[var(--hairline)]">
        {result.order.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 py-2">
            <span className="numeric w-5 font-mono text-[11px] text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.name}</span>
            <span className="text-[11px] text-muted-foreground">{s.clearedLabel}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onChoose} className="btn-accent">
          <Check className="size-3.5" /> {chosen ? "Keep this strategy" : "Choose this strategy"}
        </button>
        <button onClick={onApply} className="btn-ghost">Add to expense plan</button>
      </div>
    </div>
  );
}
