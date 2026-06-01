// Trusted master-admin bootstrap configuration.
//
// Admin authority must come from a trusted source the deployer controls, NOT
// from ordinary public sign-up activity. The trust anchor is the
// `ADMIN_BOOTSTRAP_EMAILS` environment variable: a comma-separated allowlist of
// email addresses that are permitted to be promoted to master admin (only when
// no admin exists yet — the single-admin invariant still holds).
//
// Secure default: if the variable is unset/empty, NO user can be auto-promoted,
// so a fresh deployment simply stays admin-less until the deployer configures
// the allowlist. This removes the "first public sign-up becomes admin" and
// "earliest user silently regains admin" privilege-escalation paths.

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function getBootstrapAdminEmails(): Set<string> {
  const raw = process.env["ADMIN_BOOTSTRAP_EMAILS"];
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => normalizeEmail(entry))
      .filter((entry): entry is string => entry !== null),
  );
}

export function isBootstrapAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getBootstrapAdminEmails().has(normalized);
}
