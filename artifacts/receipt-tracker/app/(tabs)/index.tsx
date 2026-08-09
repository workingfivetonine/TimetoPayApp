import React, { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/expo";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useDesktop } from "@/hooks/useDesktop";
import { WelcomeTour } from "@/components/WelcomeTour";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

type Destination = {
  href: string;
  label: string;
  hint: string;
  icon: FeatherName;
};

// The six places a signed-in user actually goes. Receipts leads because it is
// what the app is for; it lost its tab-bar slot to this screen, so the tile is
// now its only route in from the bottom bar.
const DESTINATIONS: Destination[] = [
  { href: "/receipts", label: "Receipts", hint: "Everything you've scanned", icon: "file-text" },
  { href: "/shopping", label: "Shopping List", hint: "Regulars, list and trip", icon: "check-square" },
  { href: "/stores", label: "Stores", hint: "Delivery fees and distance", icon: "shopping-bag" },
  { href: "/analytics", label: "Analytics", hint: "Spending and price history", icon: "bar-chart-2" },
  { href: "/catalog", label: "Browse Catalog", hint: "Prices from everyone", icon: "globe" },
  { href: "/board", label: "Community", hint: "Tips from other shoppers", icon: "message-square" },
];

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDesktop = useDesktop();
  const { user } = useUser();
  const { data: me } = useGetCurrentUser();

  const paddingTop = isDesktop ? 32 : Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = isDesktop ? 24 : Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const hello = useMemo(() => greeting(new Date().getHours()), []);
  const firstName = user?.firstName?.trim();

  const go = (href: string) => router.push(href as never);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop, paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting + account */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>{hello}</Text>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
              {firstName || "Welcome back"}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.accountBtn, { backgroundColor: colors.secondary }]}
            onPress={() => router.push("/account")}
            activeOpacity={0.8}
            accessibilityLabel="Account"
          >
            <Feather name="user" size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Primary action — scanning is the one thing worth a full-width card */}
        <TouchableOpacity
          style={[styles.scanCard, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/scan")}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Scan a receipt"
        >
          <View style={styles.scanIcon}>
            <Feather name="camera" size={22} color={colors.primary} />
          </View>
          <View style={styles.scanText}>
            <Text style={styles.scanTitle}>Scan a receipt</Text>
            <Text style={styles.scanHint}>Photo, PDF or share from another app</Text>
          </View>
          <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.manualRow, { borderColor: colors.border }]}
          onPress={() => router.push("/manual-entry")}
          activeOpacity={0.7}
        >
          <Feather name="edit-3" size={14} color={colors.mutedForeground} />
          <Text style={[styles.manualText, { color: colors.mutedForeground }]}>
            Or enter one by hand
          </Text>
        </TouchableOpacity>

        {/* Destinations */}
        <View style={styles.grid}>
          {DESTINATIONS.map((d) => (
            <TouchableOpacity
              key={d.href}
              style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => go(d.href)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={d.label}
            >
              <View style={[styles.tileIcon, { backgroundColor: colors.accent }]}>
                <Feather name={d.icon} size={17} color={colors.primary} />
              </View>
              <Text style={[styles.tileLabel, { color: colors.foreground }]} numberOfLines={1}>
                {d.label}
              </Text>
              <Text style={[styles.tileHint, { color: colors.mutedForeground }]} numberOfLines={2}>
                {d.hint}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quiet links */}
        <View style={[styles.links, { borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push("/help")}
            activeOpacity={0.7}
          >
            <Feather name="book-open" size={16} color={colors.mutedForeground} />
            <Text style={[styles.linkText, { color: colors.foreground }]}>How-to Guide</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.linkDivider, { backgroundColor: colors.border }]} />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push("/account")}
            activeOpacity={0.7}
          >
            <Feather name="settings" size={16} color={colors.mutedForeground} />
            <Text style={[styles.linkText, { color: colors.foreground }]}>Account & settings</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {me?.isAdmin && (
            <>
              <View style={[styles.linkDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.push("/admin")}
                activeOpacity={0.7}
              >
                <Feather name="shield" size={16} color={colors.primary} />
                <Text style={[styles.linkText, { color: colors.primary }]}>Admin tools</Text>
                <Feather name="chevron-right" size={16} color={colors.primary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      <WelcomeTour />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 18 },

  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1, gap: 1 },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  accountBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  scanIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  scanText: { flex: 1, gap: 2 },
  scanTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  scanHint: { color: "rgba(255,255,255,0.82)", fontSize: 12.5, fontFamily: "Inter_400Regular" },

  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: -8,
  },
  manualText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 150,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  tileLabel: { fontSize: 14.5, fontFamily: "Inter_600SemiBold" },
  tileHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },

  links: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  linkText: { flex: 1, fontSize: 14.5, fontFamily: "Inter_500Medium" },
  linkDivider: { height: StyleSheet.hairlineWidth, marginLeft: 42 },
});
