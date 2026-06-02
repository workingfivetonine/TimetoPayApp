import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetCurrentUserQueryKey,
  useCreateBillingCheckout,
  useGetCurrentUser,
  useMarkPlanSelected,
  useStartFreeTrial,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Provider = "stripe" | "paypal";

function openUrl(url: string): void {
  if (Platform.OS === "web") {
    window.location.assign(url);
  } else {
    void Linking.openURL(url);
  }
}

// One-time post-signup onboarding step. After picking a region, a brand-new user
// is routed here to choose how they want to start: Subscribe, start the free
// trial, or continue on the free plan. Any of the three actions stamps
// planSelectedAt (POST /billing/plan-selected) so this screen is never shown
// again. Mirrors the paywall content but adds the explicit "free account" path.
export default function ChoosePlanScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: me } = useGetCurrentUser();

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);

  const checkout = useCreateBillingCheckout();
  const startTrial = useStartFreeTrial();
  const markPlanSelected = useMarkPlanSelected();

  const canStartTrial = me?.entitlement?.canStartTrial ?? false;

  const refreshMe = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
  };

  // Stamp the onboarding choice. Resolves to true on success so callers can wait
  // before navigating; on failure we still proceed (the redirect guard would
  // just bring them back, and the action itself — trial/checkout — already ran).
  const recordSelection = async (): Promise<void> => {
    try {
      await markPlanSelected.mutateAsync();
    } catch {
      // non-fatal; entitlement/region guards handle the rest
    }
  };

  const handleStartTrial = () => {
    setError(null);
    startTrial.mutate(undefined, {
      onSuccess: async () => {
        await recordSelection();
        await refreshMe();
        router.replace("/");
      },
      onError: () => setError("We couldn't start your free trial. Please try again."),
    });
  };

  const handleContinueFree = async () => {
    setError(null);
    await recordSelection();
    await refreshMe();
    router.replace("/");
  };

  const startCheckout = (provider: Provider) => {
    setError(null);
    setPending(provider);
    checkout.mutate(
      { data: { provider, plan: "monthly" } },
      {
        onSuccess: async (res) => {
          // Mark the onboarding step done before leaving for the provider so the
          // user isn't sent back here if they abandon checkout.
          await recordSelection();
          openUrl(res.url);
        },
        onError: () => {
          setPending(null);
          setError(
            `We couldn't start ${provider === "stripe" ? "card" : "PayPal"} checkout. Please try again.`,
          );
        },
      },
    );
  };

  const busy = pending !== null || startTrial.isPending || markPlanSelected.isPending;
  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
          <Feather name="shopping-bag" size={28} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>Choose your plan</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Start with premium AI receipt scanning, or use the free plan and upgrade
          anytime. You can change this whenever you like.
        </Text>

        <View style={[styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.price, { color: colors.foreground }]}>$5.99</Text>
          <Text style={[styles.priceUnit, { color: colors.mutedForeground }]}>per month</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {[
            "Unlimited AI receipt scanning",
            "Price history & analytics",
            "Smart shopping list & catalog",
          ].map((feat) => (
            <View key={feat} style={styles.featureRow}>
              <Feather name="check" size={16} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.foreground }]}>{feat}</Text>
            </View>
          ))}
        </View>

        {error ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        ) : null}

        {canStartTrial ? (
          <TouchableOpacity
            style={[styles.payBtn, { backgroundColor: colors.primary }]}
            onPress={handleStartTrial}
            disabled={busy}
            activeOpacity={0.85}
          >
            {startTrial.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.payBtnText, { color: colors.primaryForeground }]}>
                Start 30-day free trial
              </Text>
            )}
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.orLabel, { color: colors.mutedForeground }]}>
          {canStartTrial ? "or subscribe now" : "Subscribe"}
        </Text>

        <TouchableOpacity
          style={[styles.payBtnOutline, { borderColor: colors.primary }]}
          onPress={() => startCheckout("stripe")}
          disabled={busy}
          activeOpacity={0.85}
        >
          {pending === "stripe" ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Feather name="credit-card" size={18} color={colors.primary} />
              <Text style={[styles.payBtnText, { color: colors.primary }]}>Pay with card</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.payBtnOutline, { borderColor: colors.primary }]}
          onPress={() => startCheckout("paypal")}
          disabled={busy}
          activeOpacity={0.85}
        >
          {pending === "paypal" ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.payBtnText, { color: colors.primary }]}>Pay with PayPal</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleContinueFree}
          style={styles.freeBtn}
          disabled={busy}
          activeOpacity={0.7}
        >
          <Text style={[styles.freeBtnText, { color: colors.mutedForeground }]}>
            Continue with a free account
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 24,
    paddingBottom: 48,
    gap: 14,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
    alignItems: "stretch",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 4,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 6,
  },
  priceCard: { borderWidth: 1, borderRadius: 18, padding: 22, alignItems: "center", gap: 4 },
  price: { fontSize: 40, fontFamily: "Inter_700Bold" },
  priceUnit: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: { height: 1, alignSelf: "stretch", marginVertical: 14 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch" },
  featureText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
  },
  payBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    borderWidth: 1.5,
  },
  payBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  orLabel: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 2 },
  freeBtn: { alignItems: "center", marginTop: 10, paddingVertical: 10 },
  freeBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
