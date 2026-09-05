import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useExpenses } from "@/hooks/use-profile";
import { formatCurrency } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { reconcile } from "@/lib/reconcile";
import type { Txn } from "@/lib/statement-parse";
import { AlertTriangle, Check, CheckCircle2, Loader2, Scale, X } from "lucide-react";
import { toast } from "sonner";

export function ReconcilePanel({ txns, currency }: { txns: Txn[]; currency: string }) {
  const qc = useQueryClient();
  const { data: expenses = [] } = useExpenses();
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  const [accepted, setAccepted] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const rec = useMemo(() => reconcile(txns, expenses), [txns, expenses]);

  async function accept(key: string, name: string, category: string, amount: number) {
    setBusy(key);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setBusy(null);
    const { error } = await supabase.from("expenses").insert({
      user_id: u.user.id,
      name,
      category,
      amount: Math.round(amount * 100) / 100,
      frequency: "monthly",
      is_fixed: false,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    setAccepted((a) => ({ ...a, [key]: true }));
    await qc.invalidateQueries({ queryKey: ["expenses"] });
    toast.success(`${name} added to your expenses`);
  }

  const suggestions = rec.unmatchedStatement.filter((s) => !dismissed[s.key] && !accepted[s.key]);
  const flagged = rec.unmatchedLogged.filter((s) => !dismissed[s.key]);

  return (
    <section className="tile p-6">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-4 text-left">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          <Scale className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="label-xs">Bookkeeping</p>
          <h3 className="text-[15px] font-semibold tracking-tight">Reconcile with logged expenses</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {rec.matched.length} matched · {suggestions.length} to add · {flagged.length} to review
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-6 space-y-6">
          <Group
            title="Matched"
            icon={<CheckCircle2 className="size-3.5 text-accent" />}
            empty="Nothing matched up yet."
            rows={rec.matched.map((m) => ({
              key: m.key,
              left: m.txn.description,
              sub: `Logged as ${m.expense.name}`,
              right: formatCurrency(m.txn.amount, currency, { decimals: 0 }),
              note:
                Math.abs(m.delta) > 1
                  ? `${m.delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(m.delta), currency, { decimals: 0 })} vs logged`
                  : "Amounts agree",
            }))}
          />

          <div>
            <p className="label-xs mb-2 flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-caution" /> In your statement, not logged
            </p>
            {suggestions.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing outstanding.</p>}
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <div key={s.key} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{s.txn.description}</p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {categoryLabel(s.txn.category)} · {s.count} transaction{s.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="numeric text-sm">{formatCurrency(s.total, currency, { decimals: 0 })}</span>
                  <button
                    onClick={() => accept(s.key, s.txn.description.slice(0, 60), s.txn.category, s.total)}
                    disabled={busy === s.key}
                    className="btn-accent !px-3 !py-1.5 text-[12px]"
                  >
                    {busy === s.key ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Add
                  </button>
                  <button
                    onClick={() => setDismissed((d) => ({ ...d, [s.key]: true }))}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="label-xs mb-2 flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-alert" /> Logged, but not in your statement
            </p>
            {flagged.length === 0 && <p className="text-[13px] text-muted-foreground">Everything you logged showed up.</p>}
            <div className="flex flex-col gap-2">
              {flagged.map((f) => (
                <div key={f.key} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{f.expense.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {categoryLabel(f.expense.category)} · worth checking
                    </p>
                  </div>
                  <span className="numeric text-sm">{formatCurrency(f.monthly, currency, { decimals: 0 })}</span>
                  <button
                    onClick={() => setDismissed((d) => ({ ...d, [f.key]: true }))}
                    className="btn-ghost !px-3 !py-1.5 text-[12px]"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { key: string; left: string; sub: string; right: string; note: string }[];
  empty: string;
}) {
  return (
    <div>
      <p className="label-xs mb-2 flex items-center gap-2">
        {icon} {title}
      </p>
      {rows.length === 0 && <p className="text-[13px] text-muted-foreground">{empty}</p>}
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{r.left}</p>
              <p className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{r.sub}</p>
            </div>
            <div className="text-right">
              <p className="numeric text-sm">{r.right}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{r.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
