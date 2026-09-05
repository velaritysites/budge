import { useQueryClient } from "@tanstack/react-query";
import { dismissAlert, useOpenAlerts } from "@/lib/alerts";
import { categoryLabel } from "@/lib/categories";
import { formatCurrency } from "@/lib/format";
import { AlertTriangle, X } from "lucide-react";

export function AnomalyAlerts({
  currency,
  onSeeWhatChanged,
}: {
  currency: string;
  onSeeWhatChanged?: (category: string) => void;
}) {
  const { data: alerts = [] } = useOpenAlerts();
  const qc = useQueryClient();

  if (alerts.length === 0) return null;

  async function dismiss(id: string) {
    await dismissAlert(id);
    qc.invalidateQueries({ queryKey: ["spending_alerts"] });
  }

  return (
    <section className="flex flex-col gap-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-caution/30 bg-caution/[0.07] p-4"
        >
          <AlertTriangle className="size-4 shrink-0 text-caution" />
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed">
            Your {categoryLabel(a.category)} spend this month is{" "}
            <strong className="numeric">{formatCurrency(a.amount, currency, { decimals: 0 })}</strong> —{" "}
            {a.pct_above.toFixed(0)}% above your usual{" "}
            <strong className="numeric">{formatCurrency(a.average, currency, { decimals: 0 })}</strong>.
          </p>
          {onSeeWhatChanged && (
            <button
              onClick={() => onSeeWhatChanged(a.category)}
              className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-accent"
            >
              See what changed →
            </button>
          )}
          <button onClick={() => dismiss(a.id)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </section>
  );
}
