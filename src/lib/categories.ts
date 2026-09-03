/**
 * Single source of truth for every spending / saving category in Budge.
 * Nothing else in the app may hardcode a category key, label or colour.
 */

export type CategoryGroup =
  | "Essential"
  | "Daily Living"
  | "Lifestyle"
  | "Family & Social"
  | "Saving & Growing"
  | "Travel"
  | "Other";

export const GROUP_ORDER: CategoryGroup[] = [
  "Essential",
  "Daily Living",
  "Lifestyle",
  "Family & Social",
  "Saving & Growing",
  "Travel",
  "Other",
];

export type CategoryDef = {
  key: string;
  label: string;
  group: CategoryGroup;
  icon: string; // lucide-react component name
  color: string;
  positive: boolean;
};

export const CATEGORY_DEFS = [
  // Essential
  { key: "housing", label: "Housing", group: "Essential", icon: "Home", color: "#6B7FA3", positive: false },
  { key: "transport", label: "Transport", group: "Essential", icon: "Car", color: "#7A8FA6", positive: false },
  { key: "vehicle_finance", label: "Vehicle Finance", group: "Essential", icon: "CreditCard", color: "#8A9AB8", positive: false },
  { key: "insurance", label: "Insurance", group: "Essential", icon: "Shield", color: "#9BA8C0", positive: false },
  { key: "medical_aid", label: "Medical Aid", group: "Essential", icon: "Heart", color: "#A8B4C8", positive: false },
  { key: "debt_repayments", label: "Debt Repayments", group: "Essential", icon: "Landmark", color: "#B85C5C", positive: false },

  // Daily Living
  { key: "groceries", label: "Groceries", group: "Daily Living", icon: "ShoppingCart", color: "#C4956A", positive: false },
  { key: "eating_out", label: "Eating Out", group: "Daily Living", icon: "UtensilsCrossed", color: "#D4A574", positive: false },
  { key: "coffee_drinks", label: "Coffee & Drinks", group: "Daily Living", icon: "Coffee", color: "#BF8D5E", positive: false },
  { key: "household", label: "Household", group: "Daily Living", icon: "Package", color: "#C9A882", positive: false },

  // Lifestyle
  { key: "clothing_shopping", label: "Clothing & Shopping", group: "Lifestyle", icon: "ShoppingBag", color: "#9B7EC8", positive: false },
  { key: "health_beauty", label: "Health & Beauty", group: "Lifestyle", icon: "Sparkles", color: "#B28FD8", positive: false },
  { key: "subscriptions", label: "Subscriptions", group: "Lifestyle", icon: "Repeat", color: "#7E6BB5", positive: false },
  { key: "entertainment", label: "Entertainment", group: "Lifestyle", icon: "Clapperboard", color: "#8B72C2", positive: false },
  { key: "tech_gadgets", label: "Tech & Gadgets", group: "Lifestyle", icon: "Laptop", color: "#7560A8", positive: false },
  { key: "phone_airtime", label: "Phone & Airtime", group: "Lifestyle", icon: "Phone", color: "#6B50A0", positive: false },

  // Family & Social
  { key: "giving_charity", label: "Giving & Charity", group: "Family & Social", icon: "Gift", color: "#D4829B", positive: false },
  { key: "education", label: "Education", group: "Family & Social", icon: "GraduationCap", color: "#C87090", positive: false },
  { key: "childcare", label: "Childcare", group: "Family & Social", icon: "Baby", color: "#E090A8", positive: false },
  { key: "pets", label: "Pets", group: "Family & Social", icon: "PawPrint", color: "#C88070", positive: false },

  // Saving & Growing
  { key: "savings", label: "Savings", group: "Saving & Growing", icon: "PiggyBank", color: "hsl(142 45% 62%)", positive: true },
  { key: "investments", label: "Investments", group: "Saving & Growing", icon: "TrendingUp", color: "hsl(142 45% 52%)", positive: true },
  { key: "side_business", label: "Side Business", group: "Saving & Growing", icon: "Briefcase", color: "hsl(142 35% 55%)", positive: true },

  // Travel
  { key: "travel_holidays", label: "Travel & Holidays", group: "Travel", icon: "Plane", color: "#6AAED4", positive: false },

  // Other
  { key: "government_admin", label: "Government & Admin", group: "Other", icon: "FileText", color: "#8A8A8A", positive: false },
  { key: "other", label: "Other", group: "Other", icon: "MoreHorizontal", color: "#6B6B6B", positive: false },
] as const satisfies readonly CategoryDef[];

export type ExpenseCategory = (typeof CATEGORY_DEFS)[number]["key"];

export const CATEGORY_KEYS = CATEGORY_DEFS.map((c) => c.key) as ExpenseCategory[];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORY_DEFS.map((c) => [c.key, c]),
) as Record<ExpenseCategory, CategoryDef>;

export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_DEFS.map((c) => [c.key, c.label]),
) as Record<ExpenseCategory, string>;

export const CATEGORY_COLORS = Object.fromEntries(
  CATEGORY_DEFS.map((c) => [c.key, c.color]),
) as Record<ExpenseCategory, string>;

export const GROUPED_CATEGORIES: { group: CategoryGroup; items: CategoryDef[] }[] =
  GROUP_ORDER.map((group) => ({
    group,
    items: CATEGORY_DEFS.filter((c) => c.group === group) as unknown as CategoryDef[],
  })).filter((g) => g.items.length > 0);

export const POSITIVE_CATEGORIES = CATEGORY_KEYS.filter((k) => CATEGORY_MAP[k].positive);

export function isPositiveCategory(key: string): boolean {
  return CATEGORY_MAP[key as ExpenseCategory]?.positive ?? false;
}

export function categoryLabel(key: string): string {
  return CATEGORY_MAP[key as ExpenseCategory]?.label ?? "Other";
}

export function categoryColor(key: string): string {
  return CATEGORY_MAP[key as ExpenseCategory]?.color ?? CATEGORY_MAP.other.color;
}

/** Empty per-category totals map. */
export function emptyCategoryTotals(): Record<ExpenseCategory, number> {
  return Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])) as Record<ExpenseCategory, number>;
}

/** Normalise any stored/legacy value onto a current key. */
const LEGACY: Record<string, ExpenseCategory> = {
  housing_rent: "housing",
  transport_fuel: "transport",
  medical_insurance: "medical_aid",
  debt: "debt_repayments",
  food: "eating_out",
};

export function normalizeCategory(value: string | null | undefined): ExpenseCategory {
  if (!value) return "other";
  if (value in CATEGORY_MAP) return value as ExpenseCategory;
  return LEGACY[value] ?? "other";
}

/* ------------------------------------------------------------------ */
/* Merchant matching rules — used by the Statement Analysis parser.     */
/* Case-insensitive partial matching against transaction descriptions.  */
/* ------------------------------------------------------------------ */

export const MERCHANT_RULES: Partial<Record<ExpenseCategory, string[]>> = {
  housing: ["RENT", "RENTAL", "BOND", "ELECTRICITY", "ESKOM", "CITY POWER", "CITIQ", "PREPAID ELEC", "WATER", "MUNICIPAL", "RATES", "BODY CORP", "LEVY", "WIFI", "FIBRE", "OPENSERVE", "VUMATEL", "FROGFOOT"],
  transport: ["FUEL", "PETROL", "ENGEN", "SHELL", "BP", "SASOL", "CALTEX", "ASTRON", "TOTAL GAS", "TOLLS", "E-TOLL", "SANRAL", "UBER", "BOLT", "TAXI", "PARKING", "GAUTRAIN"],
  vehicle_finance: ["WFS", "WESBANK", "ABSA VEHICLE", "MFC", "RMB FINANCE", "STANDARD BANK VEHICLE", "NEDBANK VEHICLE", "MOTOR FINANCE", "AUTO FINANCE", "VEHICLE LOAN"],
  insurance: ["SANLAM", "OLD MUTUAL LIFE", "MOMENTUM LIFE", "OUTSURANCE", "HOLLARD", "MIWAY", "KING PRICE", "BUDGET INSURANCE", "DIAL DIRECT", "SANTAM", "LIBERTY LIFE", "ASSUPOL", "PPS", "CLIENTELE"],
  medical_aid: ["DISCOVERY HEALTH", "BONITAS", "MEDIHELP", "MOMENTUM HEALTH", "GEMS", "BESTMED", "FEDHEALTH", "CAMAF", "PROFMED", "RESOLUTION HEALTH"],
  debt_repayments: ["PERSONAL LOAN", "CREDIT CARD PMT", "STORE ACCOUNT", "AFRICAN BANK", "CAPITEC LOAN", "FNB LOAN", "ABSA LOAN", "STANDARD BANK LOAN", "NEDBANK LOAN", "BAYPORT", "WONGA", "LETSATSI"],
  groceries: ["CHECKERS", "SHOPRITE", "PICK N PAY", "PNP", "WOOLWORTHS FOOD", "FOOD LOVER", "SPAR", "MAKRO", "GAME FOOD", "BOXER", "USAVE", "OK FOODS", "CAMBRIDGE FOOD"],
  eating_out: ["KFC", "MCDONALD", "NANDOS", "DEBONAIRS", "PIZZA", "STEERS", "BURGER KING", "SUBWAY", "FISHAWAYS", "CHICKEN LICKEN", "ROMAN'S", "OCEAN BASKET", "WIMPY", "MUGG AND BEAN", "TASHAS", "KAUAI", "GALITO", "PANAROTTIS"],
  coffee_drinks: ["STARBUCKS", "SEATTLE COFFEE", "VIDA E", "BOOTLEGGER", "TRUTH COFFEE", "DELUXE", "PAUL CAFE", "HARRIS"],
  household: ["BUILDERS", "LEROY MERLIN", "CHAMBERLAINS", "PLASTICS FOR AFRICA", "HIRSCH", "GAME HARDWARE", "MR PRICE HOME", "@HOME", "WOOLWORTHS HOME", "CLEANING", "LAUNDRY", "PEST CONTROL"],
  clothing_shopping: ["ZARA", "H&M", "EDGARS", "MR PRICE", "FOSCHINI", "LEGIT", "IDENTITY", "RELAY", "TRUWORTHS", "WOOLWORTHS CLOTHING", "COTTON ON", "SUPERBALIST", "TAKEALOT", "BASH", "THE FIX", "ACKERMANS", "PUMA", "ADIDAS", "NIKE"],
  health_beauty: ["CLICKS", "DISCHEM", "PHARMACY", "VIRGIN ACTIVE", "PLANET FITNESS", "ANYTIME FITNESS", "CURVES", "SALON", "HAIRDRESSER", "SPA", "NAIL", "SKIN RENEWAL", "DERMALOGICA"],
  subscriptions: ["NETFLIX", "SPOTIFY", "SHOWMAX", "DSTV", "APPLE", "GOOGLE PLAY", "MICROSOFT", "AMAZON PRIME", "YOUTUBE", "DISCORD", "DROPBOX", "ADOBE", "CANVA", "CHATGPT", "OPENAI"],
  entertainment: ["NU METRO", "STER KINEKOR", "COMPUTICKET", "TICKETMASTER", "TICKETPRO", "STEAM", "PLAYSTATION", "XBOX", "APPLE ARCADE", "ROBLOX"],
  tech_gadgets: ["APPLE STORE", "ISTORE", "INCREDIBLE CONNECT", "HI-FI CORP", "WOOTWARE", "EVETECH", "SAMSUNG", "TAKEALOT TECH", "DION WIRED"],
  phone_airtime: ["VODACOM", "MTN", "CELL C", "TELKOM", "RAIN", "AIRTIME", "RECHARGE", "PREPAID DATA", "ROUTER"],
  giving_charity: ["GIFT", "DONATION", "CHARITY", "NSPCA", "GIFT VOUCHER"],
  education: ["SCHOOL FEES", "TUITION", "VARSITY", "UNIVERSITY", "COLLEGE", "UDEMY", "COURSERA", "BOOKS", "STATIONERY", "CAMPUS"],
  childcare: ["DAYCARE", "CRÈCHE", "CRECHE", "BABYSIT", "AFTERCARE", "SCHOOL ACTIVITIES", "MONTESSORI"],
  pets: ["VET", "PETVET", "ANIMAL HOSPITAL", "PET FOOD", "PETSHOP", "PEDIGREE", "DOGMOTHER", "KENNEL", "GROOMING"],
  savings: ["SAVINGS ACCOUNT", "EMERGENCY FUND", "32 DAY NOTICE", "MONEY MARKET", "FIXED DEPOSIT", "SAVINGS TRANSFER"],
  investments: ["EASY EQUITIES", "SYGNIA", "ETFSA", "10X INVESTMENTS", "OLD MUTUAL INVEST", "TAX FREE SAVINGS", "UNIT TRUST", "ETF", "RETIREMENT ANNUITY", "RA PREMIUM", "STANLIB", "CORONATION", "ALLAN GRAY", "NINETY ONE"],
  side_business: ["INVOICE", "BUSINESS EXPENSE", "FREELANCE", "SUPPLIER", "BUSINESS ACCOUNT", "WORKSHOP"],
  travel_holidays: ["FLIGHT", "AIRBNB", "BOOKING.COM", "AGODA", "HOTELS.COM", "SAFARI", "KULULA", "FLYSAFAIR", "COMAIR", "SOUTH AFRICAN AIRWAYS", "SAA", "MANGO", "AIRPORT", "LUGGAGE", "PASSPORT"],
  government_admin: ["TRAFFIC FINE", "LICENCE DISC", "NATIS", "HOME AFFAIRS", "SARS", "TAX PAYMENT", "ID RENEWAL", "MUNICIPALITY FINE"],
};

/** Rule order matters: more specific groups are checked before broad ones. */
const RULE_ORDER: ExpenseCategory[] = [
  "medical_aid", "insurance", "vehicle_finance", "debt_repayments", "investments", "savings",
  "groceries", "eating_out", "coffee_drinks", "subscriptions", "entertainment", "tech_gadgets",
  "phone_airtime", "health_beauty", "clothing_shopping", "household", "travel_holidays",
  "education", "childcare", "pets", "giving_charity", "government_admin", "side_business",
  "transport", "housing",
];

/**
 * Match a transaction description onto a category.
 * Returns null when nothing matched (caller treats it as `other` / unclassified).
 */
export function matchCategory(description: string): ExpenseCategory | null {
  const d = (description || "").toUpperCase();
  if (!d.trim()) return null;
  for (const key of RULE_ORDER) {
    const rules = MERCHANT_RULES[key];
    if (!rules) continue;
    for (const r of rules) if (d.includes(r.toUpperCase())) return key;
  }
  return null;
}
