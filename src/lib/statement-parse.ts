/** Client-side parsers for South African FNB and Capitec exports. */
import { matchCategory, normalizeCategory, type ExpenseCategory } from "./categories";

export type Bank = "fnb" | "capitec";
export type StatementFormat = "pdf" | "csv" | "ofx";

export type Txn = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: ExpenseCategory;
  unclassified: boolean;
};

export type ParseDetails = {
  transactions: Txn[];
  format: StatementFormat;
  bank: Bank;
  ignoredRows: number;
};

const OVERRIDE_KEY = "loot.statement.merchantOverrides";
const LEGACY_OVERRIDE_KEY = "budge.statement.merchantOverrides";
let seq = 0;
const nextId = () => `statement-${Date.now()}-${++seq}`;

export function merchantKey(description: string): string {
  return description.toUpperCase().replace(/\b\d{4,}\b/g, "#").replace(/\s+/g, " ").trim().slice(0, 64);
}

export function loadOverrides(): Record<string, ExpenseCategory> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY) ?? localStorage.getItem(LEGACY_OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ExpenseCategory>) : {};
  } catch {
    return {};
  }
}

export function saveOverride(description: string, category: ExpenseCategory) {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ ...loadOverrides(), [merchantKey(description)]: category }));
  } catch {
    // Categorisation still applies to the current analysis if browser storage is unavailable.
  }
}

const INTERNAL_TRANSFER = [
  "INTERNAL TRANSFER", "INT TRANSFER", "TRANSFER TO SAVINGS POCKET", "FNB APP PAYMENT TO OWN",
  "TRF TO OWN ACCOUNT", "TRANSFER FROM OWN ACCOUNT", "TRANSFER TO OWN ACCOUNT",
  "MONEY IN - OWN ACCOUNT", "MONEY OUT - OWN ACCOUNT",
];
const INCOME_WORDS = /\b(SALARY|WAGES|PAYROLL|DEPOSIT|CREDIT INTEREST|REFUND|REVERSAL|CASHBACK|MONEY IN|CREDIT TRANSFER|PAYMENT RECEIVED)\b/i;
const EXPENSE_WORDS = /\b(PURCHASE|PAYMENT TO|DEBIT ORDER|BANK CHARGES?|SERVICE FEE|ATM|WITHDRAWAL|PREPAID|AIRTIME|ELECTRICITY|TRANSFER TO|MONEY OUT|CARD)\b/i;

function classify(description: string, type: Txn["type"]): Pick<Txn, "category" | "unclassified"> {
  if (type === "income") return { category: "other", unclassified: false };
  const override = loadOverrides()[merchantKey(description)];
  if (override) return { category: normalizeCategory(override), unclassified: false };
  const matched = matchCategory(description);
  return matched ? { category: matched, unclassified: false } : { category: "other", unclassified: true };
}

function makeTxn(date: string, description: string, amount: number, type: Txn["type"]): Txn | null {
  const desc = description.replace(/\s+/g, " ").trim();
  if (!desc || !Number.isFinite(amount) || amount === 0 || INTERNAL_TRANSFER.some((term) => desc.toUpperCase().includes(term))) return null;
  return { id: nextId(), date: normalizeDate(date), description: desc, amount: Math.abs(amount), type, ...classify(desc, type) };
}

function normalizeDate(raw: string, fallbackYear?: number): string {
  const clean = raw.trim().replace(/\//g, "-");
  const compact = clean.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const numeric = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return `${year}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  }
  const words = clean.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/);
  if (words) {
    const month = new Date(`${words[2]} 1, 2024`).getMonth();
    if (month >= 0) return `${words[3] ?? fallbackYear ?? new Date().getFullYear()}-${String(month + 1).padStart(2, "0")}-${words[1].padStart(2, "0")}`;
  }
  return raw.trim();
}

function parseMoney(raw = ""): number | null {
  const clean = raw.replace(/\u00a0/g, " ").trim();
  if (!clean || /^[-–—]$/.test(clean)) return null;
  const negative = /^-/.test(clean) || /-$/.test(clean) || /^\(.*\)$/.test(clean) || /\bDR\b/i.test(clean);
  const positive = /^\+/.test(clean) || /\bCR\b/i.test(clean);
  const numeric = clean.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const value = Number(numeric.replace(/[()]/g, ""));
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : positive ? Math.abs(value) : value;
}

function inferType(value: number, description: string, creditHint = false, debitHint = false): Txn["type"] {
  if (creditHint || value > 0 && INCOME_WORDS.test(description)) return "income";
  if (debitHint || value < 0 || EXPENSE_WORDS.test(description)) return "expense";
  return value >= 0 ? "income" : "expense";
}

/* PDF extraction retains visual rows, then joins wrapped narratives onto their dated row. */
async function pdfLines(file: File): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const bucket = [...rows.keys()].find((candidate) => Math.abs(candidate - y) <= 2) ?? y;
      rows.set(bucket, [...(rows.get(bucket) ?? []), { x: item.transform[4], text: item.str.trim() }]);
    }
    for (const [, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      lines.push(row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  return lines;
}

const DATE_START = /^(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{4})?)\b/;
const MONEY_TOKEN = /(?:[-+(]?\s*(?:R\s*)?\d[\d ,]*\.\d{2}\s*(?:Cr|Dr|-)?\)?)/gi;

function statementYear(lines: string[]): number | undefined {
  const years = lines.join(" ").match(/\b20\d{2}\b/g);
  return years?.map(Number).find((year) => year >= 2000 && year <= 2100);
}

function mergePdfRows(lines: string[]): string[] {
  const rows: string[] = [];
  for (const line of lines) {
    if (DATE_START.test(line)) rows.push(line);
    else if (rows.length && line && !/^(page|date\s|posting date|transaction date|description|money in|balance|transaction history|account number|opening balance|closing balance|total vat|turnover)/i.test(line)) {
      const previous = rows[rows.length - 1];
      if ((line.match(MONEY_TOKEN) ?? []).length === 0) {
        const firstAmount = previous.search(MONEY_TOKEN);
        rows[rows.length - 1] = firstAmount < 0
          ? `${previous} ${line}`
          : `${previous.slice(0, firstAmount).trim()} ${line} ${previous.slice(firstAmount)}`;
      }
    }
  }
  return rows;
}

function parsePdfRows(lines: string[], bank: Bank): Txn[] {
  const out: Txn[] = [];
  const year = statementYear(lines);
  for (const line of mergePdfRows(lines)) {
    const dateMatch = line.match(DATE_START);
    if (!dateMatch) continue;
    const rest = line.slice(dateMatch[0].length).trim();
    const matches = [...rest.matchAll(MONEY_TOKEN)];
    if (!matches.length) continue;
    const amountMatch = matches[0];
    const rawAmount = amountMatch[0];
    const description = rest.slice(0, amountMatch.index).replace(/\b(?:Fee|Value date)\b\s*$/i, "").trim();
    const value = parseMoney(rawAmount);
    if (value === null) continue;
    const explicitCredit = /\bCr\b/i.test(rawAmount) || /^\+/.test(rawAmount.trim());
    const explicitDebit = /\bDr\b/i.test(rawAmount) || /^-|^\(/.test(rawAmount.trim());
    // Capitec exports use signed money-in/out. FNB PDF debits may be unsigned, so narrative is used when no Cr/Dr marker exists.
    const type = inferType(value, description, explicitCredit, explicitDebit || bank === "fnb" && !explicitCredit && !INCOME_WORDS.test(description));
    const txn = makeTxn(normalizeDate(dateMatch[0], year), description, value, type);
    if (txn) out.push(txn);
  }
  return out;
}

function detectDelimiter(line: string): string {
  const counts = [",", ";", "\t"].map((delimiter) => ({ delimiter, count: line.split(delimiter).length }));
  return counts.sort((a, b) => b.count - a.count)[0].delimiter;
}

function splitDelimited(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { cells.push(cell.trim()); cell = ""; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells.map((value) => value.replace(/^"|"$/g, "").trim());
}

function normalHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)));
}

function parseCsv(text: string, bank: Bank): Txn[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  let headerIndex = lines.findIndex((line) => /(?:date|posting)/i.test(line) && /(?:description|narrative|details?|reference|amount|money)/i.test(line));
  if (headerIndex < 0 && bank === "fnb") {
    // Legacy FNB CSV exports can omit column labels and begin with an account summary block.
    const transactionStart = lines.findIndex((line) => /^"?20\d{6}"?[,;]/.test(line));
    if (transactionStart >= 0) {
      const delimiter = detectDelimiter(lines[transactionStart]);
      lines.splice(transactionStart, 0, ["Effective Date", "Description", "Reference", "Service Fee", "Amount", "Balance"].join(delimiter));
      headerIndex = transactionStart;
    }
  }
  if (headerIndex < 0) return [];
  const delimiter = detectDelimiter(lines[headerIndex]);
  const headers = splitDelimited(lines[headerIndex], delimiter).map(normalHeader);
  const dateColumn = findColumn(headers, ["transaction date", "posting date", "post date", "date"]);
  const descriptionColumns = [
    findColumn(headers, ["description", "transaction description", "narrative", "details", "memo"]),
    findColumn(headers, ["reference", "recipient reference", "my reference"]),
  ].filter((column, index, all) => column >= 0 && all.indexOf(column) === index);
  const debitColumn = findColumn(headers, ["money out", "debit amount", "debit", "withdrawal"]);
  const creditColumn = findColumn(headers, ["money in", "credit amount", "credit", "deposit"]);
  const amountColumn = findColumn(headers, ["transaction amount", "amount", "value"]);
  const out: Txn[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitDelimited(line, delimiter);
    const date = dateColumn >= 0 ? cells[dateColumn] ?? "" : "";
    const description = descriptionColumns.map((column) => cells[column]).filter(Boolean).join(" · ");
    const debit = debitColumn >= 0 ? parseMoney(cells[debitColumn]) : null;
    const credit = creditColumn >= 0 ? parseMoney(cells[creditColumn]) : null;
    const amount = amountColumn >= 0 ? parseMoney(cells[amountColumn]) : null;
    let value: number | null = null;
    let type: Txn["type"] = "expense";
    if (debit !== null && debit !== 0) { value = debit; type = "expense"; }
    else if (credit !== null && credit !== 0) { value = credit; type = "income"; }
    else if (amount !== null && amount !== 0) { value = amount; type = inferType(amount, description, false, bank === "fnb" && amount > 0 && EXPENSE_WORDS.test(description)); }
    if (value === null) continue;
    const txn = makeTxn(date, description, value, type);
    if (txn) out.push(txn);
  }
  return out;
}

function ofxValue(block: string, tag: string): string {
  return block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
}

function parseOfx(text: string): Txn[] {
  const out: Txn[] = [];
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const posted = ofxValue(block, "DTPOSTED");
    const value = Number(ofxValue(block, "TRNAMT").replace(/,/g, ""));
    const description = [ofxValue(block, "NAME"), ofxValue(block, "MEMO")].filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(" · ");
    const txn = makeTxn(`${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`, description, value, value >= 0 ? "income" : "expense");
    if (txn) out.push(txn);
  }
  return out;
}

function assertBank(text: string, bank: Bank) {
  const signature = text.slice(0, 12000).toLowerCase();
  const other = bank === "fnb" ? /capitec\s+bank/ : /first\s+national\s+bank|\bfnb\b/;
  if (other.test(signature)) throw new Error(`This looks like a ${bank === "fnb" ? "Capitec" : "FNB"} statement. Change the selected bank and try again.`);
}

export async function parseStatementDetailed(file: File, bank: Bank): Promise<ParseDetails> {
  if (file.size > 20 * 1024 * 1024) throw new Error("That statement is larger than 20 MB. Export a shorter date range and try again.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const lines = await pdfLines(file);
    if (!lines.length) throw new Error("This PDF has no selectable text. Download a digital statement from your banking app instead of uploading a scan.");
    assertBank(lines.join("\n"), bank);
    const transactions = parsePdfRows(lines, bank);
    return { transactions, format: "pdf", bank, ignoredRows: Math.max(0, mergePdfRows(lines).length - transactions.length) };
  }
  const text = await file.text();
  assertBank(text, bank);
  const isOfx = name.endsWith(".ofx") || name.endsWith(".qfx") || /<STMTTRN>/i.test(text);
  const transactions = isOfx ? parseOfx(text) : parseCsv(text, bank);
  return { transactions, format: isOfx ? "ofx" : "csv", bank, ignoredRows: 0 };
}

export async function parseStatement(file: File, bank: Bank): Promise<Txn[]> {
  return (await parseStatementDetailed(file, bank)).transactions;
}

export function statementMonth(txns: Txn[]): string {
  const counts = new Map<string, number>();
  for (const txn of txns) {
    const date = new Date(`${txn.date}T12:00:00`);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}