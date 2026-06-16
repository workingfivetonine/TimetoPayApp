import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGetCurrentUser } from "@workspace/api-client-react";

// A small attention banner for two billing states that need the user to act:
//   • past_due  — a payment failed; access is winding down (cut after the grace
//                 window in computeEntitlement). Prompt them to fix billing.
//   • trialing  — the free trial ends within 3 days. Prompt them to subscribe.
// Web-only (billing is web-only). Returns null for every other state — the
// post-trial "free" state is handled by the AnnualOfferModal + paywall.
export function EntitlementBanner() {
  const router = useRouter();
  const { data: me } = useGetCurrentUser();
  const ent = me?.entitlement as
    | { status?: string; currentPeriodEnd?: string | null }
    | undefined;
  if (Platform.OS !== "web" || !ent) return null;

  if (ent.status === "past_due") {
    return (
      <Banner
        icon="alert-triangle"
        tint="#dc2626"
        bg="#fef2f2"
        text="Your last payment didn't go through. Update your billing to keep premium access."
        cta="Fix billing"
        onPress={() => router.push("/account")}
      />
    );
  }

  if (ent.status === "trialing" && ent.currentPeriodEnd) {
    const days = Math.ceil(
      (new Date(ent.currentPeriodEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    if (days <= 3) {
      const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      return (
        <Banner
          icon="clock"
          tint="#b45309"
          bg="#fffbeb"
          text={`Your free trial ends ${when}. Subscribe to keep premium features.`}
          cta="Subscribe"
          onPress={() => router.push("/paywall")}
        />
      );
    }
  }

  return null;
}

function Banner({
  icon,
  tint,
  bg,
  text,
  cta,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  bg: string;
  text: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: tint }]}>
      <Feather name={icon} size={16} color={tint} />
      <Text style={[styles.text, { color: tint }]}>{text}</Text>
      <TouchableOpacity onPress={onPress} style={[styles.cta, { backgroundColor: tint }]} activeOpacity={0.85}>
        <Text style={styles.ctaText}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    lineHeight: 17,
  },
  cta: {
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  ctaText: {
    color: "#fff",
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
});
