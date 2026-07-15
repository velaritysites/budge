import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { CATEGORY_LABELS, monthlyEquivalent, type ExpenseCategory, type ExpenseFrequency } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";

export type ExportPhase = {
  id: string;
  name: string;
  leftover: number;
  items: { id: string; name: string; amount: number; category: ExpenseCategory; frequency: ExpenseFrequency }[];
};

export type ExportPlan = {
  name: string;
  tax_rate_pct: number;
  phases: ExportPhase[];
  notes: string | null;
  updated_at?: string;
};

/**
 * Renders a printable/exportable snapshot of a plan.
 * Styling mirrors the app's Nocturne dark theme so downloaded assets
 * feel like a first-class export of Budge, not a generic report.
 */
export function PlanExportSheet({
  plan,
  currency,
  innerRef,
}: {
  plan: ExportPlan;
  currency: string;
  innerRef: React.Ref<HTMLDivElement>;
}) {
  const phaseMonthly = (p: ExportPhase) => p.items.reduce((s, i) => s + monthlyEquivalent(i), 0);
  const totalMonthly = plan.phases.reduce((s, p) => s + phaseMonthly(p), 0);
  const totalLeftover = plan.phases.reduce((s, p) => s + (Number(p.leftover) || 0), 0);
  const requiredNet = totalMonthly + totalLeftover;
  const taxRate = Math.max(0, Math.min(80, plan.tax_rate_pct || 0)) / 100;
  const requiredGross = taxRate < 1 ? requiredNet / (1 - taxRate) : requiredNet;
  const generated = new Date();

  // Explicit hex values (not tokens) so html2canvas renders identical colours
  // regardless of the user's active theme at export time.
  const bg = "#0A0D12";
  const surface = "#121620";
  const border = "rgba(235,238,245,0.12)";
  const fg = "#E9ECF3";
  const muted = "#8A93A6";
  const accent = "#7BC79A";

  return (
    <div
      ref={innerRef}
      style={{
        width: 900,
        padding: 48,
        background: bg,
        color: fg,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderBottom: `1px solid ${border}`, paddingBottom: 20, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: muted, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            Budge · Salary Planner
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", fontStyle: "italic", marginTop: 6, lineHeight: 1 }}>
            {plan.name}
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 8, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            {plan.phases.length} phase{plan.phases.length !== 1 ? "s" : ""} · Generated {generated.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: muted, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            Required gross / mo
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: accent, fontFamily: "JetBrains Mono, ui-monospace, monospace", letterSpacing: "-0.02em" }}>
            {formatCurrency(requiredGross, currency)}
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
            {formatCurrency(requiredGross * 12, currency)}/yr @ {plan.tax_rate_pct}% tax
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        {[
          ["Ideal monthly expenses", formatCurrency(totalMonthly, currency)],
          ["Leftover target", formatCurrency(totalLeftover, currency)],
          ["Required net / mo", formatCurrency(requiredNet, currency)],
        ].map(([label, value]) => (
          <div key={label} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: muted, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, fontFamily: "JetBrains Mono, ui-monospace, monospace", letterSpacing: "-0.02em" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Phases */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {plan.phases.map((ph, idx) => {
          const pm = phaseMonthly(ph);
          const share = totalMonthly > 0 ? (pm / totalMonthly) * 100 : 0;
          return (
            <div key={ph.id} style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: muted, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
                    Phase {idx + 1}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 2 }}>{ph.name}</div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: accent, letterSpacing: "-0.02em" }}>
                    {formatCurrency(pm, currency)}<span style={{ fontSize: 11, color: muted, fontWeight: 400 }}> /mo</span>
                  </div>
                  {ph.leftover > 0 && (
                    <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>+ {formatCurrency(ph.leftover, currency)} leftover</div>
                  )}
                  <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{share.toFixed(0)}% of total</div>
                </div>
              </div>

              {ph.items.length === 0 ? (
                <div style={{ fontSize: 12, color: muted, fontStyle: "italic", padding: "8px 0" }}>No items</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: muted, fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>
                      <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: `1px solid ${border}`, fontWeight: 500 }}>Item</th>
                      <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: `1px solid ${border}`, fontWeight: 500 }}>Category</th>
                      <th style={{ textAlign: "left", padding: "8px 6px", borderBottom: `1px solid ${border}`, fontWeight: 500 }}>Frequency</th>
                      <th style={{ textAlign: "right", padding: "8px 6px", borderBottom: `1px solid ${border}`, fontWeight: 500 }}>Amount</th>
                      <th style={{ textAlign: "right", padding: "8px 6px", borderBottom: `1px solid ${border}`, fontWeight: 500 }}>Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ph.items.map((i) => (
                      <tr key={i.id} style={{ fontSize: 12 }}>
                        <td style={{ padding: "8px 6px", borderBottom: `1px solid ${border}` }}>{i.name}</td>
                        <td style={{ padding: "8px 6px", borderBottom: `1px solid ${border}`, color: muted }}>{CATEGORY_LABELS[i.category]}</td>
                        <td style={{ padding: "8px 6px", borderBottom: `1px solid ${border}`, color: muted, textTransform: "capitalize" }}>{i.frequency.replace("_", " ")}</td>
                        <td style={{ padding: "8px 6px", borderBottom: `1px solid ${border}`, textAlign: "right", fontFamily: "JetBrains Mono, ui-monospace, monospace" }}>{formatCurrency(i.amount, currency)}</td>
                        <td style={{ padding: "8px 6px", borderBottom: `1px solid ${border}`, textAlign: "right", fontFamily: "JetBrains Mono, ui-monospace, monospace", color: muted }}>{formatCurrency(monthlyEquivalent(i), currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {plan.notes && (
        <div style={{ marginTop: 24, padding: 16, background: surface, border: `1px solid ${border}`, borderRadius: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: muted, fontFamily: "JetBrains Mono, ui-monospace, monospace", marginBottom: 6 }}>Notes</div>
          <div style={{ fontSize: 12, color: fg, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{plan.notes}</div>
        </div>
      )}

      <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${border}`, display: "flex", justifyContent: "space-between", fontSize: 10, color: muted, fontFamily: "JetBrains Mono, ui-monospace, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        <span>Budge · Salary Planner</span>
        <span>Rough estimate — real payroll varies by locale & benefits</span>
      </div>
    </div>
  );
}

async function snapshot(node: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(node, {
    backgroundColor: "#0A0D12",
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
}

function safeName(name: string) {
  return name.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() || "plan";
}

export async function exportPlanImage(node: HTMLElement, planName: string) {
  const canvas = await snapshot(node);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `budge-${safeName(planName)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportPlanPdf(node: HTMLElement, planName: string) {
  const canvas = await snapshot(node);
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;

  // Fill background so unused page area matches the sheet.
  pdf.setFillColor(10, 13, 18);
  pdf.rect(0, 0, pageW, pageH, "F");

  if (imgH <= pageH - margin * 2) {
    pdf.addImage(imgData, "PNG", margin, margin, imgW, imgH, undefined, "FAST");
  } else {
    // Slice long content across pages.
    const pxPerPt = canvas.width / imgW;
    const pagePxH = (pageH - margin * 2) * pxPerPt;
    let y = 0;
    let first = true;
    while (y < canvas.height) {
      const sliceH = Math.min(pagePxH, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#0A0D12";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) {
        pdf.addPage();
        pdf.setFillColor(10, 13, 18);
        pdf.rect(0, 0, pageW, pageH, "F");
      }
      const sliceImgH = (sliceH / pxPerPt);
      pdf.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, imgW, sliceImgH, undefined, "FAST");
      y += sliceH;
      first = false;
    }
  }

  pdf.save(`budge-${safeName(planName)}.pdf`);
}
