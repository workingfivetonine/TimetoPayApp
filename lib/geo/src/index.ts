// Shared geography reference data used to scope the cross-user catalog by
// region. Users and stores carry a country (ISO-3166 alpha-2) and, for the US
// only, a state (USPS 2-letter). Keep this the single source of truth for both
// the API server (validation + filtering) and the mobile client (pickers).

export interface Country {
  code: string; // ISO-3166 alpha-2, uppercase
  name: string;
}

export interface UsState {
  code: string; // USPS 2-letter, uppercase
  name: string;
}

// The only country that is additionally scoped by state.
export const STATE_SCOPED_COUNTRY = "US";

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "PE", name: "Peru" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "VN", name: "Vietnam" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IL", name: "Israel" },
  { code: "TR", name: "Turkey" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "EG", name: "Egypt" },
];

export const US_STATES: UsState[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));
const US_STATE_CODES = new Set(US_STATES.map((s) => s.code));
const COUNTRY_NAME_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));
const US_STATE_NAME_BY_CODE = new Map(US_STATES.map((s) => [s.code, s.name]));

// Normalize an arbitrary client/AI-provided code to the uppercase 2-letter form
// (or null if it isn't a plausible 2-letter code). Does NOT validate membership.
export function normalizeRegionCode(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

export function isValidCountry(code: string | null | undefined): boolean {
  const norm = normalizeRegionCode(code);
  return norm !== null && COUNTRY_CODES.has(norm);
}

export function isValidUsState(code: string | null | undefined): boolean {
  const norm = normalizeRegionCode(code);
  return norm !== null && US_STATE_CODES.has(norm);
}

export function isStateScoped(countryCode: string | null | undefined): boolean {
  return normalizeRegionCode(countryCode) === STATE_SCOPED_COUNTRY;
}

export function countryName(code: string | null | undefined): string | null {
  const norm = normalizeRegionCode(code);
  return norm ? COUNTRY_NAME_BY_CODE.get(norm) ?? null : null;
}

export function usStateName(code: string | null | undefined): string | null {
  const norm = normalizeRegionCode(code);
  return norm ? US_STATE_NAME_BY_CODE.get(norm) ?? null : null;
}

// ── Currency (VISUAL ONLY) ───────────────────────────────────────────────────
// We do NOT convert money. Receipt prices are stored and shown as-entered; this
// just picks the right symbol to display based on a country so a UK user sees
// "£3.50" instead of "$3.50". Unknown/missing country falls back to USD.
export interface CurrencyInfo {
  code: string; // ISO-4217
  symbol: string; // display symbol
  decimals: number; // typical minor-unit digits (0 for yen-like currencies)
}

export const DEFAULT_CURRENCY: CurrencyInfo = { code: "USD", symbol: "$", decimals: 2 };

const EUR: CurrencyInfo = { code: "EUR", symbol: "€", decimals: 2 };
const KR: CurrencyInfo["symbol"] = "kr";

const CURRENCY_BY_COUNTRY: Record<string, CurrencyInfo> = {
  US: DEFAULT_CURRENCY,
  CA: { code: "CAD", symbol: "$", decimals: 2 },
  GB: { code: "GBP", symbol: "£", decimals: 2 },
  AU: { code: "AUD", symbol: "$", decimals: 2 },
  NZ: { code: "NZD", symbol: "$", decimals: 2 },
  // Eurozone
  IE: EUR, AT: EUR, BE: EUR, HR: EUR, CY: EUR, EE: EUR, FI: EUR, FR: EUR,
  DE: EUR, GR: EUR, IT: EUR, LV: EUR, LT: EUR, LU: EUR, MT: EUR, NL: EUR,
  PT: EUR, SK: EUR, SI: EUR, ES: EUR,
  // Other Europe
  BG: { code: "BGN", symbol: "лв", decimals: 2 },
  CZ: { code: "CZK", symbol: "Kč", decimals: 2 },
  DK: { code: "DKK", symbol: KR, decimals: 2 },
  HU: { code: "HUF", symbol: "Ft", decimals: 0 },
  IS: { code: "ISK", symbol: KR, decimals: 0 },
  NO: { code: "NOK", symbol: KR, decimals: 2 },
  PL: { code: "PLN", symbol: "zł", decimals: 2 },
  RO: { code: "RON", symbol: "lei", decimals: 2 },
  SE: { code: "SEK", symbol: KR, decimals: 2 },
  CH: { code: "CHF", symbol: "CHF", decimals: 2 },
  TR: { code: "TRY", symbol: "₺", decimals: 2 },
  // Americas
  MX: { code: "MXN", symbol: "$", decimals: 2 },
  BR: { code: "BRL", symbol: "R$", decimals: 2 },
  AR: { code: "ARS", symbol: "$", decimals: 2 },
  CL: { code: "CLP", symbol: "$", decimals: 0 },
  CO: { code: "COP", symbol: "$", decimals: 0 },
  PE: { code: "PEN", symbol: "S/", decimals: 2 },
  // Asia-Pacific
  JP: { code: "JPY", symbol: "¥", decimals: 0 },
  KR: { code: "KRW", symbol: "₩", decimals: 0 },
  CN: { code: "CNY", symbol: "¥", decimals: 2 },
  HK: { code: "HKD", symbol: "$", decimals: 2 },
  TW: { code: "TWD", symbol: "NT$", decimals: 2 },
  SG: { code: "SGD", symbol: "$", decimals: 2 },
  MY: { code: "MYR", symbol: "RM", decimals: 2 },
  TH: { code: "THB", symbol: "฿", decimals: 2 },
  PH: { code: "PHP", symbol: "₱", decimals: 2 },
  ID: { code: "IDR", symbol: "Rp", decimals: 0 },
  VN: { code: "VND", symbol: "₫", decimals: 0 },
  IN: { code: "INR", symbol: "₹", decimals: 2 },
  PK: { code: "PKR", symbol: "₨", decimals: 2 },
  BD: { code: "BDT", symbol: "৳", decimals: 2 },
  // Middle East & Africa
  AE: { code: "AED", symbol: "د.إ", decimals: 2 },
  SA: { code: "SAR", symbol: "﷼", decimals: 2 },
  IL: { code: "ILS", symbol: "₪", decimals: 2 },
  ZA: { code: "ZAR", symbol: "R", decimals: 2 },
  NG: { code: "NGN", symbol: "₦", decimals: 2 },
  KE: { code: "KES", symbol: "KSh", decimals: 2 },
  EG: { code: "EGP", symbol: "E£", decimals: 2 },
};

// The visual currency for a country (defaults to USD when unknown/missing).
export function currencyForCountry(code: string | null | undefined): CurrencyInfo {
  const norm = normalizeRegionCode(code);
  return (norm && CURRENCY_BY_COUNTRY[norm]) || DEFAULT_CURRENCY;
}

// Format a numeric amount with the given country's symbol. Visual only — the
// number is shown as-is, never converted. Pass `cents`-style numbers as their
// decimal value (e.g. 3.5 → "$3.50"). Null/NaN renders as an em dash.
export function formatPrice(
  amount: number | string | null | undefined,
  countryCode: string | null | undefined,
): string {
  const cur = currencyForCountry(countryCode);
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (n == null || Number.isNaN(n)) return "—";
  return `${cur.symbol}${n.toFixed(cur.decimals)}`;
}

// Validate a (countryCode, stateCode) pair as a complete user/store region.
// Country must be known. For the US a valid state is REQUIRED; for every other
// country a state must NOT be provided (it's meaningless there). Returns the
// normalized pair on success, or an error string on failure.
export type RegionValidation =
  | { ok: true; countryCode: string; stateCode: string | null }
  | { ok: false; error: string };

export function validateRegion(
  countryCodeIn: string | null | undefined,
  stateCodeIn: string | null | undefined,
): RegionValidation {
  const countryCode = normalizeRegionCode(countryCodeIn);
  if (!countryCode || !COUNTRY_CODES.has(countryCode)) {
    return { ok: false, error: "Invalid or unsupported countryCode" };
  }
  const stateCode = normalizeRegionCode(stateCodeIn);
  if (isStateScoped(countryCode)) {
    if (!stateCode || !US_STATE_CODES.has(stateCode)) {
      return { ok: false, error: "A valid US stateCode is required" };
    }
    return { ok: true, countryCode, stateCode };
  }
  // Non-US: ignore any provided state (don't persist a meaningless value).
  return { ok: true, countryCode, stateCode: null };
}
