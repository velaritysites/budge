import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NetWorthKind = "asset" | "liability";

export type NetWorthItem = {
  id: string;
  kind: NetWorthKind;
  category: string;
  label: string;
  value: number;
  depreciation_pct: number;
  updated_at: string;
};

export const ASSET_CATEGORIES = [
  { key: "savings", label: "Savings balance" },
  { key: "investments", label: "Investment portfolio" },
  { key: "property", label: "Property value" },
  { key: "vehicle", label: "Vehicle value" },
  { key: "other", label: "Other asset" },
] as const;

export const LIABILITY_CATEGORIES = [
  { key: "home_loan", label: "Home loan balance" },
  { key: "vehicle_finance", label: "Vehicle finance balance" },
  { key: "credit_card", label: "Credit card balance" },
  { key: "store_account", label: "Store account balance" },
  { key: "personal_loan", label: "Personal loan balance" },
  { key: "other", label: "Other liability" },
] as const;

/** Vehicles lose value — the standard estimate Budge applies is 15% a year. */
export const VEHICLE_DEPRECIATION_PCT = 15;

export function useNetWorthItems() {
  return useQuery({
    queryKey: ["net_worth_items"],
    queryFn: async (): Promise<NetWorthItem[]> => {
      const { data, error } = await supabase
        .from("net_worth_items")
        .select("id, kind, category, label, value, depreciation_pct, updated_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        kind: r.kind,
        category: r.category,
        label: r.label,
        value: Number(r.value),
        depreciation_pct: Number(r.depreciation_pct ?? 0),
        updated_at: r.updated_at,
      }));
    },
  });
}

/** Value after applying the item's annual depreciation for elapsed time. */
export function currentValue(item: NetWorthItem, now = new Date()): number {
  if (!item.depreciation_pct) return item.value;
  const years = Math.max(0, (now.getTime() - new Date(item.updated_at).getTime()) / (365.25 * 86_400_000));
  return item.value * Math.pow(1 - item.depreciation_pct / 100, years);
}

export type NetWorthTotals = {
  assets: number;
  liabilities: number;
  netWorth: number;
  assetRows: { label: string; value: number }[];
  liabilityRows: { label: string; value: number }[];
};

export function netWorthTotals(items: NetWorthItem[], now = new Date()): NetWorthTotals {
  const assetRows = items
    .filter((i) => i.kind === "asset")
    .map((i) => ({ label: i.label, value: currentValue(i, now) }));
  const liabilityRows = items
    .filter((i) => i.kind === "liability")
    .map((i) => ({ label: i.label, value: currentValue(i, now) }));
  const assets = assetRows.reduce((s, r) => s + r.value, 0);
  const liabilities = liabilityRows.reduce((s, r) => s + r.value, 0);
  return { assets, liabilities, netWorth: assets - liabilities, assetRows, liabilityRows };
}

export async function saveNetWorthItem(item: {
  id?: string;
  kind: NetWorthKind;
  category: string;
  label: string;
  value: number;
  depreciation_pct?: number;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const payload = {
    user_id: u.user.id,
    kind: item.kind,
    category: item.category,
    label: item.label,
    value: Math.round(item.value * 100) / 100,
    depreciation_pct: item.depreciation_pct ?? (item.category === "vehicle" ? VEHICLE_DEPRECIATION_PCT : 0),
  };
  if (item.id) {
    const { error } = await supabase.from("net_worth_items").update(payload).eq("id", item.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("net_worth_items").insert(payload);
    if (error) throw error;
  }
}

export async function deleteNetWorthItem(id: string) {
  await supabase.from("net_worth_items").delete().eq("id", id);
}

/** Writes this month's net worth onto the monthly snapshot (skipped once locked). */
export async function recordNetWorthOnSnapshot(month: string, totals: NetWorthTotals) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase
    .from("monthly_snapshots")
    .update({
      net_worth: Math.round(totals.netWorth * 100) / 100,
      assets_total: Math.round(totals.assets * 100) / 100,
      liabilities_total: Math.round(totals.liabilities * 100) / 100,
    })
    .eq("user_id", u.user.id)
    .eq("month", month)
    .is("locked_at", null);
}

export function netWorthMeaning(netWorth: number, assets: number): string {
  if (netWorth > 0 && assets > 0 && netWorth / assets > 0.5) {
    return "Positive, and most of what you own is genuinely yours rather than financed. That's a strong base — the number to watch now is whether it grows every month.";
  }
  if (netWorth > 0) {
    return "Positive: what you own is worth more than what you owe. A good place to be. Most of the growth from here comes from paying debt down faster than assets lose value.";
  }
  if (netWorth === 0) {
    return "Exactly break-even — what you own matches what you owe. Every rand of debt you clear from here moves you into positive territory.";
  }
  return "Negative for now: you owe more than you own. Common when there's a bond or vehicle finance in play. It isn't a crisis, but it means debt reduction should outrank new spending until it turns.";
}
