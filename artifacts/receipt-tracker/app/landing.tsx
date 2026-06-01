import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
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

const FEATURES: { icon: FeatherName; title: string; body: string }[] = [
  {
    icon: "camera",
    title: "Scan with AI",
    body: "Snap a photo of any receipt and AI pulls out every item, price, and store in seconds — no typing.",
  },
  {
    icon: "trending-down",
    title: "Track prices over time",
    body: "See how grocery prices move week to week, and which store gives you the best deal on the things you buy.",
  },
  {
    icon: "shopping-cart",
    title: "Smart shopping list",
    body: "Your regulars are detected automatically and grouped by store, with the lowest known price next to each item.",
  },
  {
    icon: "bar-chart-2",
    title: "Spending insights",
    body: "Weekly spend trends with high and low flags, plus full price history for every item you've ever bought.",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "Scan your receipt",
    body: "Point your camera at a receipt or upload a photo from your gallery.",
  },
  {
    n: "2",
    title: "We do the rest",
    body: "AI reads the items and prices, builds your catalog, and updates your shopping list.",
  },
  {
    n: "3",
    title: "Shop smarter",
    body: "Head out with a price-aware list that knows the cheapest store for each item.",
  },
];

export default function LandingPage() {
  const colors = useColors();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === "web" && width >= 900;

  const styles = makeStyles(colors, isWide);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.inner}>
        {/* Nav */}
        <View style={styles.nav}>
          <View style={styles.brand}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={styles.brandLogo}
            />
            <Text style={styles.brandName}>Receipt Tracker</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/sign-in")}
            accessibilityRole="button"
          >
            <Text style={styles.navSignIn}>Sign in</Text>
          </TouchableOpacity>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Feather name="zap" size={13} color={colors.primary} />
            <Text style={styles.badgeText}>AI-powered grocery tracking</Text>
          </View>
          <Text style={styles.h1}>
            Turn your receipts into real grocery savings
          </Text>
          <Text style={styles.subtitle}>
            Scan any receipt and Receipt Tracker reads every item and price,
            tracks how they change over time, and builds a smart shopping list
            that always points you to the cheapest store.
          </Text>
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.ctaPrimary}
              onPress={() => router.push("/(auth)/sign-up")}
              accessibilityRole="button"
            >
              <Text style={styles.ctaPrimaryText}>Get started — it's free</Text>
              <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaSecondary}
              onPress={() => router.push("/(auth)/sign-in")}
              accessibilityRole="button"
            >
              <Text style={styles.ctaSecondaryText}>I already have an account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Features */}
        <View style={styles.featuresWrap}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureCard}>
              <View style={styles.featureIcon}>
                <Feather name={f.icon} size={22} color={colors.primary} />
              </View>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureBody}>{f.body}</Text>
            </View>
          ))}
        </View>

        {/* How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it works</Text>
          <View style={styles.stepsWrap}>
            {STEPS.map((s) => (
              <View key={s.n} style={styles.stepCard}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{s.n}</Text>
                </View>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Closing CTA */}
        <View style={styles.closing}>
          <Text style={styles.closingTitle}>
            Stop overpaying for groceries
          </Text>
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

        <Text style={styles.footer}>
          © {new Date().getFullYear()} Receipt Tracker
        </Text>
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
    inner: {
      width: "100%",
      maxWidth: 1080,
    },
    nav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: isWide ? 56 : 32,
    },
    brand: { flexDirection: "row", alignItems: "center", gap: 10 },
    brandLogo: { width: 32, height: 32, borderRadius: 8 },
    brandName: {
      fontFamily: "Inter_700Bold",
      fontSize: 18,
      color: colors.text,
    },
    navSignIn: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.primary,
    },
    hero: {
      alignItems: "center",
      textAlign: "center" as never,
      marginBottom: isWide ? 64 : 44,
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
      fontSize: isWide ? 52 : 34,
      lineHeight: isWide ? 58 : 40,
      color: colors.text,
      textAlign: "center",
      maxWidth: 760,
      marginBottom: 18,
    },
    subtitle: {
      fontFamily: "Inter_400Regular",
      fontSize: isWide ? 19 : 16,
      lineHeight: isWide ? 30 : 25,
      color: colors.mutedForeground,
      textAlign: "center",
      maxWidth: 620,
      marginBottom: 28,
    },
    ctaRow: {
      flexDirection: isWide ? "row" : "column",
      gap: 12,
      alignItems: "center",
      alignSelf: "stretch",
      justifyContent: "center",
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
      ...(isWide ? {} : { alignSelf: "stretch" }),
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
      ...(isWide ? {} : { alignSelf: "stretch" }),
    },
    ctaSecondaryText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },
    featuresWrap: {
      flexDirection: isWide ? "row" : "column",
      flexWrap: "wrap",
      gap: 16,
      marginBottom: isWide ? 72 : 48,
    },
    featureCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
      ...(isWide ? { flexBasis: "47%", flexGrow: 1 } : {}),
    },
    featureIcon: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    featureTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 18,
      color: colors.text,
      marginBottom: 6,
    },
    featureBody: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 23,
      color: colors.mutedForeground,
    },
    section: { marginBottom: isWide ? 72 : 48 },
    sectionTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: isWide ? 32 : 26,
      color: colors.text,
      textAlign: "center",
      marginBottom: 28,
    },
    stepsWrap: {
      flexDirection: isWide ? "row" : "column",
      gap: 16,
    },
    stepCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
    },
    stepNum: {
      width: 38,
      height: 38,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    stepNumText: {
      fontFamily: "Inter_700Bold",
      fontSize: 17,
      color: colors.primaryForeground,
    },
    stepTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 17,
      color: colors.text,
      marginBottom: 6,
    },
    stepBody: {
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
    footer: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: "center",
    },
  });
}
