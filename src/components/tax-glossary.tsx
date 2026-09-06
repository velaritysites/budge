import { createContext, useContext, useMemo, useState } from "react";
import { HelpCircle, Search, X } from "lucide-react";
import { TAX_GLOSSARY, GLOSSARY_MAP, type GlossaryTerm } from "@/lib/tax-glossary";

const GlossaryCtx = createContext<{ open: (key: string) => void }>({ open: () => {} });

/** Wraps the Tax page so any term can pop its definition up from the bottom. */
export function GlossaryProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<GlossaryTerm | null>(null);
  const value = useMemo(
    () => ({ open: (key: string) => setActive(GLOSSARY_MAP[key] ?? null) }),
    [],
  );
  return (
    <GlossaryCtx.Provider value={value}>
      {children}
      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm"
          onClick={() => setActive(null)}>
          <div className="panel m-3 w-full max-w-lg p-6 animate-enter" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-display font-bold tracking-tight">{active.term}</h3>
                <p className="label-xs mt-1">{active.official}</p>
              </div>
              <button onClick={() => setActive(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{active.plain}</p>
            {active.example && (
              <p className="mt-3 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-[12px] text-muted-foreground">
                <span className="text-foreground">For example: </span>{active.example}
              </p>
            )}
          </div>
        </div>
      )}
    </GlossaryCtx.Provider>
  );
}

/** Small help icon that opens the glossary entry for a term. */
export function TaxTerm({ termKey, children }: { termKey: string; children?: React.ReactNode }) {
  const { open } = useContext(GlossaryCtx);
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <button type="button" onClick={() => open(termKey)} title="What does this mean?"
        className="text-muted-foreground hover:text-accent">
        <HelpCircle className="size-3.5" />
      </button>
    </span>
  );
}

/** Searchable glossary list. */
export function GlossaryList() {
  const [q, setQ] = useState("");
  const terms = TAX_GLOSSARY.filter((t) =>
    `${t.term} ${t.official} ${t.plain}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tax terms"
          className="field pl-9" />
      </div>
      {terms.length === 0 && <p className="text-[13px] text-muted-foreground">No term matches “{q}”.</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {terms.map((t) => (
          <div key={t.key} className="rounded-xl border border-hairline bg-surface-2 px-4 py-3">
            <p className="text-sm font-semibold">{t.term}</p>
            <p className="label-xs mt-0.5">{t.official}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t.plain}</p>
            {t.example && <p className="mt-2 text-[12px] text-muted-foreground"><span className="text-foreground">Example: </span>{t.example}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
