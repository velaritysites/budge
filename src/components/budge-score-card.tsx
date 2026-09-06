import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BAND_LABEL,
  BAND_STYLES,
  BUREAUS,
  buildRecommendations,
  calibrationFrom,
  computeLootScore,
  explainGap,
  saveMonthlyScore,
  useBureauScores,
  useScoreHistory,
  type ScoreInputs,
} from "@/lib/budge-score";
import { formatCurrency } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, Gauge, Info, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { readScoreScreenshot } from "@/lib/score-ocr.functions";
import { applyCorrections, confidenceLevel, recordCalibration, useCorrections, useMyContributions } from "@/lib/calibration";
import type { Expense } from "@/lib/finance";

export function LootScoreCard({
  currency,
  grossIncome,
  netIncome,
  savingsRate,
  disposable,
  expenses,
}: {
  currency: string;
  grossIncome: number;
  netIncome: number;
  savingsRate: number;
  disposable: number;
  expenses: Expense[];
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: history = [] } = useScoreHistory();
  const { data: bureau = [] } = useBureauScores();

  const { data: debts = [] } = useQuery({
    queryKey: ["debts", "score"],
    queryFn: async () => {
      const { data } = await supabase.from("debts").select("name, balance, interest_rate, min_payment, account_type");
      return data ?? [];
    },
  });

  const { data: snaps = [] } = useQuery({
    queryKey: ["snapshots", "score"],
    queryFn: async () => {
      const { data } = await supabase
        .from("monthly_snapshots")
        .select("month, total_expenses, expenses_by_category")
        .order("month", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const { data: statements = [] } = useQuery({
    queryKey: ["statement_analyses", "score"],
    queryFn: async () => {
      const { data } = await supabase.from("statement_analyses").select("statement_month").limit(12);
      return data ?? [];
    },
  });

  const debtMonthly = (debts as any[]).reduce((s, d) => s + Number(d.min_payment ?? 0), 0);
  const debtBalance = (debts as any[]).reduce((s, d) => s + Number(d.balance ?? 0), 0);
  const creditCardBalance = (debts as any[])
    .filter((d) => d.account_type === "credit_card" || d.account_type === "store_account")
    .reduce((s, d) => s + Number(d.balance ?? 0), 0);

  const fixed = expenses.filter((e) => e.is_fixed);
  const debitOrderShare = fixed.length > 0 ? fixed.filter((e) => !!e.due_day).length / fixed.length : 0;
  const savingsBalance = 0;

  const inputs: ScoreInputs = {
    grossIncome,
    netIncome,
    debtMonthly,
    debtBalance,
    creditCardBalance,
    savingsRate,
    debitOrderShare,
    expenseHistory: (snaps as any[]).map((s) => Number(s.total_expenses)),
    statementMonths: new Set((statements as any[]).map((s) => s.statement_month)).size,
  };

  const calibration = useMemo(() => calibrationFrom(bureau as any[]), [bureau]);
  const { data: corrections } = useCorrections();
  const { data: contributions = [] } = useMyContributions();
  const rawScore = useMemo(() => computeLootScore(inputs, calibration ?? undefined), [JSON.stringify(inputs), calibration]);
  const score = useMemo(() => {
    const qualities = Object.fromEntries(rawScore.factors.map((f) => [f.key, f.quality]));
    return { ...rawScore, score: applyCorrections(rawScore.score, qualities as any, corrections) };
  }, [rawScore, corrections]);

  // Persist this month's score whenever it settles.
  const saved = useRef<number | null>(null);
  useEffect(() => {
    if (netIncome <= 0) return;
    if (saved.current === score.score) return;
    saved.current = score.score;
    saveMonthlyScore(score.score, score.factors).then(() => qc.invalidateQueries({ queryKey: ["budge_scores"] }));
  }, [score.score, netIncome, qc, score.factors]);

  const prev = history.find((h) => h.month !== history[0]?.month);
  const change = prev ? score.score - prev.score : null;

  const recs = buildRecommendations(score, {
    disposable,
    creditCardBalance,
    grossIncome,
    savingsBalance,
    topDebtName: [...(debts as any[])].sort((a, b) => Number(b.interest_rate) - Number(a.interest_rate))[0]?.name ?? null,
    currencyFormat: (n: number) => formatCurrency(n, currency, { decimals: 0 }),
  });

  const latestBureau = bureau[0];

  return (
    <>
      <section className="panel-raised animate-enter flex flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="label-xs flex items-center gap-2">
              <Gauge className="size-3.5 text-accent" /> Loot Score
            </span>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/80">
              Loot Estimate — not a bureau score
            </p>
          </div>
          {change !== null && (
            <span
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] ${
                change >= 0 ? "border-accent/30 text-accent" : "border-alert/30 text-alert"
              }`}
            >
              {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(change)}
            </span>
          )}
        </div>

        <p className={`numeric font-display mt-4 text-[3.4rem] font-extrabold leading-none tracking-[-0.05em] ${BAND_STYLES[score.band]}`}>
          {score.score}
          <span className="ml-1 align-super text-sm font-bold text-muted-foreground">/999</span>
        </p>
        <p className={`mt-1 font-mono text-[10px] uppercase tracking-[0.16em] ${BAND_STYLES[score.band]}`}>
          {BAND_LABEL[score.band]}
        </p>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={`h-full rounded-full ${score.band === "green" ? "bg-accent" : score.band === "amber" ? "bg-caution" : "bg-alert"}`}
            style={{ width: `${(score.score / 999) * 100}%` }}
          />
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          We estimate your score is between {Math.max(0, score.score - score.confidence)} and{" "}
          {Math.min(999, score.score + score.confidence)}.
        </p>

        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {confidenceLevel(corrections?.sample_size ?? 0).label}
        </p>

        <button onClick={() => setOpen(true)} className="btn-ghost mt-4 self-start">
          <Info className="size-3.5" /> What's helping and hurting
        </button>
      </section>

      {open && (
        <ScoreDetail
          onClose={() => setOpen(false)}
          score={score}
          recs={recs}
          currency={currency}
          history={history}
          bureau={bureau}
          latestBureau={latestBureau}
          calibrationSamples={calibration?.samples ?? 0}
          confidence={confidenceLevel(corrections?.sample_size ?? 0)}
          hasContributed={contributions.length > 0}
        />
      )}
    </>
  );
}

function ScoreDetail({
  onClose,
  score,
  recs,
  currency,
  history,
  bureau,
  latestBureau,
  calibrationSamples,
  confidence,
  hasContributed,
}: any) {
  const qc = useQueryClient();
  const [bureauName, setBureauName] = useState<string>(BUREAUS[0]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const out = await readScoreScreenshot({ data: { imageDataUrl: dataUrl } });
      if (out.score) setValue(String(out.score));
      if (out.bureau && (BUREAUS as readonly string[]).includes(out.bureau)) setBureauName(out.bureau);
      toast.success(out.score ? "Read your score — check it's right before saving." : "Couldn't read a score — enter it manually.");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't read that screenshot");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const n = parseInt(value);
    if (!n || n < 1 || n > 999) return toast.error("Enter a score between 1 and 999");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("bureau_scores").insert({
      user_id: u.user.id,
      bureau: bureauName,
      score: n,
      estimated_score: score.score,
      gap: n - score.score,
      factors: score.factors as any,
    });
    if (error) return toast.error(error.message);
    await recordCalibration({
      bureau: bureauName,
      estimated_score: score.score,
      real_score: n,
      reported_on: new Date().toISOString().slice(0, 10),
      factors: Object.fromEntries(score.factors.map((f: any) => [f.key, f.quality])),
    });
    setValue("");
    qc.invalidateQueries({ queryKey: ["bureau_scores"] });
    qc.invalidateQueries({ queryKey: ["score_calibration", "mine"] });
    toast.success("Saved — your estimate will calibrate against it.");
  }

  const timeline = [...history].reverse();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        className="panel max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">Your Loot Score, explained</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              An estimate from your own numbers. It updates every time a monthly snapshot is saved.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost !p-2">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {score.factors.map((f: any) => (
            <div key={f.key} className="rounded-xl border border-hairline p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold">{f.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {Math.round(f.weight * 100)}% weight · +{f.points} pts
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={`h-full rounded-full ${f.rating === "excellent" || f.rating === "good" ? "bg-accent" : f.rating === "fair" ? "bg-caution" : "bg-alert"}`}
                  style={{ width: `${Math.round(f.quality * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                {f.detail} {f.headroom > 0 ? `Up to ${f.headroom} more points available here.` : "Fully earned."}
              </p>
            </div>
          ))}
        </div>

        {recs.length > 0 && (
          <>
            <h3 className="label-xs mt-7">What to do next</h3>
            <div className="mt-3 flex flex-col gap-2">
              {recs.map((r: any) => (
                <div key={r.id} className="rounded-xl border border-accent/20 bg-accent/[0.05] p-4">
                  <p className="text-[13px] font-semibold">{r.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{r.body}</p>
                  <Link to={r.to} onClick={onClose} className="mt-2 inline-block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                    {r.cta} →
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}

        <h3 className="label-xs mt-7">Your real bureau score</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Upload a screenshot from TransUnion, Experian, Compuscan or XDS — or type it in. It stays private to you and
          sharpens your estimate.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="btn-ghost cursor-pointer">
            <Upload className="size-3.5" /> {busy ? "Reading…" : "Upload screenshot"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <select value={bureauName} onChange={(e) => setBureauName(e.target.value)} className="field !w-auto">
            {BUREAUS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Score"
            type="number"
            className="field !w-28"
          />
          <button onClick={save} className="btn-accent">
            Save
          </button>
        </div>

        {latestBureau && (
          <div className="mt-4 rounded-xl border border-hairline p-4 text-[12px] leading-relaxed">
            Your bureau score is <strong className="numeric">{latestBureau.score}</strong>. Our estimate was{" "}
            <strong className="numeric">{latestBureau.estimated_score ?? score.score}</strong>. The{" "}
            <strong>{Math.abs(latestBureau.gap ?? 0)}-point</strong> difference is most likely explained by{" "}
            {explainGap(latestBureau.gap ?? 0, score)}.
            <p className="mt-2 text-muted-foreground">
              {calibrationSamples > 0
                ? `Calibrated against ${calibrationSamples} real score${calibrationSamples === 1 ? "" : "s"} — the range narrows as you add more.`
                : "Add more real scores over time and the range narrows."}
            </p>
          </div>
        )}

        {confidence && (
          <div className="mt-4 rounded-xl border border-hairline p-4 text-[12px] leading-relaxed">
            <p className="font-semibold">Estimate confidence: {confidence.label}</p>
            <p className="mt-1 text-muted-foreground">{confidence.detail}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(confidence.progress * 100)}%` }} />
            </div>
            {hasContributed && (
              <p className="mt-3 text-accent">Thank you for improving Loot's accuracy — your real score helps sharpen everyone's estimate, with nothing personal shared.</p>
            )}
          </div>
        )}

        {(timeline.length > 1 || bureau.length > 0) && (
          <>
            <h3 className="label-xs mt-7">Estimate vs bureau over time</h3>
            <div className="mt-3 flex flex-col gap-1.5">
              {timeline.map((h: any) => {
                const real = bureau.find((b: any) => b.reported_on?.slice(0, 7) === h.month.slice(0, 7));
                return (
                  <div key={h.month} className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-[12px]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {new Date(h.month).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                    </span>
                    <span className="numeric">
                      Loot {h.score}
                      {real ? ` · ${real.bureau} ${real.score}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="mt-6 text-[11px] text-muted-foreground">
          Amounts shown in {currency}. This is an estimate built from your Loot data, not a credit bureau report.
        </p>
      </div>
    </div>
  );
}
