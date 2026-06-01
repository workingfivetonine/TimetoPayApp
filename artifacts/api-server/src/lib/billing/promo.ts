import { createHash, timingSafeEqual } from "node:crypto";

// Complimentary / promo access (the "secret override" for free full access).
//
// Two deployer-controlled, secret-env-driven mechanisms:
//   PROMO_CODES        — comma-separated list of valid promo codes. A logged-in
//                        user redeems one via POST /billing/redeem, which sets
//                        the persistent `compAccess` flag on their row.
//   COMP_ACCESS_EMAILS — comma-separated email allowlist that is always granted
//                        free access (checked live in computeEntitlement).
//
// Codes should be high-entropy (treat them like secrets) since any authenticated
// user could otherwise attempt to guess them.

function parseList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

// Constant-time membership check so timing doesn't leak how close a guess was.
export function isValidPromoCode(code: string): boolean {
  const candidate = sha256(code.trim());
  let matched = false;
  for (const valid of parseList("PROMO_CODES")) {
    const known = sha256(valid);
    if (known.length === candidate.length && timingSafeEqual(known, candidate)) {
      matched = true;
    }
  }
  return matched;
}

export function isCompEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  return parseList("COMP_ACCESS_EMAILS").some(
    (e) => e.toLowerCase() === target,
  );
}
