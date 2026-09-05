import { useState } from "react";
import { useBriefings } from "@/lib/briefing";
import { monthLabel } from "@/lib/monthly-close";
import { ChevronDown, Newspaper } from "lucide-react";

export function BriefingCard() {
  const { data: briefings = [] } = useBriefings();
  const [open, setOpen] = useState(false);
  const latest = briefings[0];
  if (!latest) return null;

  return (
    <section className="panel overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-4 p-5 text-left">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          <Newspaper className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="label-xs">Monthly briefing</p>
          <h3 className="truncate text-[15px] font-semibold tracking-tight">{monthLabel(latest.month)} in review</h3>
          <p className="truncate text-[12px] text-muted-foreground">{latest.observations[0] ?? latest.recommendation}</p>
        </div>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-hairline px-5 pb-5 pt-4">
          <BriefingBody observations={latest.observations} recommendation={latest.recommendation} />
        </div>
      )}
    </section>
  );
}

export function BriefingBody({ observations, recommendation }: { observations: string[]; recommendation: string }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {observations.map((o, i) => (
          <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
            <span>{o}</span>
          </li>
        ))}
      </ul>
      {recommendation && (
        <p className="rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-[13px] leading-relaxed">{recommendation}</p>
      )}
    </div>
  );
}

export function BriefingsList() {
  const { data: briefings = [] } = useBriefings();
  if (briefings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Briefings appear here once you close off a month from the dashboard.
      </p>
    );
  }
  return (
    <div className="animate-enter space-y-5">
      {briefings.map((b) => (
        <section key={b.month} className="panel p-6">
          <p className="label-xs mb-3">{monthLabel(b.month)}</p>
          <BriefingBody observations={b.observations} recommendation={b.recommendation} />
        </section>
      ))}
    </div>
  );
}
