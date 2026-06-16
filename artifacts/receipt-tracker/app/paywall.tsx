import { useAuth, useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetCurrentUserQueryKey,
  useCreateBillingCheckout,
  useFinalizePaypalSubscription,
  useGetCurrentUser,
  useRedeemPromoCode,
  useStartFreeTrial,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { getApiOrigin } from "@/lib/apiBase";

type Provider = "stripe" | "paypal";

function openUrl(url: string): void {
  if (Platform.OS === "web") {
    window.location.assign(url);
  } else {
    void Linking.openURL(url);
  }
}

function readParam(name: string): string | null {
  if (Platform.OS !== "web") return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export default function PaywallScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { data: me } = useGetCurrentUser();

  const [promo, setPromo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);

  const checkout = useCreateBillingCheckout();
  const finalize = useFinalizePaypalSubscription();
  const redeem = useRedeemPromoCode();
  const startTrial = useStartFreeTrial();

  const canStartTrial = me?.entitlement?.canStartTrial ?? false;

  const { getToken } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");

  // Live prices from Stripe so the screen always matches what's actually charged.
  const { data: prices } = useQuery({
    queryKey: ["billing", "prices"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/billing/prices`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("prices");
      return res.json() as Promise<{
        monthly: { amount: number };
        annual: { amount: number; percentOff: number; effectiveAmount: number };
      }>;
    },
  });

  const fmt = (cents: number) => {
    const d = cents / 100;
    return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
  };
  const monthlyCents = prices?.monthly.amount ?? 599;
  const annualCents = prices?.annual.effectiveAmount ?? 5750;
  const savingsPercent = Math.max(
    0,
    Math.round((1 - annualCents / (monthlyCents * 12)) * 100),
  );

  const refreshMe = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
  };

  const handleStartTrial = () => {
    setError(null);
    startTrial.mutate(undefined, {
      onSuccess: async () => {
        await refreshMe();
        router.replace("/");
      },
      onError: () => setError("We couldn't start your free trial. Please try again."),
    });
  };

  // Handle the PayPal return: PayPal appends ?subscription_id to the return URL
  // after approval. Finalize it server-side (the server reads it authoritatively
  // from PayPal — never trusting the client's "success").
  useEffect(() => {
    const subscriptionId = readParam("subscription_id");
    const paypal = readParam("paypal");
    if (paypal === "success" && subscriptionId) {
      finalize.mutate(
        { data: { subscriptionId } },
        {
          onSuccess: async () => {
            await refreshMe();
            // Match the Stripe success_url so the home screen shows the same
            // post-subscribe celebration + share prompt.
            router.replace("/?checkout=success");
          },
          onError: () =>
            setError("We couldn't confirm your PayPal subscription. Please try again."),
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = (provider: Provider) => {
    setError(null);
    setPending(provider);
    checkout.mutate(
      { data: { provider, plan: provider === "paypal" ? "monthly" : selectedPlan } },
      {
        onSuccess: (res) => openUrl(res.url),
        onError: () => {
          setPending(null);
          setError(
            `We couldn't start ${provider === "stripe" ? "card" : "PayPal"} checkout. Please try again.`,
          );
        },
      },
    );
  };

  const submitPromo = () => {
    if (!promo.trim()) return;
    setError(null);
    redeem.mutate(
      { data: { code: promo.trim() } },
      {
        onSuccess: async () => {
          await refreshMe();
          router.replace("/");
        },
        onError: () => setError("That promo code isn't valid."),
      },
    );
  };

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    router.replace("/(auth)/sign-in");
  };

  const finalizing = finalize.isPending;
  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 16;

  if (finalizing) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.finalizingText, { color: colors.mutedForeground }]}>
          Confirming your subscription…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
          <Feather name="lock" size={28} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          {canStartTrial ? "Try it free for 30 days" : "Unlock premium features"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {canStartTrial
            ? "Start a free 30-day trial — no payment required — to scan receipts, track prices, and build your smart shopping list."
            : "Subscribe to keep scanning receipts, tracking prices, and building your smart shopping list."}
        </Text>

        {/* Plan selector */}
        <TouchableOpacity
          style={[
            styles.planCard,
            { backgroundColor: colors.card, borderColor: selectedPlan === "annual" ? colors.primary : colors.border },
          ]}
          onPress={() => setSelectedPlan("annual")}
          activeOpacity={0.85}
        >
          {savingsPercent > 0 ? (
            <View style={[styles.planBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.planBadgeText}>BEST VALUE · SAVE {savingsPercent}%</Text>
            </View>
          ) : null}
          <View style={styles.planRow}>
            <Feather
              name={selectedPlan === "annual" ? "check-circle" : "circle"}
              size={20}
              color={selectedPlan === "annual" ? colors.primary : colors.mutedForeground}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.planName, { color: colors.foreground }]}>Annual</Text>
              <Text style={[styles.planSub, { color: colors.mutedForeground }]}>
                {fmt(annualCents)}/year · {fmt(Math.round(annualCents / 12))}/mo
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.planCard,
            { backgroundColor: colors.card, borderColor: selectedPlan === "monthly" ? colors.primary : colors.border },
          ]}
          onPress={() => setSelectedPlan("monthly")}
          activeOpacity={0.85}
        >
          <View style={styles.planRow}>
            <Feather
              name={selectedPlan === "monthly" ? "check-circle" : "circle"}
              size={20}
              color={selectedPlan === "monthly" ? colors.primary : colors.mutedForeground}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.planName, { color: colors.foreground }]}>Monthly</Text>
              <Text style={[styles.planSub, { color: colors.mutedForeground }]}>{fmt(monthlyCents)}/month</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Features */}
        <View style={[styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
            disabled={startTrial.isPending || pending !== null}
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

        {canStartTrial ? (
          <Text style={[styles.orLabel, { color: colors.mutedForeground }]}>
            or subscribe now
          </Text>
        ) : null}

        <TouchableOpacity
          style={[
            canStartTrial ? styles.payBtnOutline : styles.payBtn,
            canStartTrial ? { borderColor: colors.primary } : { backgroundColor: colors.primary },
          ]}
          onPress={() => startCheckout("stripe")}
          disabled={pending !== null}
          activeOpacity={0.85}
        >
          {pending === "stripe" ? (
            <ActivityIndicator color={canStartTrial ? colors.primary : colors.primaryForeground} />
          ) : (
            <>
              <Feather
                name="credit-card"
                size={18}
                color={canStartTrial ? colors.primary : colors.primaryForeground}
              />
              <Text
                style={[
                  styles.payBtnText,
                  { color: canStartTrial ? colors.primary : colors.primaryForeground },
                ]}
              >
                Pay with card · {selectedPlan === "annual" ? `${fmt(annualCents)}/yr` : `${fmt(monthlyCents)}/mo`}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {selectedPlan === "monthly" ? (
          <TouchableOpacity
            style={[styles.payBtnOutline, { borderColor: colors.primary }]}
            onPress={() => startCheckout("paypal")}
            disabled={pending !== null}
            activeOpacity={0.85}
          >
            {pending === "paypal" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.payBtnText, { color: colors.primary }]}>
                Pay with PayPal
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <Text style={[styles.cancelNote, { color: colors.mutedForeground }]}>
            Annual is card-only — choose Monthly to pay with PayPal.
          </Text>
        )}

        <Text style={[styles.cancelNote, { color: colors.mutedForeground }]}>
          Cancel anytime{canStartTrial ? " — your 30-day free trial is free, no charge until it ends" : ""}.
        </Text>

        <View style={styles.promoSection}>
          <Text style={[styles.promoLabel, { color: colors.mutedForeground }]}>
            Have a promo code?
          </Text>
          <View style={styles.promoRow}>
            <TextInput
              value={promo}
              onChangeText={setPromo}
              placeholder="Enter code"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[
                styles.promoInput,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <TouchableOpacity
              style={[styles.promoBtn, { backgroundColor: colors.accent }]}
              onPress={submitPromo}
              disabled={redeem.isPending || !promo.trim()}
              activeOpacity={0.8}
            >
              {redeem.isPending ? (
                <ActivityIndicator color={colors.accentForeground} />
              ) : (
                <Text style={[styles.promoBtnText, { color: colors.accentForeground }]}>
                  Apply
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity onPress={handleSignOut} style={styles.signOut} activeOpacity={0.7}>
          <Text style={[styles.signOutText, { color: colors.mutedForeground }]}>
            Sign out{me?.email ? ` (${me.email})` : ""}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  finalizingText: { fontSize: 14, fontFamily: "Inter_500Medium" },
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
  priceCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    gap: 4,
  },
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
  planCard: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 10 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  planName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  planSub: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  planBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 10 },
  planBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  cancelNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
  orLabel: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 2 },
  promoSection: { marginTop: 10, gap: 8 },
  promoLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  promoRow: { flexDirection: "row", gap: 8 },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  promoBtn: {
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  promoBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  signOut: { alignItems: "center", marginTop: 18, paddingVertical: 8 },
  signOutText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
