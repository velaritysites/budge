/**
 * Monthly global recalibration of the Loot Score.
 *
 * Reads the shared calibration dataset (estimate vs real bureau score plus the
 * five factor values at estimate time) and fits per-factor correction terms
 * that every future estimate benefits from. Call monthly from a scheduler.
 */
import { createFileRoute } from "@tanstack/react-router";

const FACTORS = ["dti", "payment_consistency", "savings_rate", "utilisation", "expense_consistency"] as const;

export const Route = createFileRoute("/api/public/recalibrate-scores")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
        const provided = request.headers.get("x-recalibrate-key") ?? "";
        if (!key || provided.length !== key.length || provided !== key) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("score_calibration")
          .select("estimated_score, real_score, gap, dti, payment_consistency, savings_rate, utilisation, expense_consistency")
          .limit(20000);
        if (error) return new Response(error.message, { status: 500 });

        const rows = data ?? [];
        if (rows.length < 5) {
          return Response.json({ ok: true, skipped: true, sample_size: rows.length });
        }

        const gaps = rows.map((r: any) => Number(r.real_score) - Number(r.estimated_score));
        const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        const meanAbsGap = gaps.reduce((s, g) => s + Math.abs(g), 0) / gaps.length;

        // Per-factor univariate slope, damped so no single factor dominates.
        const corrections: Record<string, number> = {};
        let explained = 0;
        for (const f of FACTORS) {
          const xs = rows.map((r: any) => Number(r[f] ?? 0));
          const meanX = xs.reduce((s, x) => s + x, 0) / xs.length;
          let cov = 0;
          let varX = 0;
          for (let i = 0; i < xs.length; i++) {
            const dx = xs[i]! - meanX;
            cov += dx * (gaps[i]! - meanGap);
            varX += dx * dx;
          }
          const slope = varX > 1e-9 ? (cov / varX) / FACTORS.length : 0;
          const clamped = Math.max(-150, Math.min(150, slope));
          corrections[f] = Math.round(clamped * 100) / 100;
          explained += clamped * meanX;
        }
        corrections["intercept"] = Math.round((meanGap - explained) * 100) / 100;

        const { error: upErr } = await supabaseAdmin
          .from("score_corrections")
          .update({
            corrections,
            sample_size: rows.length,
            mean_gap: Math.round(meanGap * 100) / 100,
            mean_abs_gap: Math.round(meanAbsGap * 100) / 100,
            updated_at: new Date().toISOString(),
          })
          .eq("id", 1);
        if (upErr) return new Response(upErr.message, { status: 500 });

        return Response.json({ ok: true, sample_size: rows.length, corrections, mean_gap: meanGap });
      },
    },
  },
});
