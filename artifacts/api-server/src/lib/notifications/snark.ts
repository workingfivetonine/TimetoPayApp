// Playful copy helpers for the receipt-upload "you've gone quiet" nudge. The
// code-rendered email template owns the real layout; we only feed it a couple of
// pre-baked strings so the tone is consistent and a little cheeky without being
// mean. Personalization (a name + a specific neglected staple) is woven in when
// we have the data, with graceful generic fallbacks when we don't.

// Rotating pool of light, snarky one-liners. Deterministically rotated by a seed
// (day-of-year + user) so a given user doesn't get the same line every time but
// it's stable within a single send.
const SNARK_LINES = [
  "Your receipts are starting to feel ghosted.",
  "Long time no scan — the shopping list misses you.",
  "We haven't seen a receipt from you in a while. Everything okay in there?",
  "Your grocery history has gone suspiciously quiet.",
  "Did you quit groceries, or just quit scanning them?",
  "Your receipts called. They'd like to be tracked again.",
  "Plot twist: the receipts don't scan themselves.",
  "It's been a minute. Your spending insights are getting lonely.",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

// A stable-ish seed from a string (e.g. user id) so different users get
// different lines on the same day.
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface SnarkInput {
  userId: string;
  // Days since the user's most recent receipt (null if they've never scanned).
  daysSinceLastReceipt: number | null;
  // A recurring staple the user hasn't repurchased in a long time, if any.
  neglectedStaple?: { name: string; daysSince: number } | null;
  // Friendly display name (e.g. derived from the email local-part).
  displayName?: string | null;
}

export interface SnarkCopy {
  headline: string;
  // The personalized jab (or a generic nudge when we have no staple history).
  body: string;
  daysSinceLastReceipt: number | null;
}

// Build the snarky, optionally-personalized copy for the inactivity nudge.
export function buildReceiptSnark(input: SnarkInput): SnarkCopy {
  const seed = hashSeed(input.userId) + (input.daysSinceLastReceipt ?? 0);
  const headline = pick(SNARK_LINES, seed);
  const name = input.displayName?.trim();
  const greeting = name ? `${name}, ` : "";

  let body: string;
  if (input.neglectedStaple) {
    const { name: staple, daysSince } = input.neglectedStaple;
    body = `${greeting}it's been ${daysSince} days since you last bought ${staple}. Either you've stockpiled a lifetime supply or it's time for a grocery run (and a quick scan).`;
  } else if (input.daysSinceLastReceipt != null) {
    body = `${greeting}it's been ${input.daysSinceLastReceipt} days since your last receipt. Snap your next one so your spending stays on track.`;
  } else {
    body = `${greeting}you haven't scanned a receipt yet. Add your first one and we'll start tracking prices and building your shopping list.`;
  }

  return { headline, body, daysSinceLastReceipt: input.daysSinceLastReceipt };
}

// Derive a friendly display name from an email address (local part, cleaned up).
export function displayNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0];
  if (!local) return null;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;
  // Title-case the first token only — keep it casual.
  const first = cleaned.split(" ")[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}
