import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useExpenses, useProfile } from "@/hooks/use-profile";
import { formatCurrency } from "@/lib/format";
import { monthlyEquivalent } from "@/lib/finance";
import {
  CATEGORY_MAP,
  categoryColor,
  categoryLabel,
  isPositiveCategory,
  type ExpenseCategory,
} from "@/lib/categories";
import { CategoryIcon, CategoryOptions, CategoryAvatar } from "@/components/category-select";
import {
  parseStatement,
  statementMonth,
  saveOverride,
  type Bank,
  type Txn,
} from "@/lib/statement-parse";
import { toast } from "sonner";
import { ReconcilePanel } from "@/components/reconcile-panel";
import { computeAnomalies, persistAnomalies } from "@/lib/alerts";
import { AnomalyAlerts } from "@/components/anomaly-alerts";
import { SubscriptionAudit } from "@/components/subscription-audit";
import {
  UploadCloud, FileText, Loader2, ShieldCheck, ChevronDown, ChevronRight,
  History, Lightbulb, AlertTriangle, Check, X, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/statement")({
  head: () => ({
    meta: [
      { title: "Statement Analysis — Budge" },
      { name: "description", content: "Upload an FNB or Capitec bank statement and see exactly where your money went — categorised, charted and analysed entirely in your browser." },
      { property: "og:title", content: "Statement Analysis — Budge" },
      { property: "og:description", content: "See where your money went last month. Bank statement analysis that never leaves your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StatementPage,
});

type Analysis = {
  id: string;
  bank: string;
  statement_month: string | null;
  total_income: number;
  total_spent: number;
  category_totals: Record<string, number>;
  created_at: string;
};

function StatementPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();
  const currency = profile?.currency_code ?? "ZAR";

  const [bank, setBank] = useState<Bank | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncOn, setSyncOn] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useQuery({
    queryKey: ["statement_analyses"],
    queryFn: async (): Promise<Analysis[]> => {
      const { data, error } = await supabase
        .from("statement_analyses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        total_income: Number(r.total_income),
        total_spent: Number(r.total_spent),
        category_totals: (r.category_totals ?? {}) as Record<string, number>,
      }));
    },
  });

  /* ------------------------------ derived ------------------------------ */

  const result = useMemo(() => {
    if (!txns) return null;
    const income = txns.filter((t) => t.type === "income");
    const spend = txns.filter((t) => t.type === "expense");
    const totalIncome = income.reduce((s, t) => s + t.amount, 0);
    const totalSpent = spend.reduce((s, t) => s + t.amount, 0);
    const unclassified = spend.filter((t) => t.unclassified);
    const unclassifiedTotal = unclassified.reduce((s, t) => s + t.amount, 0);

    const byCat = new Map<ExpenseCategory, Txn[]>();
    for (const t of spend) {
      const list = byCat.get(t.category) ?? [];
      list.push(t);
      byCat.set(t.category, list);
    }
    const cards = [...byCat.entries()]
      .map(([key, items]) => ({
        key,
        items: items.sort((a, b) => b.amount - a.amount),
        total: items.reduce((s, t) => s + t.amount, 0),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      income, spend, totalIncome, totalSpent, unclassified, unclassifiedTotal,
      net: totalIncome - totalSpent,
      spendCards: cards.filter((c) => !isPositiveCategory(c.key)),
      saveCards: cards.filter((c) => isPositiveCategory(c.key)),
      allCards: cards,
    };
  }, [txns]);

  const budgets = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of expenses) m[e.category] = (m[e.category] ?? 0) + monthlyEquivalent(e);
    return m;
  }, [expenses]);

  const recommendations = useMemo(() => {
    if (!result || result.totalSpent <= 0) return [];
    const t = (k: ExpenseCategory) => result.allCards.find((c) => c.key === k)?.total ?? 0;
    const money = (n: number) => formatCurrency(n, currency, { decimals: 0 });
    const pct = (n: number) => ((n / result.totalSpent) * 100).toFixed(0);
    const out: { tone: "warn" | "info"; text: string }[] = [];

    const dining = t("eating_out") + t("coffee_drinks");
    if (dining / result.totalSpent > 0.15)
      out.push({ tone: "warn", text: `Your dining and coffee spend is ${money(dining)} — ${pct(dining)}% of your total. Cutting back by half would free up ${money(dining / 2)} every month.` });

    if (t("subscriptions") / result.totalSpent > 0.05)
      out.push({ tone: "warn", text: `You spent ${money(t("subscriptions"))} on subscriptions. Go through each one and cancel anything you haven't used this month.` });

    if (t("clothing_shopping") / result.totalSpent > 0.2)
      out.push({ tone: "warn", text: `Clothing and shopping is your biggest discretionary category at ${money(t("clothing_shopping"))}. A monthly cap here could significantly improve your savings rate.` });

    if (t("savings") + t("investments") === 0)
      out.push({ tone: "info", text: "No savings or investment contributions were found this month. A fixed transfer at the start of each month — even a small one — makes a measurable difference over time." });

    if (result.net < 0) {
      const top2 = result.spendCards.slice(0, 2).map((c) => categoryLabel(c.key)).join(" and ");
      out.push({ tone: "warn", text: `You spent ${money(-result.net)} more than you earned. The categories contributing most are ${top2}. These are the best place to start.` });
    }

    const tenth = result.totalIncome * 0.1;
    out.push({ tone: "info", text: `If you moved ${money(tenth)} into savings next month, you'd have ${money(tenth * 12)} more by end of year.` });
    return out;
  }, [result, currency]);

  /* ------------------------------ actions ------------------------------ */

  function pickFile(f: File | null) {
    if (!f) return;
    const ok = /\.(pdf|csv|ofx|qfx|txt)$/i.test(f.name);
    if (!ok) return toast.error("Upload a PDF, CSV or OFX/QFX file.");
    setFile(f);
    setTxns(null);
  }

  async function process() {
    if (!file || !bank) return;
    setProcessing(true);
    try {
      const parsed = await parseStatement(file, bank);
      if (parsed.length === 0) {
        toast.error("No transactions found — check the bank selection or try a CSV export.");
      } else {
        toast.success(`${parsed.length} transactions parsed`);
      }
      setTxns(parsed);
      if (parsed.length > 0) await saveAnalysis(parsed);
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't read that statement.");
    } finally {
      setProcessing(false);
    }
  }

  async function saveAnalysis(parsed: Txn[]) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || !bank) return;
    const totals: Record<string, number> = {};
    let income = 0;
    let spent = 0;
    for (const t of parsed) {
      if (t.type === "income") income += t.amount;
      else {
        spent += t.amount;
        totals[t.category] = (totals[t.category] ?? 0) + t.amount;
      }
    }
    const period = statementMonth(parsed) || null;
    const subscriptionItems = parsed
      .filter((t) => t.type === "expense" && t.category === "subscriptions")
      .map((t) => ({ name: t.description, amount: t.amount, date: t.date }));

    await supabase.from("statement_analyses").insert({
      user_id: u.user.id,
      bank,
      statement_month: period,
      total_income: income,
      total_spent: spent,
      category_totals: totals,
      subscription_items: subscriptionItems,
    });

    // Anomaly alerts vs the previous 3 analyses
    const { data: prior } = await supabase
      .from("statement_analyses")
      .select("category_totals, statement_month")
      .order("created_at", { ascending: false })
      .limit(4);
    const history = (prior ?? [])
      .filter((r: any) => r.statement_month !== period)
      .slice(0, 3)
      .map((r: any) => (r.category_totals ?? {}) as Record<string, number>);
    const anomalies = computeAnomalies(totals, history);
    await persistAnomalies(period ?? new Date().toISOString().slice(0, 7), anomalies);

    qc.invalidateQueries({ queryKey: ["statement_analyses"] });
    qc.invalidateQueries({ queryKey: ["spending_alerts"] });
  }


  function reclassify(txn: Txn, category: ExpenseCategory) {
    saveOverride(txn.description, category);
    setTxns((prev) =>
      (prev ?? []).map((t) =>
        t.description === txn.description && t.type === "expense"
          ? { ...t, category, unclassified: false }
          : t,
      ),
    );
  }

  async function applyToExpenses() {
    if (!result) return;
    setApplying(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setApplying(false);
    const rows = result.allCards
      .filter((c) => syncOn[c.key])
      .map((c) => ({
        user_id: u.user!.id,
        name: `${categoryLabel(c.key)} (statement)`,
        category: c.key,
        amount: Math.round(c.total * 100) / 100,
        frequency: "monthly",
        is_fixed: false,
      }));
    if (rows.length === 0) {
      setApplying(false);
      setConfirming(false);
      return;
    }
    const { error } = await supabase.from("expenses").insert(rows);
    setApplying(false);
    setConfirming(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["expenses"] });
    toast.success(`${rows.length} categories added to your expenses`);
  }

  const selectedSync = result?.allCards.filter((c) => syncOn[c.key]) ?? [];

  /* ------------------------------- render ------------------------------- */

  return (
    <div className="page-enter flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-[4.5rem] items-center justify-between gap-4 border-b border-hairline bg-background/60 px-5 backdrop-blur-2xl md:px-8">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight">Statement Analysis</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Read your month · processed in your browser
          </p>
        </div>
        <span className="hidden items-center gap-2 rounded-full border border-hairline px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline-flex">
          <ShieldCheck className="size-3.5 text-accent" /> Private
        </span>
      </header>

      <div className="flex flex-col gap-5 p-5 md:p-8">
        {/* ------------------------- history ------------------------- */}
        {(history.data?.length ?? 0) > 0 && (
          <section className="panel p-5">
            <div className="flex items-center gap-2">
              <History className="size-3.5 text-muted-foreground" />
              <span className="label-xs">Previous analyses</span>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              {history.data!.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setExpanded((p) => ({ ...p, [`h-${h.id}`]: !p[`h-${h.id}`] }))}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-surface-2"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {h.bank}
                  </span>
                  <span className="text-sm font-medium">{h.statement_month || new Date(h.created_at).toLocaleDateString()}</span>
                  <span className="ml-auto numeric font-mono text-xs text-accent">+{formatCurrency(h.total_income, currency, { decimals: 0 })}</span>
                  <span className="numeric font-mono text-xs text-muted-foreground">−{formatCurrency(h.total_spent, currency, { decimals: 0 })}</span>
                  <ChevronDown className={`size-3.5 text-muted-foreground transition ${expanded[`h-${h.id}`] ? "rotate-180" : ""}`} />
                </button>
              ))}
              {history.data!.filter((h) => expanded[`h-${h.id}`]).map((h) => (
                <div key={`d-${h.id}`} className="mx-3 mb-2 grid grid-cols-2 gap-2 rounded-lg bg-surface-2/60 p-3 sm:grid-cols-3">
                  {Object.entries(h.category_totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-muted-foreground">{categoryLabel(k)}</span>
                      <span className="numeric font-mono">{formatCurrency(Number(v), currency, { decimals: 0 })}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ------------------------- upload ------------------------- */}
        <section className="panel p-6 md:p-7">
          <h2 className="font-display text-lg font-bold tracking-tight">Upload a statement</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            We read your month, categorise every transaction and show you where it went.
          </p>

          <div className="mt-5">
            <span className="label-xs">Which bank?</span>
            <div className="mt-2 flex gap-2">
              {(["fnb", "capitec"] as Bank[]).map((b) => (
                <button
                  key={b}
                  onClick={() => setBank(b)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    bank === b
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b === "fnb" ? "FNB" : "Capitec"}
                </button>
              ))}
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
            onClick={() => bank ? inputRef.current?.click() : toast.error("Choose your bank first.")}
            className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center transition ${
              dragging ? "border-accent bg-accent/5" : "border-border hover:border-accent/40 hover:bg-surface-2/50"
            }`}
          >
            <UploadCloud className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Drag and drop your statement, or click to browse</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">PDF · CSV · OFX / QFX</p>
            <input
              ref={inputRef} type="file" accept=".pdf,.csv,.ofx,.qfx,.txt" className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {file && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-hairline bg-surface-2/60 px-4 py-3">
              <FileText className="size-4 text-accent" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
              <button onClick={() => { setFile(null); setTxns(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          )}

          <button
            onClick={process}
            disabled={!file || !bank || processing}
            className="btn-accent mt-4 w-full justify-center py-3 text-sm font-bold disabled:opacity-40"
          >
            {processing ? <><Loader2 className="size-4 animate-spin" /> Reading your statement…</> : <><Sparkles className="size-4" /> Process statement</>}
          </button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Your statement is processed entirely in your browser. Nothing is uploaded or stored.
          </p>
        </section>

        {/* ------------------------- results ------------------------- */}
        {result && result.allCards.length + result.income.length > 0 && (
          <>
            <AnomalyAlerts
              currency={currency}
              onSeeWhatChanged={(cat) => {
                setExpanded((p) => ({ ...p, [cat]: true }));
                document.getElementById(`cat-${cat}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />

            {/* Summary */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total income in" value={formatCurrency(result.totalIncome, currency, { decimals: 0 })} caption={`${result.income.length} credits`} tone="accent" />
              <StatCard label="Total spent" value={formatCurrency(result.totalSpent, currency, { decimals: 0 })} caption={`${result.spend.length} debits`} />
              <StatCard label="Net position" value={formatCurrency(result.net, currency, { decimals: 0 })} caption={result.net >= 0 ? "You kept money back" : "You overspent"} tone={result.net >= 0 ? "accent" : "alert"} />
              <StatCard label="Unclassified" value={formatCurrency(result.unclassifiedTotal, currency, { decimals: 0 })} caption={`${result.unclassified.length} transactions`} tone={result.unclassified.length ? "caution" : "default"} />
            </section>

            {/* Distribution */}
            <section className="panel p-6">
              <span className="label-xs">Spending distribution</span>
              <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-surface-3">
                {[...result.spendCards, ...result.saveCards].map((c) => (
                  <div
                    key={c.key}
                    title={`${categoryLabel(c.key)} — ${formatCurrency(c.total, currency, { decimals: 0 })}`}
                    style={{ width: `${(c.total / (result.totalSpent || 1)) * 100}%`, background: categoryColor(c.key) }}
                    className="h-full transition-all duration-700"
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                {[...result.spendCards, ...result.saveCards].map((c) => (
                  <span key={c.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: categoryColor(c.key) }} />
                    {categoryLabel(c.key)} · {((c.total / (result.totalSpent || 1)) * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </section>

            {/* Category breakdown */}
            <section className="flex flex-col gap-4">
              <span className="label-xs">Where it went</span>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {result.spendCards.map((c) => (
                  <div key={c.key} id={`cat-${c.key}`}>
                    <CategoryCard
                      cat={c.key} total={c.total} items={c.items} currency={currency}
                      share={(c.total / (result.totalSpent || 1)) * 100}
                      budget={budgets[c.key]}
                      open={!!expanded[c.key]}
                      onToggle={() => setExpanded((p) => ({ ...p, [c.key]: !p[c.key] }))}
                    />
                  </div>
                ))}
              </div>

              {result.saveCards.length > 0 && (
                <div className="rounded-2xl border border-accent/25 bg-accent/[0.06] p-4">
                  <span className="label-xs text-accent">Saving &amp; Growing</span>
                  <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {result.saveCards.map((c) => (
                      <CategoryCard
                        key={c.key} cat={c.key} total={c.total} items={c.items} currency={currency}
                        share={(c.total / (result.totalSpent || 1)) * 100}
                        budget={budgets[c.key]} positive
                        open={!!expanded[c.key]}
                        onToggle={() => setExpanded((p) => ({ ...p, [c.key]: !p[c.key] }))}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Unclassified */}
            {result.unclassified.length > 0 && (
              <section className="panel p-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-3.5 text-caution" />
                  <span className="label-xs">Unclassified transactions</span>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Assign a category and we'll remember this merchant for future uploads.
                </p>
                <div className="mt-4 flex flex-col gap-1">
                  {result.unclassified.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{t.date}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{t.description}</span>
                      <span className="numeric font-mono text-sm">{formatCurrency(t.amount, currency)}</span>
                      <select
                        defaultValue=""
                        onChange={(e) => e.target.value && reclassify(t, e.target.value as ExpenseCategory)}
                        className="field !w-auto !py-1.5 text-xs"
                      >
                        <option value="" disabled>Assign category…</option>
                        <CategoryOptions />
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <section className="panel p-6">
                <div className="flex items-center gap-2">
                  <Lightbulb className="size-3.5 text-accent" />
                  <span className="label-xs">Where to cut back</span>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  {recommendations.map((r, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border p-4 text-[13px] leading-relaxed ${
                        r.tone === "warn" ? "border-caution/25 bg-caution/[0.06]" : "border-hairline bg-surface-2/50"
                      }`}
                    >
                      {r.text}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Subscription audit */}
            <SubscriptionAudit currency={currency} />

            {/* Bookkeeping reconciliation */}
            <ReconcilePanel txns={txns ?? []} currency={currency} />




            {/* Sync */}
            <section className="panel p-6">
              <button onClick={() => setSyncOpen(!syncOpen)} className="flex w-full items-center gap-2 text-left">
                <ChevronRight className={`size-4 text-muted-foreground transition ${syncOpen ? "rotate-90" : ""}`} />
                <span className="text-sm font-semibold">Sync with your Budge expenses</span>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Optional</span>
              </button>
              {syncOpen && (
                <div className="mt-4">
                  <p className="text-[12px] text-muted-foreground">
                    Nothing is added unless you toggle it on and confirm.
                  </p>
                  <div className="mt-3 flex flex-col gap-1">
                    {result.allCards.map((c) => (
                      <label key={c.key} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                        <input
                          type="checkbox"
                          checked={!!syncOn[c.key]}
                          onChange={() => setSyncOn((p) => ({ ...p, [c.key]: !p[c.key] }))}
                          className="size-4 accent-[var(--accent)]"
                        />
                        <CategoryAvatar category={c.key} />
                        <span className="text-sm">{categoryLabel(c.key)}</span>
                        <span className="ml-auto numeric font-mono text-sm">{formatCurrency(c.total, currency, { decimals: 0 })}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => selectedSync.length ? setConfirming(true) : toast.error("Toggle at least one category.")}
                    className="btn-accent mt-4 w-full justify-center py-2.5 text-sm font-bold"
                  >
                    Apply to my expenses
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-5 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6">
            <h3 className="font-display text-base font-bold">Add these to your expenses?</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Each becomes a monthly, variable expense in Budge.
            </p>
            <div className="mt-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
              {selectedSync.map((c) => (
                <div key={c.key} className="flex items-center gap-3 rounded-lg bg-surface-2/60 px-3 py-2 text-sm">
                  <CategoryIcon category={c.key} className="size-3.5" />
                  <span>{categoryLabel(c.key)} (statement)</span>
                  <span className="ml-auto numeric font-mono">{formatCurrency(c.total, currency, { decimals: 0 })}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirming(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button onClick={applyToExpenses} disabled={applying} className="btn-accent flex-1 justify-center py-2.5 text-sm font-bold">
                {applying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ pieces ------------------------------ */

function StatCard({ label, value, caption, tone = "default" }: {
  label: string; value: string; caption: string; tone?: "default" | "accent" | "alert" | "caution";
}) {
  const color = tone === "accent" ? "text-accent" : tone === "alert" ? "text-alert" : tone === "caution" ? "text-caution" : "text-foreground";
  return (
    <div className="tile p-6">
      <p className="label-xs">{label}</p>
      <div className={`numeric font-display mt-4 text-[1.65rem] font-bold tracking-tight ${color}`}>{value}</div>
      <p className="mt-1.5 text-[12px] text-muted-foreground">{caption}</p>
    </div>
  );
}

function CategoryCard({
  cat, total, items, currency, share, budget, open, onToggle, positive = false,
}: {
  cat: ExpenseCategory; total: number; items: Txn[]; currency: string; share: number;
  budget?: number; open: boolean; onToggle: () => void; positive?: boolean;
}) {
  const over = !positive && budget !== undefined && budget > 0 && total > budget;
  return (
    <div className={`panel overflow-hidden ${positive ? "border-accent/25" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-surface-2/50">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${CATEGORY_MAP[cat]?.color ?? "#666"} 18%, transparent)`, color: CATEGORY_MAP[cat]?.color }}
        >
          <CategoryIcon category={cat} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{categoryLabel(cat)}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {share.toFixed(0)}% of spending · {items.length} txns
          </p>
        </div>
        <div className="text-right">
          <p className={`numeric font-display text-base font-bold ${positive ? "text-accent" : ""}`}>
            {formatCurrency(total, currency, { decimals: 0 })}
          </p>
          {over && (
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-caution">Over your logged budget</p>
          )}
        </div>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-hairline px-4 py-2">
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2 text-[12px]">
              <span className="font-mono text-[10px] text-muted-foreground">{t.date}</span>
              <span className="min-w-0 flex-1 truncate">{t.description}</span>
              <span className="numeric font-mono">{formatCurrency(t.amount, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
