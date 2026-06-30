export type Currency = {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  /** Locale used for Intl.NumberFormat to get conventions right. */
  locale: string;
};

export const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", locale: "en-US" },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺", locale: "de-DE" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧", locale: "en-GB" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵", locale: "ja-JP" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳", locale: "zh-CN" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳", locale: "en-IN" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$", flag: "🇨🇦", locale: "en-CA" },
  { code: "AUD", name: "Australian Dollar", symbol: "$", flag: "🇦🇺", locale: "en-AU" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "$", flag: "🇳🇿", locale: "en-NZ" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr.", flag: "🇨🇭", locale: "de-CH" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", flag: "🇸🇪", locale: "sv-SE" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", flag: "🇳🇴", locale: "nb-NO" },
  { code: "DKK", name: "Danish Krone", symbol: "kr", flag: "🇩🇰", locale: "da-DK" },
  { code: "ISK", name: "Icelandic Króna", symbol: "kr", flag: "🇮🇸", locale: "is-IS" },
  { code: "PLN", name: "Polish Złoty", symbol: "zł", flag: "🇵🇱", locale: "pl-PL" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", flag: "🇨🇿", locale: "cs-CZ" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", flag: "🇭🇺", locale: "hu-HU" },
  { code: "RON", name: "Romanian Leu", symbol: "lei", flag: "🇷🇴", locale: "ro-RO" },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв", flag: "🇧🇬", locale: "bg-BG" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", flag: "🇹🇷", locale: "tr-TR" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", flag: "🇷🇺", locale: "ru-RU" },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴", flag: "🇺🇦", locale: "uk-UA" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪", flag: "🇮🇱", locale: "he-IL" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", flag: "🇦🇪", locale: "ar-AE" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", flag: "🇸🇦", locale: "ar-SA" },
  { code: "QAR", name: "Qatari Riyal", symbol: "﷼", flag: "🇶🇦", locale: "ar-QA" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك", flag: "🇰🇼", locale: "ar-KW" },
  { code: "EGP", name: "Egyptian Pound", symbol: "ج.م", flag: "🇪🇬", locale: "ar-EG" },
  { code: "ZAR", name: "South African Rand", symbol: "R", flag: "🇿🇦", locale: "en-ZA" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", flag: "🇳🇬", locale: "en-NG" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", flag: "🇰🇪", locale: "en-KE" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", flag: "🇬🇭", locale: "en-GH" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "د.م.", flag: "🇲🇦", locale: "ar-MA" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷", locale: "pt-BR" },
  { code: "MXN", name: "Mexican Peso", symbol: "$", flag: "🇲🇽", locale: "es-MX" },
  { code: "ARS", name: "Argentine Peso", symbol: "$", flag: "🇦🇷", locale: "es-AR" },
  { code: "CLP", name: "Chilean Peso", symbol: "$", flag: "🇨🇱", locale: "es-CL" },
  { code: "COP", name: "Colombian Peso", symbol: "$", flag: "🇨🇴", locale: "es-CO" },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/", flag: "🇵🇪", locale: "es-PE" },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$U", flag: "🇺🇾", locale: "es-UY" },
  { code: "SGD", name: "Singapore Dollar", symbol: "$", flag: "🇸🇬", locale: "en-SG" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "$", flag: "🇭🇰", locale: "en-HK" },
  { code: "TWD", name: "Taiwan Dollar", symbol: "$", flag: "🇹🇼", locale: "zh-TW" },
  { code: "KRW", name: "South Korean Won", symbol: "₩", flag: "🇰🇷", locale: "ko-KR" },
  { code: "THB", name: "Thai Baht", symbol: "฿", flag: "🇹🇭", locale: "th-TH" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", flag: "🇻🇳", locale: "vi-VN" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", flag: "🇮🇩", locale: "id-ID" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", flag: "🇲🇾", locale: "ms-MY" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", flag: "🇵🇭", locale: "en-PH" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", flag: "🇵🇰", locale: "en-PK" },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", flag: "🇧🇩", locale: "bn-BD" },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", flag: "🇱🇰", locale: "en-LK" },
  { code: "NPR", name: "Nepalese Rupee", symbol: "₨", flag: "🇳🇵", locale: "ne-NP" },
];

export const CURRENCY_MAP: Record<string, Currency> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c]),
);

export function getCurrency(code: string | null | undefined): Currency {
  if (!code) return CURRENCY_MAP.USD;
  return CURRENCY_MAP[code] ?? CURRENCY_MAP.USD;
}
