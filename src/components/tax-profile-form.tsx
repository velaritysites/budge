import { useState } from "react";
import { toast } from "sonner";
import { Check, Info } from "lucide-react";
import { DEFAULT_TAX_PROFILE, useSaveTaxProfile, type TaxProfile } from "@/hooks/use-tax-profile";

const EMPLOYMENT = [
  { key: "salaried", label: "Salaried (PAYE only)" },
  { key: "freelance", label: "Freelance or self-employed (no PAYE)" },
  { key: "both", label: "Both salaried and freelance" },
  { key: "director", label: "Director of a company" },
] as const;

const PROVISIONAL = [
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
  { key: "unsure", label: "Not sure" },
] as const;

const HOME_OFFICE = [
  { key: "full", label: "Yes, full time" },
  { key: "partial", label: "Yes, partial days" },
  { key: "no", label: "No" },
] as const;

export function TaxProfileForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: TaxProfile | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [p, setP] = useState<TaxProfile>(initial ?? DEFAULT_TAX_PROFILE);
  const save = useSaveTaxProfile();
  const set = <K extends keyof TaxProfile>(k: K, v: TaxProfile[K]) => setP((s) => ({ ...s, [k]: v }));

  const travel = p.has_company_car ? "car" : p.has_travel_allowance ? "allowance" : "no";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p.home_office_enabled !== "no" && (!p.home_office_area_m2 || !p.home_total_area_m2)) {
      return toast.error("Add both your office and total home floor area");
    }
    try {
      await save.mutateAsync(p);
      toast.success("Tax profile saved");
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save");
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-6 p-6">
      <div>
        <h2 className="text-lg font-display font-bold tracking-tight">Set up your tax profile</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Nine quick questions. They decide which parts of the Tax Centre you see and how your estimate is worked out.
        </p>
      </div>

      <Field label="What kind of income do you earn?">
        <Choices options={EMPLOYMENT} value={p.employment_type} onChange={(v) => set("employment_type", v as any)} />
      </Field>

      <Field label="Are you registered for provisional tax?">
        <Choices options={PROVISIONAL} value={p.is_provisional_taxpayer} onChange={(v) => set("is_provisional_taxpayer", v as any)} />
        {p.is_provisional_taxpayer === "unsure" && (
          <p className="mt-2 flex items-start gap-2 rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            You generally need to register if you earn income that has no PAYE deducted — freelance or consulting fees, rental
            income, or business profit. Salary-only earners usually do not. Interest under R23,800 a year (R34,500 if you are 65+)
            does not count on its own.
          </p>
        )}
      </Field>

      <Field label="Do you work from home?">
        <Choices options={HOME_OFFICE} value={p.home_office_enabled} onChange={(v) => set("home_office_enabled", v as any)} />
        {p.home_office_enabled !== "no" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <NumberInput label="Home office floor area (m²)" value={p.home_office_area_m2}
              onChange={(v) => set("home_office_area_m2", v)} />
            <NumberInput label="Total home floor area (m²)" value={p.home_total_area_m2}
              onChange={(v) => set("home_total_area_m2", v)} />
          </div>
        )}
      </Field>

      <Field label="Do you receive a travel allowance or have a company car?">
        <Choices
          options={[
            { key: "allowance", label: "Yes — travel allowance" },
            { key: "car", label: "Yes — company car" },
            { key: "no", label: "No" },
          ]}
          value={travel}
          onChange={(v) => {
            set("has_travel_allowance", v === "allowance");
            set("has_company_car", v === "car");
          }}
        />
      </Field>

      <Field label="Do you contribute to a retirement annuity outside of your employer?">
        <Choices options={[{ key: "yes", label: "Yes" }, { key: "no", label: "No" }]}
          value={p.has_ra ? "yes" : "no"} onChange={(v) => set("has_ra", v === "yes")} />
        {p.has_ra && (
          <label className="mt-3 block space-y-1">
            <span className="label-xs">Provider (optional)</span>
            <input value={p.ra_provider ?? ""} onChange={(e) => set("ra_provider", e.target.value)}
              placeholder="e.g. Allan Gray, 10X, Sygnia" className="field" />
          </label>
        )}
      </Field>

      <Field label="Do you earn income from investments (dividends, interest, rental)?">
        <Choices options={[{ key: "yes", label: "Yes" }, { key: "no", label: "No" }]}
          value={p.has_investment_income ? "yes" : "no"} onChange={(v) => set("has_investment_income", v === "yes")} />
      </Field>

      <Field label="How old are you?">
        <div className="max-w-[12rem]">
          <NumberInput label="Age" value={p.age} onChange={(v) => set("age", v)} />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Used only to apply the right SARS rebate: under 65, 65–74, or 75 and over.
        </p>
      </Field>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={save.isPending}
          className="btn-accent flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          <Check className="size-4" /> {save.isPending ? "Saving…" : "Save tax profile"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="rounded-xl border border-hairline px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}

function Choices({
  options, value, onChange,
}: {
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)}
          className={`rounded-xl border px-4 py-2 text-[13px] transition ${
            value === o.key
              ? "border-accent bg-accent/10 text-accent"
              : "border-hairline bg-surface-2 text-muted-foreground hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="label-xs">{label}</span>
      <input type="number" min="0" value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))} className="field" />
    </label>
  );
}
