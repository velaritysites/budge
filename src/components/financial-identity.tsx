import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildIdentity, type IdentitySnap } from "@/lib/identity";
import { useProfile } from "@/hooks/use-profile";

export function FinancialIdentity() {
  const { data: profile } = useProfile();

  const { data: snaps = [] } = useQuery({
    queryKey: ["snapshots", "identity"],
    queryFn: async (): Promise<IdentitySnap[]> => {
      const { data, error } = await supabase
        .from("monthly_snapshots")
        .select("month, net_income, total_expenses, disposable_income, savings_rate, expenses_by_category")
        .order("month", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        month: r.month,
        net_income: Number(r.net_income),
        total_expenses: Number(r.total_expenses),
        disposable_income: Number(r.disposable_income),
        savings_rate: Number(r.savings_rate),
        expenses_by_category: r.expenses_by_category,
      }));
    },
  });

  const { data: debts = [] } = useQuery({
    queryKey: ["debts", "identity"],
    queryFn: async () => {
      const { data } = await supabase.from("debts").select("min_payment");
      return data ?? [];
    },
  });

  const gross = Number(profile?.gross_income ?? 0);
  const debtMonthly = (debts as any[]).reduce((s, d) => s + Number(d.min_payment ?? 0), 0);
  const dtiPct = gross > 0 ? (debtMonthly / gross) * 100 : 0;
  const identity = buildIdentity(snaps, dtiPct);

  if (!identity) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Your profile builds as months of data collect. Come back after your first full month in Budge.
      </p>
    );
  }

  const toneClass = {
    good: "border-accent/30 bg-accent/[0.07] text-accent",
    ok: "border-caution/30 bg-caution/[0.07] text-caution",
    bad: "border-alert/30 bg-alert/[0.07] text-alert",
  } as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {identity.dimensions.map((d) => (
          <div key={d.label} className="rounded-xl border border-hairline p-4">
            <span className="label-xs">{d.label}</span>
            <p className={`mt-2 inline-flex rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${toneClass[d.tone]}`}>
              {d.value}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{d.explain}</p>
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-relaxed">{identity.summary}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Based on {identity.months} month{identity.months === 1 ? "" : "s"} of data · updates monthly
      </p>
    </div>
  );
}
