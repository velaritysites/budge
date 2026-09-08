import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import {
  ASSET_CATEGORIES,
  LIABILITY_CATEGORIES,
  VEHICLE_DEPRECIATION_PCT,
  deleteNetWorthItem,
  netWorthMeaning,
  netWorthTotals,
  recordNetWorthOnSnapshot,
  saveNetWorthItem,
  useNetWorthItems,
  type NetWorthKind,
} from "@/lib/networth";
import { currentMonthKey } from "@/lib/finance";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { LootSelect } from "@/components/ui/loot-select";

export function NetWorthTab({ currency }: { currency: string }) {
  const qc = useQueryClient();
  const { data: items = [] } = useNetWorthItems();
  const totals = useMemo(() => netWorthTotals(items), [items]);
  const [adding, setAdding] = useState<NetWorthKind | null>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["snapshots", "net_worth"],
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_snapshots")
        .select("month, net_worth")
        .not("net_worth", "is", null)
        .order("month", { ascending: true })
        .limit(60);
      return (data ?? []).map((r: any) => ({ month: r.month as string, value: Number(r.net_worth) }));
    },
  });

  // Keep this month's snapshot in step with the current figures.
  useEffect(() => {
    if (items.length === 0) return;
    recordNetWorthOnSnapshot(currentMonthKey(), totals).then(() => {
      qc.invalidateQueries({ queryKey: ["snapshots", "net_worth"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, Math.round(totals.netWorth)]);

  const firstTime = items.length > 0 && history.length <= 1;

  async function remove(id: string) {
    await deleteNetWorthItem(id);
    qc.invalidateQueries({ queryKey: ["net_worth_items"] });
  }

  return (
    <div className="animate-enter space-y-8">
      <section className="panel p-6 md:p-8">
        <p className="label-xs">Net worth</p>
        <h2 className="numeric text-4xl md:text-5xl font-display font-extrabold tracking-tight">
          {formatCurrency(totals.netWorth, currency, { decimals: 0 })}
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {formatCurrency(totals.assets, currency, { decimals: 0 })} owned minus{" "}
          {formatCurrency(totals.liabilities, currency, { decimals: 0 })} owed.
        </p>

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Add what you own and what you owe below to see your net worth and track it month by month.
          </p>
        ) : firstTime ? (
          <div className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.06] p-4 text-[13px] leading-relaxed">
            <p className="mb-1 flex items-center gap-2 font-semibold">
              <TrendingUp className="size-4 text-accent" /> This is your first net worth figure.
            </p>
            <p className="text-muted-foreground">{netWorthMeaning(totals.netWorth, totals.assets)}</p>
          </div>
        ) : null}

        {history.length > 1 && <NetWorthChart points={history} currency={currency} />}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Column
          title="Assets"
          tone="accent"
          total={totals.assets}
          currency={currency}
          rows={items.filter((i) => i.kind === "asset")}
          onAdd={() => setAdding("asset")}
          onRemove={remove}
        />
        <Column
          title="Liabilities"
          tone="alert"
          total={totals.liabilities}
          currency={currency}
          rows={items.filter((i) => i.kind === "liability")}
          onAdd={() => setAdding("liability")}
          onRemove={remove}
        />
      </div>

      {adding && <ItemForm kind={adding} onDone={() => setAdding(null)} />}
    </div>
  );
}

function Column({
  title,
  tone,
  total,
  currency,
  rows,
  onAdd,
  onRemove,
}: {
  title: string;
  tone: "accent" | "alert";
  total: number;
  currency: string;
  rows: { id: string; label: string; value: number; depreciation_pct: number }[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="label-xs">{title}</p>
          <p className={`numeric text-xl font-semibold ${tone === "accent" ? "text-accent" : "text-alert"}`}>
            {formatCurrency(total, currency, { decimals: 0 })}
          </p>
        </div>
        <button onClick={onAdd} className="btn-ghost !px-3">
          <Plus className="size-4" /> Add
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing added yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm">
              {r.label}
              {r.depreciation_pct > 0 && (
                <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  −{r.depreciation_pct}%/yr
                </span>
              )}
            </span>
            <span className="numeric text-sm">{formatCurrency(r.value, currency, { decimals: 0 })}</span>
            <button onClick={() => onRemove(r.id)} className="text-muted-foreground hover:text-alert" aria-label="Remove">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ItemForm({ kind, onDone }: { kind: NetWorthKind; onDone: () => void }) {
  const qc = useQueryClient();
  const cats = kind === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
  const [category, setCategory] = useState<string>(cats[0]!.key);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter an amount");
    setSaving(true);
    try {
      await saveNetWorthItem({
        kind,
        category,
        label: label.trim() || cats.find((c) => c.key === category)!.label,
        value: amount,
        depreciation_pct: category === "vehicle" ? VEHICLE_DEPRECIATION_PCT : 0,
      });
      qc.invalidateQueries({ queryKey: ["net_worth_items"] });
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md space-y-4 p-6">
        <h3 className="text-lg font-display font-bold tracking-tight">
          Add {kind === "asset" ? "an asset" : "a liability"}
        </h3>
        <label className="block">
          <span className="label-xs">Type</span>
          <LootSelect value={category} onValueChange={setCategory} className="mt-1" ariaLabel="Net worth item type" options={cats.map((c) => ({ value: c.key, label: c.label }))} />
        </label>
        <label className="block">
          <span className="label-xs">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={cats.find((c) => c.key === category)!.label}
            className="mt-1 w-full rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="label-xs">Value</span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-sm numeric"
          />
        </label>
        {category === "vehicle" && (
          <p className="text-[12px] text-muted-foreground">
            Vehicles depreciate — Loot reduces this value by {VEHICLE_DEPRECIATION_PCT}% a year automatically.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onDone} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NetWorthChart({ points, currency }: { points: { month: string; value: number }[]; currency: string }) {
  const w = 720;
  const h = 160;
  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const x = (i: number) => (points.length === 1 ? 0 : (i / (points.length - 1)) * w);
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  return (
    <div className="mt-6">
      <p className="label-xs mb-2">Net worth over time</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" preserveAspectRatio="none">
        <path d={d} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{new Date(points[0]!.month).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</span>
        <span>{formatCurrency(points[points.length - 1]!.value, currency, { compact: true })}</span>
      </div>
    </div>
  );
}
