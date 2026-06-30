import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useExpenses, useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { CURRENCIES } from "@/lib/currencies";
import { upsertCurrentMonthSnapshot } from "@/lib/snapshot";
import { toast } from "sonner";
import { Check, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — CanIAfford" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const update = useUpdateProfile();
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [buffer, setBuffer] = useState("");
  const [name, setName] = useState("");
  const [freq, setFreq] = useState<"monthly" | "weekly" | "biweekly">("monthly");
  const [currency, setCurrency] = useState("USD");
  const [currOpen, setCurrOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (profile) {
      setGross(String(profile.gross_income));
      setNet(String(profile.net_income));
      setBuffer(String(profile.safety_buffer_pct));
      setName(profile.display_name ?? "");
      setFreq(profile.pay_frequency);
      setCurrency(profile.currency_code);
    }
  }, [profile]);

  const filteredCurrencies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CURRENCIES.slice(0, 50);
    return CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    ).slice(0, 50);
  }, [search]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    await update.mutateAsync({
      gross_income: parseFloat(gross || "0"),
      net_income: parseFloat(net || "0"),
      safety_buffer_pct: parseFloat(buffer || "12.5"),
      display_name: name || null,
      pay_frequency: freq,
      currency_code: currency,
    });
    await upsertCurrentMonthSnapshot({
      netIncome: parseFloat(net || "0"),
      grossIncome: parseFloat(gross || "0"),
      expenses,
      currencyCode: currency,
    });
    toast.success("Saved");
  }

  const selectedCurrency = CURRENCIES.find((c) => c.code === currency);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Settings</span>
      </header>

      <form onSubmit={save} className="p-6 md:p-8 max-w-2xl mx-auto w-full space-y-8">
        <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic">Your setup.</h1>

        <Section title="Profile">
          <Field label="Display name">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
          </Field>
        </Section>

        <Section title="Currency & pay">
          <Field label="Currency">
            <button type="button" onClick={() => setCurrOpen(!currOpen)}
              className="w-full flex items-center justify-between bg-surface border border-border rounded-lg px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                <span>{selectedCurrency?.flag}</span>
                <span className="font-mono">{selectedCurrency?.code}</span>
                <span className="text-muted-foreground">— {selectedCurrency?.name}</span>
              </span>
            </button>
            {currOpen && (
              <div className="mt-2 bg-surface border border-border rounded-lg p-2 space-y-1 max-h-64 overflow-y-auto">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Search className="size-3.5 text-muted-foreground" />
                  <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
                    className="flex-1 bg-transparent text-sm focus:outline-none" />
                </div>
                {filteredCurrencies.map((c) => (
                  <button key={c.code} type="button" onClick={() => { setCurrency(c.code); setCurrOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-background rounded text-left">
                    <span>{c.flag}</span>
                    <span className="font-mono w-12">{c.code}</span>
                    <span className="text-muted-foreground flex-1 truncate">{c.name}</span>
                    {c.code === currency && <Check className="size-3.5 text-accent" />}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label="Pay frequency">
            <div className="grid grid-cols-3 gap-2">
              {(["monthly", "biweekly", "weekly"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFreq(f)}
                  className={`py-2.5 rounded-lg border text-xs font-medium uppercase tracking-widest transition ${freq === f ? "bg-foreground text-background border-foreground" : "bg-surface border-border text-muted-foreground"}`}>
                  {f}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="Income">
          <Field label="Gross income (monthly)">
            <input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-lg font-bold font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
          </Field>
          <Field label="Net / take-home (monthly)">
            <input type="number" step="0.01" value={net} onChange={(e) => setNet(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-lg font-bold font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
          </Field>
        </Section>

        <Section title="Safety buffer">
          <Field label="Buffer % of net income (default 12.5%)">
            <input type="number" step="0.5" min="0" max="50" value={buffer} onChange={(e) => setBuffer(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
            <p className="text-xs text-muted-foreground">The cushion the affordability checker keeps untouched.</p>
          </Field>
        </Section>

        <button type="submit" disabled={update.isPending} className="w-full bg-accent text-accent-foreground rounded-lg py-3 text-sm font-bold disabled:opacity-50">
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
