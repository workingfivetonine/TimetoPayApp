// Measurement units for a line item's quantity. VISUAL ONLY — no conversion is
// ever done; this just records what the number means (2 "lb" vs 2 "each").
// Covers metric and US/imperial so it works across countries.
export interface UnitGroup {
  label: string;
  units: string[];
}

export const UNIT_GROUPS: UnitGroup[] = [
  { label: "Count", units: ["each", "pack", "dozen"] },
  { label: "Weight · metric", units: ["g", "kg"] },
  { label: "Weight · US/imperial", units: ["oz", "lb"] },
  { label: "Volume · metric", units: ["ml", "L"] },
  { label: "Volume · US/imperial", units: ["fl oz", "cup", "pt", "qt", "gal"] },
];

export const ALL_UNITS: string[] = UNIT_GROUPS.flatMap((g) => g.units);

// A short label for showing quantity + unit, e.g. "2.5 lb", "500 g", "3".
// "each" (or no unit) shows just the number.
export function formatQuantity(quantity: number, unit?: string | null): string {
  const n = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  if (!unit || unit === "each") return n;
  return `${n} ${unit}`;
}
