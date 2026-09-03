/**
 * Client-side bank statement parsing for the Statement Analysis tool.
 * Nothing here touches the network — every parser runs in the browser.
 */

import { matchCategory, normalizeCategory, type ExpenseCategory } from "./categories";

export type Bank = "fnb" | "capitec";

export type Txn = {
  id: string;
  date: string; // ISO-ish display date
  description: string;
  amount: number; // always positive
  type: "income" | "expense";
  category: ExpenseCategory;
  unclassified: boolean;
};

/* ---------------- manual merchant overrides (localStorage) ---------------- */

const OVERRIDE_KEY = "budge.statement.merchantOverrides";

export function merchantKey(description: string): string {
  return (description || "").toUpperCase().replace(/\s+/g, " ").trim().slice(0, 48);
}

export function loadOverrides(): Record<string, ExpenseCategory> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ExpenseCategory>) : {};
  } catch {
    return {};
  }
}

export function saveOverride(description: string, category: ExpenseCategory) {
  const all = loadOverrides();
  all[merchantKey(description)] = category;
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota errors */
  }
}

/* ---------------------------- helpers ---------------------------- */

let seq = 0;
const nextId = () => `t${++seq}`;

function toNumber(raw: string): number {
  return Number(raw.replace(/[R\s,]/g, "").replace(/[()]/g, ""));
}

const AMOUNT_RE = /-?\(?R?\s?\d{1,3}(?:[,\s]\d{3})*\.\d{2}\)?(?:\s?Cr)?/gi;

const INTERNAL_TRANSFER = [
  "INTERNAL TRANSFER",
  "INT TRANSFER",
  "TRANSFER TO SAVINGS POCKET",
  "FNB APP TRANSFER",
  "FNB APP PAYMENT TO OWN",
  "TRF TO OWN ACCOUNT",
  "TRANSFER FROM OWN ACCOUNT",
  "TRANSFER TO OWN ACCOUNT",
  "MONEY IN - OWN ACCOUNT",
  "MONEY OUT - OWN ACCOUNT",
];

function isInternalTransfer(desc: string) {
  const d = desc.toUpperCase();
  return INTERNAL_TRANSFER.some((k) => d.includes(k));
}

function classify(description: string, type: "income" | "expense"): Pick<Txn, "category" | "unclassified"> {
  if (type === "income") return { category: "other", unclassified: false };
  const override = loadOverrides()[merchantKey(description)];
  if (override) return { category: normalizeCategory(override), unclassified: false };
  const matched = matchCategory(description);
  return matched ? { category: matched, unclassified: false } : { category: "other", unclassified: true };
}

function makeTxn(date: string, description: string, amount: number, type: "income" | "expense"): Txn | null {
  const desc = description.replace(/\s+/g, " ").trim();
  if (!desc || !isFinite(amount) || amount === 0) return null;
  if (isInternalTransfer(desc)) return null;
  return { id: nextId(), date, description: desc, amount: Math.abs(amount), type, ...classify(desc, type) };
}

/* ---------------------------- PDF text ---------------------------- */

async function pdfLines(file: File): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const bucket = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!rows.has(bucket)) rows.set(bucket, []);
      rows.get(bucket)!.push({ x: item.transform[4], s: item.str });
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parts]) => {
        lines.push(parts.sort((a, b) => a.x - b.x).map((p2) => p2.s).join(" ").replace(/\s+/g, " ").trim());
      });
  }
  return lines;
}

/* ---------------------------- FNB PDF ---------------------------- */

const FNB_DATE = /^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/;
const FNB_SHORT_DATE = /^(\d{1,2}\s+[A-Za-z]{3})\b/;

function parseFnbLines(lines: string[]): Txn[] {
  const out: Txn[] = [];
  for (const line of lines) {
    const dm = line.match(FNB_DATE) ?? line.match(FNB_SHORT_DATE);
    if (!dm) continue;
    const rest = line.slice(dm[0].length);
    const amounts = rest.match(AMOUNT_RE);
    if (!amounts || amounts.length === 0) continue;

    // last figure is the running balance when 2+ figures are present
    const amountRaw = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
    const description = rest.slice(0, rest.indexOf(amountRaw)).trim();
    const isCredit = /cr/i.test(amountRaw) || amountRaw.trim().startsWith("+");
    const value = toNumber(amountRaw.replace(/cr/i, ""));
    const negative = /^\(|^-/.test(amountRaw.trim());
    const type: "income" | "expense" = isCredit && !negative ? "income" : "expense";
    const t = makeTxn(dm[1], description, value, type);
    if (t) out.push(t);
  }
  return out;
}

/* -------------------------- Capitec PDF -------------------------- */

const CAPITEC_DATE = /^(\d{4}-\d{2}-\d{2})\b/;

function parseCapitecLines(lines: string[]): Txn[] {
  const out: Txn[] = [];
  for (const line of lines) {
    const dm = line.match(CAPITEC_DATE);
    if (!dm) continue;
    const rest = line.slice(dm[0].length);
    const amounts = rest.match(AMOUNT_RE);
    if (!amounts || amounts.length === 0) continue;
    const figures = amounts.map((a) => ({ raw: a, val: toNumber(a.replace(/cr/i, "")), neg: /^\(|^-/.test(a.trim()) }));
    const description = rest.slice(0, rest.indexOf(amounts[0])).trim();

    // drop the trailing balance column
    const movement = figures.length >= 2 ? figures.slice(0, -1) : figures;
    const primary = movement[0];
    const type: "income" | "expense" = primary.neg ? "expense" : movement.length > 1 ? "expense" : "income";
    // Capitec prints debits as negative; a lone positive figure before balance is a credit
    const t = makeTxn(dm[1], description, primary.val, primary.neg ? "expense" : type);
    if (t) out.push(t);
  }
  return out;
}

/* ------------------------------ CSV ------------------------------ */

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if ((ch === "," || ch === ";") && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim().replace(/^"|"$/g, ""));
}

function findCol(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) => candidates.some((c) => h.includes(c)));
}

function parseCsv(text: string): Txn[] {
  const rows = text.split(/\r?\n/).filter((r) => r.trim());
  if (rows.length < 2) return [];
  let headerIdx = rows.findIndex((r) => /date/i.test(r) && /(desc|narrative|reference|detail)/i.test(r));
  if (headerIdx < 0) headerIdx = 0;
  const headers = splitCsvLine(rows[headerIdx]).map((h) => h.toLowerCase());

  const dateCol = findCol(headers, ["date", "posting"]);
  const descCol = findCol(headers, ["description", "narrative", "detail", "reference", "memo"]);
  const debitCol = findCol(headers, ["debit", "money out", "withdrawal"]);
  const creditCol = findCol(headers, ["credit", "money in", "deposit"]);
  const amountCol = findCol(headers, ["amount", "value"]);

  const out: Txn[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const cells = splitCsvLine(row);
    if (cells.length < 2) continue;
    const date = dateCol >= 0 ? cells[dateCol] : "";
    const desc = descCol >= 0 ? cells[descCol] : cells.find((c) => /[a-z]{3}/i.test(c)) ?? "";
    let amount = 0;
    let type: "income" | "expense" = "expense";
    const debit = debitCol >= 0 ? toNumber(cells[debitCol] || "0") : 0;
    const credit = creditCol >= 0 ? toNumber(cells[creditCol] || "0") : 0;
    if (debit) {
      amount = Math.abs(debit);
      type = "expense";
    } else if (credit) {
      amount = Math.abs(credit);
      type = "income";
    } else if (amountCol >= 0) {
      const v = toNumber(cells[amountCol] || "0");
      amount = Math.abs(v);
      type = v >= 0 ? "income" : "expense";
    }
    const t = makeTxn(date, desc, amount, type);
    if (t) out.push(t);
  }
  return out;
}

/* ------------------------------ OFX ------------------------------ */

function parseOfx(text: string): Txn[] {
  const out: Txn[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>([^<\r\n]*)`, "i"));
      return m ? m[1].trim() : "";
    };
    const raw = get("DTPOSTED");
    const date = raw ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : "";
    const desc = get("MEMO") || get("NAME") || get("PAYEE");
    const value = Number(get("TRNAMT"));
    const t = makeTxn(date, desc, Math.abs(value), value >= 0 ? "income" : "expense");
    if (t) out.push(t);
  }
  return out;
}

/* ---------------------------- entrypoint ---------------------------- */

export async function parseStatement(file: File, bank: Bank): Promise<Txn[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const lines = await pdfLines(file);
    const txns = bank === "capitec" ? parseCapitecLines(lines) : parseFnbLines(lines);
    if (txns.length === 0) {
      // fall back to the other bank layout in case the file was mislabelled
      return bank === "capitec" ? parseFnbLines(lines) : parseCapitecLines(lines);
    }
    return txns;
  }
  const text = await file.text();
  if (name.endsWith(".ofx") || name.endsWith(".qfx") || /<STMTTRN>/i.test(text)) return parseOfx(text);
  return parseCsv(text);
}

/** Guess the statement month from the parsed transactions. */
export function statementMonth(txns: Txn[]): string {
  const counts = new Map<string, number>();
  for (const t of txns) {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) continue;
    const k = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}
