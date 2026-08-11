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

// Floor for OFFERING a name as a suggestion the user must confirm. Below
// SIMILARITY_THRESHOLD because the two answer different questions: the
// threshold is "safe to merge silently", this is "worth asking about".
//
// The band between them is the abbreviation case the auto-merge deliberately
// refuses to touch, which would otherwise silently mint a duplicate item:
//   "Greek Yogurt"        vs "GRK YOGURT"      0.83  suggest
//   "Whole Milk 2L"       vs "WHL MLK 2L"      0.77  suggest
//   "Chicken Breast 500g" vs "CHKN BRST 500G"  0.74  suggest
//   "Sourdough Bread"     vs "SRDGH BRD"       0.60  suggest (boundary)
//
// Measured at 0.6 rather than lower because the next band down is mostly
// genuinely different products — "Chicken Breast" vs "Chicken Thighs" scores
// 0.54 and "Apples" vs "Apple Juice" 0.50, and offering those trains people to
// dismiss the prompt without reading it. One known false positive survives
// ("Tomatoes" vs "Tomato Paste", 0.64); that is acceptable for a suggestion the
// user must accept, and would NOT be acceptable for an automatic merge.
//
// Heavy synonyms stay out of reach by design: "Coke" vs "Coca Cola" scores 0.25
// and "OJ" vs "Orange Juice" 0.18. Catching those needs meaning, not spelling.
export const SUGGESTION_THRESHOLD = 0.6;

// Like bestFuzzyMatch but returns the score alongside the candidate and applies
// no threshold, so callers can band the result themselves.
export function bestFuzzyMatchScored<T>(
  name: string,
  candidates: T[],
  nameOf: (candidate: T) => string,
): { candidate: T; score: number } | null {
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
  return best === null ? null : { candidate: best, score: bestScore };
}

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
