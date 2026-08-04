// Shared fuzzy name-matching helpers. Used both by the admin catalog's
// duplicate-suggestion clustering and by scan ingestion, which matches a
// freshly-read line item against what the user has bought at that store before.
import { looseKey } from "./catalog";

// Order-independent key: lowercase, split on non-alphanumerics, sort tokens.
// Groups "corn & wheat tortillas" with "tortillas corn wheat".
export function tokenSortKey(name: string): string {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// 1 = identical, 0 = nothing in common.
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// The bar for treating two names as the same thing. Shared so scan matching and
// admin dedup stay consistent.
//
// Measured behaviour at 0.85 — it catches typos, punctuation/spacing differences,
// word reordering and plurals, but not abbreviations or brand synonyms:
//   "Whole Milk 2L"      vs "Whole Milk 2 L"      1.00  match
//   "Sourdough Bread"    vs "Sourdough Bred"      0.93  match
//   "Bananas"            vs "Banana"              0.86  match
//   "Chicken Breast 500g" vs "CHKN BRST 500G"     0.74  no match
//   "Apples"             vs "Apple Juice"         0.50  no match (correctly)
// Raising it loses the plural/typo cases; lowering it starts merging genuinely
// different products, so leave it here unless there's data to justify a move.
export const SIMILARITY_THRESHOLD = 0.85;

// Best match for `name` among `candidates`, or null if nothing clears the bar.
// Compares on both the loose key (typos / OCR garble) and the token-sort key
// (word reordering), taking whichever scores higher.
export function bestFuzzyMatch<T>(
  name: string,
  candidates: T[],
  nameOf: (candidate: T) => string,
  threshold = SIMILARITY_THRESHOLD,
): T | null {
  const targetLoose = looseKey(name);
  const targetTokens = tokenSortKey(name);
  if (!targetLoose && !targetTokens) return null;

  let best: T | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const candidateName = nameOf(candidate);
    const score = Math.max(
      similarity(targetLoose, looseKey(candidateName)),
      similarity(targetTokens, tokenSortKey(candidateName)),
    );
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= threshold ? best : null;
}
