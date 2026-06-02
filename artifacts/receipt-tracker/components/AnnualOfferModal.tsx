import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useSegments } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getGetCurrentUserQueryKey,
  useCreateBillingCheckout,
  useDismissAnnualOffer,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

function openUrl(url: string): void {
  if (Platform.OS === "web") {
    window.location.assign(url);
  } else {
    void Linking.openURL(url);
  }
}

// Routes where the offer must NEVER appear — the public marketing pages, auth,
// and the onboarding/paywall flows. (Signed-in users are bounced off landing/auth
// anyway, but we gate explicitly to honor "never on the landing page".)
const SUPPRESSED_ROOTS = new Set([
  "landing",
  "pricing",
  "(auth)",
  "region-setup",
  "choose-plan",
  "paywall",
]);

// One-time 20%-off annual upsell shown to signed-in FREE web users AFTER their
// trial has ended. Eligibility (showAnnualOffer) is computed server-side in
// computeEntitlement; here we only render the modal, fire the annual checkout, or
// persist the dismissal (POST /billing/dismiss-annual-offer) so it never returns.
export function AnnualOfferModal() {
  const colors = useColors();
  const segments = useSegments();
  const queryClient = useQueryClient();
  const { data: me } = useGetCurrentUser();

  const [error, setError] = useState<string | null>(null);
  const checkout = useCreateBillingCheckout();
  const dismiss = useDismissAnnualOffer();

  // Web-only (native is never paywalled) and only when the server says so.
  const eligible = Platform.OS === "web" && (me?.entitlement?.showAnnualOffer ?? false);
  const suppressedHere = SUPPRESSED_ROOTS.has(segments[0] ?? "");
  const visible = eligible && !suppressedHere;

  const refreshMe = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
  };

  const handleClaim = () => {
    setError(null);
    checkout.mutate(
      { data: { provider: "stripe", plan: "annual" } },
      {
        onSuccess: async (res) => {
          // Claiming counts as resolving the offer so it doesn't reappear if they
          // abandon the Stripe page.
          await dismiss.mutateAsync().catch(() => {});
          openUrl(res.url);
        },
        onError: () => setError("We couldn't start checkout. Please try again."),
      },
    );
  };

  const handleDismiss = () => {
    setError(null);
    dismiss.mutate(undefined, {
      onSuccess: async () => {
        await refreshMe();
      },
      onError: () => setError("Something went wrong. Please try again."),
    });
  };

  const busy = checkout.isPending || dismiss.isPending;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Feather name="gift" size={26} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            Save 20% on your first year
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Go annual and get premium AI scanning, price history, and the catalog
            for 20% off the first year.
          </Text>

          <View style={styles.priceRow}>
            <Text style={[styles.strike, { color: colors.mutedForeground }]}>$71.88</Text>
            <Text style={[styles.price, { color: colors.foreground }]}>$57.50</Text>
            <Text style={[styles.priceUnit, { color: colors.mutedForeground }]}>first year</Text>
          </View>
          <Text style={[styles.renews, { color: colors.mutedForeground }]}>
            Renews at $71.88/yr. Cancel anytime.
          </Text>

          {error ? (
            <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.claimBtn, { backgroundColor: colors.primary }]}
            onPress={handleClaim}
            disabled={busy}
            activeOpacity={0.85}
          >
            {checkout.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.claimBtnText, { color: colors.primaryForeground }]}>
                Get 20% off
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.dismissBtn}
            disabled={busy}
            activeOpacity={0.7}
          >
            {dismiss.isPending ? (
              <ActivityIndicator color={colors.mutedForeground} />
            ) : (
              <Text style={[styles.dismissText, { color: colors.mutedForeground }]}>No thanks</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontSize: 21, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  strike: { fontSize: 16, fontFamily: "Inter_500Medium", textDecorationLine: "line-through" },
  price: { fontSize: 30, fontFamily: "Inter_700Bold" },
  priceUnit: { fontSize: 13, fontFamily: "Inter_500Medium" },
  renews: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 6 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  claimBtn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 6,
  },
  claimBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dismissBtn: { alignItems: "center", paddingVertical: 10, marginTop: 2 },
  dismissText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
