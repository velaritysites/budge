import { useState } from "react";
import { ChevronDown, ExternalLink, Sparkles } from "lucide-react";

export type GuideStep = { title: string; body: React.ReactNode };

const EFILING_URL = "https://www.sarsefiling.co.za";

export function buildGuideSteps(opts: {
  provisional: boolean;
  investmentIncome: boolean;
  deductions: string[];
}): GuideStep[] {
  const steps: GuideStep[] = [
    {
      title: "1. Get your IRP5 from your employer",
      body: (
        <>
          <p>Your employer submits your IRP5 to SARS, usually by the end of May. You do not have to hand it in yourself — it appears
            automatically on your return once filing season opens.</p>
          <p>Check the income and PAYE figures against your December and February payslips. If something is wrong, ask your payroll
            department to submit a corrected IRP5 before you file. Filing on a wrong IRP5 is much harder to undo later.</p>
        </>
      ),
    },
    {
      title: "2. Register or log in to eFiling",
      body: (
        <>
          <p>Go to the SARS eFiling portal and register with your ID number, or log in if you already have a profile. First-time
            registration may ask you to verify your identity with a selfie and ID document.</p>
          <p><GuideLink /></p>
        </>
      ),
    },
    {
      title: "3. Check whether SARS auto-assessed you",
      body: (
        <>
          <p>SARS sends an SMS or email if it has completed your return for you. Log in to eFiling and open the assessment to see
            exactly what SARS used.</p>
          <p>Accept it only if every deduction you are entitled to is already there. If your retirement annuity, medical aid or home
            office costs are missing, edit the return instead of accepting.</p>
        </>
      ),
    },
    {
      title: "4. Open your ITR12",
      body: (
        <p>On eFiling, go to Returns → Personal Income Tax (ITR12) and select the tax year. The wizard asks which sections apply to
          you — tick retirement contributions, medical, travel and any other item relevant to your situation, then the right fields
          appear on the form.</p>
      ),
    },
    {
      title: "5. Enter your income",
      body: (
        <p>Your IRP5 income fields are pre-filled and locked. Compare them to your certificate line by line. Add any income SARS does
          not know about — freelance fees, rental income or interest — in the relevant section.</p>
      ),
    },
    {
      title: `6. Claim your deductions${opts.deductions.length ? ` (${opts.deductions.join(", ")})` : ""}`,
      body: (
        <ul className="ml-4 list-disc space-y-1.5">
          {opts.deductions.includes("Retirement annuity") && (
            <li>Retirement annuity: enter contributions from your annual RA certificate. SARS applies the 27.5% / R350,000 cap for you.</li>
          )}
          {opts.deductions.includes("Medical aid") && (
            <li>Medical aid: your scheme reports contributions and members. Add qualifying out-of-pocket medical expenses yourself.</li>
          )}
          {opts.deductions.includes("Home office") && (
            <li>Home office: claim under "Other deductions" using your floor-area percentage of rent or bond interest, rates,
              electricity and internet. Keep a floor plan and invoices.</li>
          )}
          {opts.deductions.includes("Travel") && (
            <li>Travel allowance: you must have a logbook with opening and closing odometer readings and business kilometres. No
              logbook, no claim.</li>
          )}
          {opts.deductions.includes("Donations") && (
            <li>Donations: enter Section 18A donations and keep the certificates. Capped at 10% of taxable income.</li>
          )}
          {opts.deductions.length === 0 && <li>Nothing extra to claim on your profile — your IRP5 covers it.</li>}
        </ul>
      ),
    },
  ];

  if (opts.provisional) {
    steps.push({
      title: "7. Submit your provisional return (IRP6)",
      body: (
        <>
          <p>Provisional taxpayers file twice a year. On eFiling go to Returns → Provisional Tax (IRP6) and pick the period: first
            period closes 31 August, second period the last day of February.</p>
          <p>Estimate your total taxable income for the year, not just what you have earned so far. Under-estimating by more than 10%
            in the second period can trigger a penalty. Pay via the eFiling payment tab before the due date.</p>
        </>
      ),
    });
  }

  if (opts.investmentIncome) {
    steps.push({
      title: `${opts.provisional ? 8 : 7}. Declare investment income`,
      body: (
        <ul className="ml-4 list-disc space-y-1.5">
          <li>Local interest: enter the total from your IT3(b) certificates. The first R23,800 a year is exempt (R34,500 if 65+).</li>
          <li>Dividends: local dividends are taxed at source at 20% — declare them, but you do not pay again.</li>
          <li>Rental income: declare rent received and claim rates, levies, bond interest, insurance and repairs against it.</li>
        </ul>
      ),
    });
  }

  steps.push(
    {
      title: `${steps.length + 1}. Review and submit`,
      body: (
        <p>Use the calculator button on eFiling before submitting — it shows your expected refund or amount owing. Check your banking
          details are current, then submit. Keep every supporting document for five years in case of an audit.</p>
      ),
    },
    {
      title: `${steps.length + 2}. After submission`,
      body: (
        <p>You get an ITA34 assessment, usually within minutes. Refunds are normally paid within 7 to 21 business days if your banking
          details are verified. If SARS asks for supporting documents you have 21 business days to upload them on eFiling.</p>
      ),
    },
  );

  return steps;
}

function GuideLink() {
  return (
    <a href={EFILING_URL} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-accent hover:underline">
      Open SARS eFiling <ExternalLink className="size-3.5" />
    </a>
  );
}

export function AutoAssessmentCallout() {
  return (
    <div className="panel border-accent/30 bg-accent/[0.06] p-5">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-accent" /> SARS might file for you
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        SARS may auto-assess you if your income is straightforward. You'll receive an SMS or email. If the auto-assessment is
        correct — accept it. If it's wrong or incomplete (for example, missing deductions) — edit it before accepting. You have
        40 business days to respond before it becomes final. Loot's deduction tracker helps you know what to check.
      </p>
    </div>
  );
}

export function GuideAccordion({ steps }: { steps: GuideStep[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="flex flex-col gap-2">
      {steps.map((s, i) => (
        <div key={s.title} className="rounded-xl border border-hairline bg-surface-2">
          <button onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
            <span className="text-sm font-medium">{s.title}</span>
            <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && (
            <div className="space-y-2 px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">{s.body}</div>
          )}
        </div>
      ))}
    </div>
  );
}
