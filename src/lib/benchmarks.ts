export type IncomeBracket = "under_10k" | "10k_20k" | "20k_35k" | "35k_60k" | "60k_plus";

export const BRACKET_LABELS: Record<IncomeBracket, string> = {
  under_10k: "Under R10k",
  "10k_20k": "R10k – R20k",
  "20k_35k": "R20k – R35k",
  "35k_60k": "R35k – R60k",
  "60k_plus": "R60k+",
};

export const MIN_BRACKET_SAMPLE = 50;

export function bracketFor(netIncome: number): IncomeBracket {
  if (netIncome < 10000) return "under_10k";
  if (netIncome < 20000) return "10k_20k";
  if (netIncome < 35000) return "20k_35k";
  if (netIncome < 60000) return "35k_60k";
  return "60k_plus";
}
