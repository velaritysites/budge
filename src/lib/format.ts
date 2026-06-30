import { getCurrency } from "./currencies";

export function formatCurrency(
  amount: number,
  currencyCode: string,
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  const c = getCurrency(currencyCode);
  const decimals =
    opts.decimals ?? (currencyCode === "JPY" || currencyCode === "KRW" || currencyCode === "VND" ? 0 : 2);
  try {
    return new Intl.NumberFormat(c.locale, {
      style: "currency",
      currency: c.code,
      minimumFractionDigits: opts.compact ? 0 : decimals,
      maximumFractionDigits: opts.compact ? 1 : decimals,
      notation: opts.compact ? "compact" : "standard",
    }).format(amount);
  } catch {
    return `${c.symbol}${amount.toFixed(decimals)}`;
  }
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}
