import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCIES } from "@/lib/currencies";
import { upsertCurrentMonthSnapshot } from "@/lib/snapshot";
import { ArrowRight, Search, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [freq, setFreq] = useState<"monthly" | "weekly" | "biweekly">("monthly");
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CURRENCIES.slice(0, 30);
    return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).slice(0, 30);
  }, [search]);

  async function finish() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const grossNum = parseFloat(gross || "0");
      const netNum = parseFloat(net || "0");
      const { error } = await supabase.from("profiles").update({
        currency_code: currency,
        pay_frequency: freq,
        gross_income: grossNum,
        net_income: netNum,
        onboarded_at: new Date().toISOString(),
      }).eq("id", u.user.id);
      if (error) throw error;
      await upsertCurrentMonthSnapshot({
        netIncome: netNum, grossIncome: grossNum, expenses: [], currencyCode: currency,
      });
      toast.success("All set.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    { title: "Pick your currency.", subtitle: "We'll format every number to match." },
    { title: "How often do you get paid?", subtitle: "We do the monthly math, you give us the rhythm." },
    { title: "What do you earn?", subtitle: "Gross before tax, net after. Editable anytime." },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-10 animate-enter">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="Budge" className="size-8 rounded-sm" />
          <span className="font-mono text-xs font-bold uppercase tracking-tight">Budge</span>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Step {step + 1} / 3
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight">{steps[step].title}</h1>
          <p className="text-muted-foreground text-sm">{steps[step].subtitle}</p>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 panel px-3 py-2.5">
              <Search className="size-4 text-muted-foreground" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search currencies"
                className="flex-1 bg-transparent text-sm focus:outline-none" />
            </div>
            <div className="panel p-2 max-h-64 overflow-y-auto space-y-1">
              {filtered.map((c) => (
                <button key={c.code} onClick={() => setCurrency(c.code)}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-background rounded text-left">
                  <span className="text-base">{c.flag}</span>
                  <span className="font-mono w-12">{c.code}</span>
                  <span className="text-muted-foreground flex-1 truncate">{c.name}</span>
                  {c.code === currency && <Check className="size-4 text-accent" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-2">
            {([
              { v: "monthly", label: "Monthly", hint: "Once a month" },
              { v: "biweekly", label: "Bi-weekly", hint: "Every two weeks" },
              { v: "weekly", label: "Weekly", hint: "Once a week" },
            ] as const).map((opt) => (
              <button key={opt.v} onClick={() => setFreq(opt.v)}
                className={`flex items-center justify-between p-4 rounded-lg border text-left transition ${freq === opt.v ? "bg-foreground text-background border-foreground" : "bg-surface border-border hover:bg-background"}`}>
                <div>
                  <div className="font-bold">{opt.label}</div>
                  <div className={`text-xs ${freq === opt.v ? "opacity-60" : "text-muted-foreground"}`}>{opt.hint}</div>
                </div>
                {freq === opt.v && <Check className="size-4" />}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Gross (before tax)</label>
              <input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0.00"
                className="w-full panel px-3 py-3 text-2xl font-bold font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Net (take-home)</label>
              <input type="number" step="0.01" value={net} onChange={(e) => setNet(e.target.value)} placeholder="0.00"
                className="w-full panel px-3 py-3 text-2xl font-bold font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed panel p-3">
              Got more than one income stream? No problem — add your primary here and you can add or remove others anytime from <span className="text-foreground font-medium">Settings → Income streams</span>.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="px-4 py-3 text-sm border border-border rounded-lg hover:bg-surface">
              Back
            </button>
          )}
          {step < 2 ? (
            <button onClick={() => setStep(step + 1)}
              className="flex-1 btn-accent py-3 text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90">
              Continue <ArrowRight className="size-4" />
            </button>
          ) : (
            <button onClick={finish} disabled={busy}
              className="flex-1 btn-accent py-3 text-sm font-bold disabled:opacity-50">
              {busy ? "Saving…" : "Take me in"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
