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
