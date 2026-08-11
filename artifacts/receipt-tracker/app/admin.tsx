import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

// Single landing point for every admin-only tool — reached from the Home tab's
// "Admin tools" link and Account's "Admin tools" row, so there's exactly one
// place these are listed rather than the same set of rows duplicated on both
// screens (and drifting the next time one gets a tool the other doesn't).
const TOOLS: { key: string; label: string; sub: string; icon: keyof typeof Feather.glyphMap; href: string }[] = [
  {
    key: "users",
    label: "All users",
    sub: "Browse every account, spend and activity",
    icon: "users",
    href: "/admin/users",
  },
  {
    key: "global",
    label: "Global prices",
    sub: "Most recent price per item, across everyone",
    icon: "tag",
    href: "/admin/global",
  },
  {
    key: "catalog",
    label: "Manage catalog",
    sub: "Merge and clean up spelling variants",
    icon: "layers",
    href: "/admin/catalog",
  },
  {
    key: "board",
    label: "Board moderation",
    sub: "Review pending posts and reports",
    icon: "message-square",
    href: "/admin/board",
  },
  {
    key: "analytics",
    label: "Build a chart",
    sub: "Pick a data source and chart it yourself",
    icon: "bar-chart-2",
    href: "/admin/analytics",
  },
];

export default function AdminHubScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Admin Tools</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {TOOLS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(t.href as never)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
              <Feather name={t.icon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>{t.label}</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{t.sub}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  iconBadge: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
});
