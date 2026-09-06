/** Plain-language definitions of the SA tax terms used across the Tax Centre. */
export type GlossaryTerm = {
  key: string;
  term: string;
  official: string;
  plain: string;
  example?: string;
};

export const TAX_GLOSSARY: GlossaryTerm[] = [
  {
    key: "irp5",
    term: "IRP5",
    official: "Employee Tax Certificate",
    plain:
      "The certificate your employer gives SARS (and you) showing what you earned and how much PAYE was deducted for the tax year. You do not fill it in yourself — your employer submits it, and it pre-populates your return.",
    example: "If you earned R480,000 and R78,000 PAYE was withheld, both figures appear on your IRP5.",
  },
  {
    key: "itr12",
    term: "ITR12",
    official: "Income Tax Return for Individuals",
    plain:
      "The annual return you submit on eFiling. It combines your IRP5 income with anything else you earned and any deductions you claim, and SARS uses it to work out whether you owe money or get a refund.",
  },
  {
    key: "irp6",
    term: "IRP6",
    official: "Provisional Tax Return",
    plain:
      "The return provisional taxpayers submit twice a year — end of August and end of February — estimating their income and paying tax on it in advance instead of monthly through a payslip.",
  },
  {
    key: "paye",
    term: "PAYE",
    official: "Pay As You Earn",
    plain:
      "Income tax your employer takes off your salary each month and pays to SARS on your behalf. It is an estimate, which is why you can still get a refund or owe a little at year end.",
    example: "On a R40,000 monthly salary, roughly R6,900 a month goes to SARS as PAYE.",
  },
  {
    key: "provisional_tax",
    term: "Provisional tax",
    official: "Provisional Tax",
    plain:
      "A way of paying tax in advance in two instalments if you earn income that has no PAYE deducted — freelancing, rental income, or significant interest. It is not an extra tax, just a different payment schedule.",
    example: "R120,000 of freelance income might mean two payments of roughly R10,800 each.",
  },
  {
    key: "medical_tax_credit",
    term: "Medical tax credit",
    official: "Medical Scheme Fees Tax Credit",
    plain:
      "A fixed monthly amount SARS subtracts from your tax bill if you belong to a registered medical scheme. It is a credit, not a deduction, so it comes straight off the tax you owe.",
    example: "Two members on a scheme: R364 × 2 × 12 = R8,736 off your annual tax.",
  },
  {
    key: "ra_deduction",
    term: "Retirement annuity deduction",
    official: "Section 11F Retirement Fund Deduction",
    plain:
      "Money you put into a pension, provident fund or retirement annuity reduces your taxable income. You may deduct up to 27.5% of your income, capped at R350,000 a year.",
    example: "R60,000 of RA contributions on a R500,000 income cuts your taxable income to R440,000.",
  },
  {
    key: "section_18a",
    term: "Section 18A",
    official: "Section 18A Donation Deduction",
    plain:
      "Donations to SARS-approved public benefit organisations are deductible up to 10% of your taxable income. You need a valid Section 18A certificate from the organisation to claim.",
    example: "On R500,000 taxable income you may claim up to R50,000 of qualifying donations.",
  },
  {
    key: "efiling",
    term: "eFiling",
    official: "SARS eFiling",
    plain:
      "SARS's free online portal at www.sarsefiling.co.za where you register, submit returns, view assessments and pay. Almost everything tax-related happens here.",
  },
  {
    key: "auto_assessment",
    term: "Auto-assessment",
    official: "SARS Auto-Assessment",
    plain:
      "SARS may complete your return for you using data from employers, banks and medical schemes. You get an SMS or email. Accept it if it is right, or edit it if deductions are missing.",
  },
  {
    key: "tax_directive",
    term: "Tax directive",
    official: "Tax Directive",
    plain:
      "An instruction from SARS telling a payer exactly how much tax to withhold from a specific payment, such as a retirement lump sum or a severance package.",
  },
  {
    key: "tax_rebate",
    term: "Tax rebate",
    official: "Section 6 Rebate",
    plain:
      "A fixed amount subtracted from your calculated tax. Everyone gets the primary rebate; people 65 and older get more. It is why low earners pay no tax at all.",
    example: "The 2025/26 primary rebate of R17,235 comes off every individual's tax bill.",
  },
  {
    key: "taxable_income",
    term: "Taxable income",
    official: "Taxable Income",
    plain:
      "What is left of your income after allowable deductions such as retirement contributions. SARS applies the tax tables to this figure, not your gross salary.",
  },
  {
    key: "tax_threshold",
    term: "Tax threshold",
    official: "Tax Threshold",
    plain:
      "The income level below which you pay no income tax, because the rebate wipes out your tax. It rises with age.",
    example: "Under 65 in 2025/26, you start paying tax at about R95,750 a year.",
  },
  {
    key: "effective_rate",
    term: "Effective tax rate",
    official: "Effective Tax Rate",
    plain:
      "Your total tax as a percentage of your total income — the honest, all-in number. It is always lower than your marginal rate.",
    example: "R78,000 tax on R480,000 income is an effective rate of 16.3%.",
  },
  {
    key: "marginal_rate",
    term: "Marginal tax rate",
    official: "Marginal Tax Rate",
    plain:
      "The rate applied to your next rand of income. It matters when deciding whether extra work or a raise is worth it after tax.",
    example: "At R400,000 taxable income your marginal rate is 31%, so R1,000 extra earns you R690.",
  },
  {
    key: "tax_year",
    term: "Tax year",
    official: "Year of Assessment",
    plain:
      "For individuals in South Africa the tax year runs from 1 March to the end of February — not January to December.",
  },
  {
    key: "sars",
    term: "SARS",
    official: "South African Revenue Service",
    plain:
      "The national tax authority. It collects income tax, VAT and customs duties, and runs eFiling.",
  },
  {
    key: "tax_practitioner",
    term: "Registered tax practitioner",
    official: "Registered Tax Practitioner",
    plain:
      "A person registered with SARS and a recognised controlling body who may complete and submit returns on your behalf. Loot is a planning tool, not a practitioner.",
  },
];

export const GLOSSARY_MAP: Record<string, GlossaryTerm> = Object.fromEntries(
  TAX_GLOSSARY.map((t) => [t.key, t]),
);
