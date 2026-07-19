import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

// Optional donation link (Stripe Payment Link). Overridable via env.
const DONATE_URL =
  process.env.EXPO_PUBLIC_DONATE_URL ?? "https://donate.stripe.com/9B6eVed6D3DUh19e2TdfG00";

// Everything is free — one list of all features (no free/premium split).
const FEATURES: string[] = [
  "AI receipt scanning — photos & PDFs",
  "Track all your receipts, stores & items",
  "Smart shopping list, grouped by store",
  "Cross-store price catalog — find the cheapest store",
  "Full per-item price history & deep analytics",
  '"Best of" insights — cheapest, closest & go-to stores',
  "Printable shopping list PDF",
  "Community board for tips & deals",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is TimetoPay really free?",
    a: "Yes — every feature, for everyone, with no subscription and no card required. Scan receipts, compare stores, track prices — all free.",
  },
  {
    q: "Then how is it kept running?",
    a: "Through optional donations from people who find it useful. There's no paywall — if TimetoPay saves you money, you can chip in whatever you like. Completely optional.",
  },
  {
    q: "Any ads or hidden fees?",
    a: "No ads, no hidden fees, no locked features. What you see is the whole app, free.",
  },
];

export default function PricingPage() {
  const colors = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === "web" && width >= 900;

  const styles = makeStyles(colors, isWide);

  const PlanFeature = ({ label, icon }: { label: string; icon: FeatherName }) => (
    <View style={styles.feature}>
      <Feather name={icon} size={16} color={colors.primary} style={styles.featureCheck} />
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.inner}>
        {/* Nav */}
        <View style={styles.nav}>
          <TouchableOpacity
            style={styles.brand}
            onPress={() => router.push("/landing")}
            accessibilityRole="button"
          >
            <Image source={require("@/assets/images/icon.png")} style={styles.brandLogo} />
            <Text style={styles.brandName}>TimetoPay</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/sign-in")}
            accessibilityRole="button"
          >
            <Text style={styles.navSignIn}>Sign in</Text>
          </TouchableOpacity>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badge}>
            <Feather name="gift" size={13} color={colors.primary} />
            <Text style={styles.badgeText}>Free — every feature</Text>
          </View>
          <Text style={styles.h1}>TimetoPay is free. All of it.</Text>
          <Text style={styles.subtitle}>
            Every feature — AI receipt scanning, price tracking, store comparisons, the
            community board — free for everyone. No subscription, no card. If it helps you save,
            you can support it with an optional donation.
          </Text>
        </View>

        {/* Plans */}
        <View style={styles.plansWrap}>
          {/* Everything, free */}
          <View style={styles.planCard}>
            <Text style={styles.planName}>Everything included</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>$0</Text>
              <Text style={styles.pricePeriod}>/ forever</Text>
            </View>
            <Text style={styles.planTagline}>The whole app, free — no limits, no paywall.</Text>
            <View style={styles.features}>
              {FEATURES.map((f) => (
                <PlanFeature key={f} label={f} icon="check" />
              ))}
            </View>
            <TouchableOpacity
              style={styles.ctaPrimary}
              onPress={() => router.push("/(auth)/sign-up")}
              accessibilityRole="button"
            >
              <Text style={styles.ctaPrimaryText}>Get started free</Text>
              <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>

          {/* Support (optional) */}
          <View style={[styles.planCard, styles.planCardFeatured]}>
            <View style={styles.popularBadge}>
              <Feather name="heart" size={12} color={colors.primaryForeground} />
              <Text style={styles.popularBadgeText}>Optional</Text>
            </View>
            <Text style={[styles.planName, styles.planNameFeatured]}>Support TimetoPay</Text>
            <Text style={[styles.planTagline, styles.planTaglineFeatured, { marginTop: 10 }]}>
              Built and run by a small team. If it saves you money, a small donation keeps it
              free for everyone — give once, any amount you like.
            </Text>
            <View style={styles.features}>
              <PlanFeature label="100% optional — the app is fully free either way" icon="check" />
              <PlanFeature label="Give once, any amount you choose" icon="check" />
              <PlanFeature label="Helps cover scanning & hosting costs" icon="check" />
            </View>
            <TouchableOpacity
              style={styles.ctaPrimary}
              onPress={() => void Linking.openURL(DONATE_URL)}
              accessibilityRole="button"
            >
              <Text style={styles.ctaPrimaryText}>Support us 💛</Text>
            </TouchableOpacity>
            <Text style={styles.fineprint}>Opens a secure Stripe donation page.</Text>
          </View>
        </View>

        {/* FAQ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Questions, answered</Text>
          <View style={styles.faqWrap}>
            {FAQ.map((item) => (
              <View key={item.q} style={styles.faqCard}>
                <Text style={styles.faqQ}>{item.q}</Text>
                <Text style={styles.faqA}>{item.a}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Closing CTA */}
        <View style={styles.closing}>
          <Text style={styles.closingTitle}>Ready to stop overpaying?</Text>
          <Text style={styles.closingBody}>
            Create a free account and scan your first receipt in under a minute.
          </Text>
          <TouchableOpacity
            style={styles.ctaPrimary}
            onPress={() => router.push("/(auth)/sign-up")}
            accessibilityRole="button"
          >
            <Text style={styles.ctaPrimaryText}>Create your free account</Text>
            <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>

        <View style={styles.footerWrap}>
          <TouchableOpacity onPress={() => router.push("/landing")} accessibilityRole="link">
            <Text style={styles.footerLink}>← Back to home</Text>
          </TouchableOpacity>
          <Text style={styles.footer}>© {new Date().getFullYear()} TimetoPay</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, isWide: boolean) {
  return StyleSheet.create({
    container: {
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: Platform.OS === "web" ? 24 : 56,
      paddingBottom: 64,
    },
    inner: { width: "100%", maxWidth: 1080 },
    nav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: isWide ? 48 : 28,
    },
    brand: { flexDirection: "row", alignItems: "center", gap: 10 },
    brandLogo: { width: 32, height: 32, borderRadius: 8 },
    brandName: { fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text },
    navSignIn: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.primary },
    header: {
      alignItems: "center",
      marginBottom: isWide ? 52 : 36,
      paddingHorizontal: isWide ? 40 : 0,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.secondary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      marginBottom: 20,
    },
    badgeText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: colors.secondaryForeground,
    },
    h1: {
      fontFamily: "Inter_700Bold",
      fontSize: isWide ? 46 : 32,
      lineHeight: isWide ? 52 : 38,
      color: colors.text,
      textAlign: "center",
      maxWidth: 720,
      marginBottom: 16,
    },
    subtitle: {
      fontFamily: "Inter_400Regular",
      fontSize: isWide ? 18 : 16,
      lineHeight: isWide ? 28 : 24,
      color: colors.mutedForeground,
      textAlign: "center",
      maxWidth: 620,
    },
    plansWrap: {
      flexDirection: isWide ? "row" : "column",
      gap: 20,
      alignItems: isWide ? "stretch" : "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    planCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 8,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 28,
      width: "100%",
      maxWidth: 420,
      ...(isWide ? { flex: 1 } : {}),
    },
    planCardFeatured: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    popularBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 5,
      backgroundColor: colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      marginBottom: 14,
    },
    popularBadgeText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
      color: colors.primaryForeground,
    },
    planName: {
      fontFamily: "Inter_700Bold",
      fontSize: 20,
      color: colors.text,
      marginBottom: 6,
    },
    planNameFeatured: { color: colors.primary },
    priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 10 },
    price: { fontFamily: "Inter_700Bold", fontSize: 40, color: colors.text },
    priceFeatured: { color: colors.text },
    pricePeriod: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.mutedForeground,
      marginBottom: 7,
    },
    pricePeriodFeatured: { color: colors.mutedForeground },
    planTagline: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 22,
      color: colors.mutedForeground,
      marginBottom: 20,
    },
    planTaglineFeatured: {},
    features: { gap: 12, marginBottom: 24 },
    feature: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    featureCheck: { marginTop: 2 },
    featureText: {
      flex: 1,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
    },
    ctaPrimary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 15,
      borderRadius: colors.radius,
      alignSelf: "stretch",
    },
    ctaPrimaryText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      color: colors.primaryForeground,
    },
    ctaSecondary: {
      paddingHorizontal: 24,
      paddingVertical: 15,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
    },
    ctaSecondaryText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text },
    fineprint: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 12,
    },
    platformNote: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      lineHeight: 21,
      color: colors.mutedForeground,
      textAlign: "center",
      maxWidth: 620,
      alignSelf: "center",
      marginBottom: isWide ? 72 : 48,
    },
    section: { marginBottom: isWide ? 72 : 48 },
    sectionTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: isWide ? 30 : 24,
      color: colors.text,
      textAlign: "center",
      marginBottom: 28,
    },
    faqWrap: { gap: 14, maxWidth: 760, width: "100%", alignSelf: "center" },
    faqCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
    },
    faqQ: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text, marginBottom: 6 },
    faqA: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 23,
      color: colors.mutedForeground,
    },
    closing: {
      alignItems: "center",
      backgroundColor: colors.secondary,
      borderRadius: colors.radius + 8,
      paddingVertical: isWide ? 56 : 40,
      paddingHorizontal: 24,
      marginBottom: 32,
    },
    closingTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: isWide ? 30 : 24,
      color: colors.text,
      textAlign: "center",
      marginBottom: 10,
    },
    closingBody: {
      fontFamily: "Inter_400Regular",
      fontSize: 16,
      lineHeight: 24,
      color: colors.mutedForeground,
      textAlign: "center",
      maxWidth: 480,
      marginBottom: 22,
    },
    footerWrap: { alignItems: "center", gap: 10 },
    footerLink: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary },
    footer: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: "center",
    },
  });
}
