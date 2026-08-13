import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useExpenses, useProfile, useUpdateProfile, useIncomeStreams, type IncomeStream } from "@/hooks/use-profile";
import { CURRENCIES } from "@/lib/currencies";
import { upsertCurrentMonthSnapshot } from "@/lib/snapshot";
import { supabase } from "@/integrations/supabase/client";
import { registerPushToken } from "@/lib/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { Check, Search, Plus, Trash2, Bell, Mail, Smartphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Budge" }] }),
  component: SettingsPage,
});

function monthly(s: IncomeStream): number {
  const g = s.net_amount;
  switch (s.frequency) {
    case "monthly": return g;
    case "weekly": return (g * 52) / 12;
    case "biweekly": return (g * 26) / 12;
    case "yearly": return g / 12;
  }
}
function monthlyGross(s: IncomeStream): number {
  const g = s.gross_amount;
  switch (s.frequency) {
    case "monthly": return g;
    case "weekly": return (g * 52) / 12;
    case "biweekly": return (g * 26) / 12;
    case "yearly": return g / 12;
  }
}

function SettingsPage() {
  const { data: profile } = useProfile();
  const { data: expenses = [] } = useExpenses();
  const { data: streams = [] } = useIncomeStreams();
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [buffer, setBuffer] = useState("");
  const [name, setName] = useState("");
  const [freq, setFreq] = useState<"monthly" | "weekly" | "biweekly">("monthly");
  const [currency, setCurrency] = useState("USD");
  const [currOpen, setCurrOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [emailN, setEmailN] = useState(false);
  const [pushN, setPushN] = useState(false);
  const [allocMode, setAllocMode] = useState<"weighted" | "sequential">("weighted");
  const [autoTiming, setAutoTiming] = useState<"monthly_1st" | "on_demand" | "estimate_only">("on_demand");

  // Income stream form
  const [sName, setSName] = useState("");
  const [sGross, setSGross] = useState("");
  const [sNet, setSNet] = useState("");
  const [sFreq, setSFreq] = useState<IncomeStream["frequency"]>("monthly");

  useEffect(() => {
    if (profile) {
      setGross(String(profile.gross_income));
      setNet(String(profile.net_income));
      setBuffer(String(profile.safety_buffer_pct));
      setName(profile.display_name ?? "");
      setFreq(profile.pay_frequency);
      setCurrency(profile.currency_code);
      setEmailN(profile.email_notifications);
      setPushN(profile.push_notifications);
      setAllocMode(((profile as any).auto_allocation_mode as any) ?? "weighted");
      setAutoTiming(((profile as any).auto_contribution_timing as any) ?? "on_demand");
    }
  }, [profile]);

  const filteredCurrencies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CURRENCIES.slice(0, 50);
    return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [search]);

  const streamTotals = useMemo(() => {
    const active = streams.filter((s) => s.is_active);
    return {
      net: active.reduce((s, x) => s + monthly(x), 0),
      gross: active.reduce((s, x) => s + monthlyGross(x), 0),
    };
  }, [streams]);

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
      email_notifications: emailN,
      push_notifications: pushN,
      auto_allocation_mode: allocMode,
      auto_contribution_timing: autoTiming,
    } as any);
    if (pushN && !profile.push_token) {
      const token = await registerPushToken();
      if (token) await supabase.from("profiles").update({ push_token: token }).eq("id", profile.id);
    }
    await upsertCurrentMonthSnapshot({
      netIncome: parseFloat(net || "0"), grossIncome: parseFloat(gross || "0"),
      expenses, currencyCode: currency,
    });
    toast.success("Saved");
  }

  async function addStream() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || !sName || (!sGross && !sNet)) return toast.error("Name and amounts required");
    const { error } = await supabase.from("income_streams").insert({
      user_id: u.user.id, name: sName,
      gross_amount: parseFloat(sGross || "0"), net_amount: parseFloat(sNet || "0"),
      frequency: sFreq, is_active: true,
    });
    if (error) return toast.error(error.message);
    setSName(""); setSGross(""); setSNet("");
    await qc.invalidateQueries({ queryKey: ["income_streams"] });
    toast.success("Income stream added");
  }
  async function removeStream(id: string) {
    const { error } = await supabase.from("income_streams").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["income_streams"] });
  }
  async function toggleStream(id: string, active: boolean) {
    const { error } = await supabase.from("income_streams").update({ is_active: !active }).eq("id", id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["income_streams"] });
  }

  const selectedCurrency = CURRENCIES.find((c) => c.code === currency);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b border-border flex items-center px-6 md:px-8">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Settings</span>
      </header>

      <form onSubmit={save} className="p-6 md:p-8 max-w-2xl mx-auto w-full space-y-8">
        <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight">Your setup.</h1>

        <Section title="Profile">
          <Field label="Display name">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full panel px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
          </Field>
        </Section>

        <Section title="Currency & pay">
          <Field label="Currency">
            <button type="button" onClick={() => setCurrOpen(!currOpen)}
              className="w-full flex items-center justify-between panel px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                <span>{selectedCurrency?.flag}</span>
                <span className="font-mono">{selectedCurrency?.code}</span>
                <span className="text-muted-foreground">— {selectedCurrency?.name}</span>
              </span>
            </button>
            {currOpen && (
              <div className="mt-2 panel p-2 space-y-1 max-h-64 overflow-y-auto">
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

        <Section title="Income (totals)">
          <Field label="Gross income (monthly)">
            <input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)}
              className="w-full panel px-3 py-2.5 text-lg font-bold font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
          </Field>
          <Field label="Net / take-home (monthly)">
            <input type="number" step="0.01" value={net} onChange={(e) => setNet(e.target.value)}
              className="w-full panel px-3 py-2.5 text-lg font-bold font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
          </Field>
          <p className="text-xs text-muted-foreground">
            These are the numbers used across the app. If you have multiple income streams, list them below for your records — then update these totals to match the sum.
          </p>
        </Section>

        <Section title="Income streams">
          <p className="text-xs text-muted-foreground -mt-2">
            Break down where your income comes from. Active streams below sum to <span className="text-foreground font-mono font-medium">{formatCurrency(streamTotals.net, currency)}/mo net</span> · <span className="text-foreground font-mono font-medium">{formatCurrency(streamTotals.gross, currency)}/mo gross</span>.
          </p>
          <div className="space-y-1">
            {streams.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">No streams yet.</p>
            ) : streams.map((s) => (
              <div key={s.id} className={`group flex items-center gap-3 p-3 rounded-lg border ${s.is_active ? "bg-surface border-border" : "bg-surface/40 border-border/40 opacity-60"}`}>
                <button type="button" onClick={() => toggleStream(s.id, s.is_active)}
                  className={`size-2 rounded-full ${s.is_active ? "bg-accent" : "bg-muted-foreground/40"}`} title={s.is_active ? "Active" : "Paused"} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{s.name}</span>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{s.frequency}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    gross {formatCurrency(s.gross_amount, currency)} · net {formatCurrency(s.net_amount, currency)}
                  </div>
                </div>
                <button type="button" onClick={() => removeStream(s.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-alert transition"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="panel p-3 space-y-2 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Stream name (e.g. Freelance)"
                className="field" />
              <select value={sFreq} onChange={(e) => setSFreq(e.target.value as IncomeStream["frequency"])}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="monthly">Monthly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
              <input value={sGross} onChange={(e) => setSGross(e.target.value)} type="number" step="0.01" placeholder="Gross"
                className="field" />
              <input value={sNet} onChange={(e) => setSNet(e.target.value)} type="number" step="0.01" placeholder="Net"
                className="field" />
            </div>
            <button type="button" onClick={addStream}
              className="w-full bg-foreground text-background rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-2">
              <Plus className="size-3.5" /> Add income stream
            </button>
          </div>
        </Section>

        <Section title="Notifications">
          <p className="text-xs text-muted-foreground -mt-2 flex items-center gap-2">
            <Bell className="size-3.5" /> Reminders for upcoming expenses. Configure lead time per expense on the Expenses page.
          </p>
          <ToggleRow icon={<Mail className="size-4" />} label="Email reminders" desc="Sent to your account email."
            checked={emailN} onChange={setEmailN} />
          <ToggleRow icon={<Smartphone className="size-4" />} label="Push notifications" desc="Wired up now, live once the iOS app ships."
            checked={pushN} onChange={setPushN} />
        </Section>

        <Section title="Goals — auto progress">
          <p className="text-xs text-muted-foreground -mt-2">
            How auto-goals share your monthly disposable, and when the contribution actually gets logged.
          </p>
          <Field label="Allocation mode">
            <div className="grid grid-cols-2 gap-2">
              {(["weighted", "sequential"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setAllocMode(m)}
                  className={`py-2.5 rounded-lg border text-xs font-medium uppercase tracking-widest transition ${allocMode === m ? "bg-foreground text-background border-foreground" : "bg-surface border-border text-muted-foreground"}`}>
                  {m === "weighted" ? "Weighted split" : "Fill in order"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {allocMode === "weighted"
                ? "Each auto-goal receives a share of your monthly disposable proportional to its weight."
                : "Fills the top-priority auto-goal first; overflow spills to the next."}
            </p>
          </Field>
          <Field label="When to log auto contributions">
            <div className="grid grid-cols-1 gap-2">
              {([
                ["monthly_1st", "Monthly on the 1st", "Auto-log for the previous month when you open the app."],
                ["on_demand", "On-demand", "Show a suggested amount; you click 'Apply' to log it."],
                ["estimate_only", "Estimate only", "Just show the projection; nothing gets logged automatically."],
              ] as const).map(([val, title, desc]) => (
                <button key={val} type="button" onClick={() => setAutoTiming(val)}
                  className={`text-left p-3 rounded-lg border transition ${autoTiming === val ? "border-accent bg-accent/10" : "border-border bg-surface"}`}>
                  <div className="text-sm font-bold">{title}</div>
                  <div className="text-[11px] text-muted-foreground">{desc}</div>
                </button>
              ))}
            </div>
          </Field>
        </Section>



        <Section title="Safety buffer">
          <Field label="Buffer % of net income (default 12.5%)">
            <input type="number" step="0.5" min="0" max="50" value={buffer} onChange={(e) => setBuffer(e.target.value)}
              className="w-full panel px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
            <p className="text-xs text-muted-foreground">The cushion the affordability checker keeps untouched.</p>
          </Field>
        </Section>

        <button type="submit" disabled={update.isPending} className="w-full btn-accent py-3 text-sm font-bold disabled:opacity-50">
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function ToggleRow({ icon, label, desc, checked, onChange }: { icon: React.ReactNode; label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 panel p-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[11px] text-muted-foreground truncate">{desc}</div>
        </div>
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`shrink-0 relative w-10 h-6 rounded-full transition ${checked ? "bg-accent" : "bg-muted"}`}>
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
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
