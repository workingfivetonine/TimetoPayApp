import type { usersTable } from "@workspace/db";

type UserRow = typeof usersTable.$inferSelect;

// Shared shape for the OpenAPI `CurrentUser` response, used by every /me handler
// so the payload is always identical.
//
// Previously lived in lib/billing/entitlement.ts alongside the paid-tier logic and
// carried an `entitlement` object. The app is free, so there is nothing to be
// entitled to and no plan to choose — both fields are gone rather than reported
// as permanently unlocked.
export function formatCurrentUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    role: user.role,
    countryCode: user.countryCode,
    stateCode: user.stateCode,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    // Optional home address + whether it was successfully geocoded (has coords),
    // so the account screen can prefill the field and confirm distance is active.
    address: user.address ?? null,
    hasLocation: user.latitude != null && user.longitude != null,
    // Account creation time — used for "spend since [join date]" in analytics.
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,
  };
}
