import { Platform } from "react-native";
import { useGetCurrentUser } from "@workspace/api-client-react";

// Freemium gate (client side). Returns true when the current viewer should see
// premium features locked behind an upsell:
//   - WEB only — native (iOS/Android) is never paywalled, so it's always free.
//   - The user is signed in, /me has loaded, and their entitlement says they are
//     NOT entitled (lapsed trial, no subscription, not comped/admin).
// While /me is still loading (entitlement == null) we default to UNLOCKED so we
// never flash an upsell over a paying/trial user mid-load.
export function usePremiumLock(): boolean {
  const { data: me } = useGetCurrentUser();
  if (Platform.OS !== "web") return false;
  if (!me?.entitlement) return false;
  return !me.entitlement.entitled;
}
