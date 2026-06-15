// Signed one-click unsubscribe tokens for reminder emails.
//
// The unsubscribe link in every promotional email carries the user id plus an
// HMAC so the public endpoint can flip the recipient's notification flags without
// a login. The secret is server-side only; the token reveals nothing and can't be
// forged without it.
import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    "dev-unsubscribe-secret"
  );
}

function apiBase(): string {
  return (process.env.PUBLIC_API_BASE_URL || "https://api.5to9shopping.com").replace(
    /\/+$/,
    "",
  );
}

export function signUnsubToken(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex");
}

export function verifyUnsubToken(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  const expected = signUnsubToken(userId);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Public unsubscribe URL embedded in reminder emails (footer link + the
// List-Unsubscribe header). Resolves to the public endpoint on the API server.
export function buildUnsubscribeUrl(userId: string): string {
  const token = signUnsubToken(userId);
  return `${apiBase()}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;
}
