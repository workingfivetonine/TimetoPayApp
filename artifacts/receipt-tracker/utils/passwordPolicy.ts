/**
 * Shared client-side password complexity policy for the custom Clerk auth screens.
 *
 * Clerk enforces its own server-side minimums (length + breached-password check),
 * but the custom UI applies this stricter, user-visible checklist anywhere a
 * password is CREATED (sign-up + password reset) so weak passwords are caught
 * before they ever reach the server. This is intentionally NOT applied to the
 * normal sign-in form, where the user types an existing password.
 */

export interface PasswordRule {
  /** Short, user-facing requirement label. */
  label: string;
  /** Returns true when the given password satisfies this rule. */
  test: (password: string) => boolean;
}

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (pw) => pw.length >= PASSWORD_MIN_LENGTH,
  },
  { label: "An uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "A lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "A number", test: (pw) => /[0-9]/.test(pw) },
  { label: "A symbol (!@#$…)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export interface PasswordRuleStatus {
  label: string;
  met: boolean;
}

/** Per-rule met/unmet status, for rendering the live requirements checklist. */
export function evaluatePassword(password: string): PasswordRuleStatus[] {
  return PASSWORD_RULES.map((rule) => ({
    label: rule.label,
    met: rule.test(password),
  }));
}

/** True only when the password satisfies every rule. */
export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
