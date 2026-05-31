import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useColors } from "@/hooks/useColors";

const NAV = [
  { label: "Receipts", icon: "file-text", href: "/", match: (p: string) => p === "/" || p === "" },
  { label: "Stores", icon: "shopping-bag", href: "/stores", match: (p: string) => p.startsWith("/stores") },
  { label: "Shopping List", icon: "check-square", href: "/shopping", match: (p: string) => p.startsWith("/shopping") },
  { label: "Analytics", icon: "bar-chart-2", href: "/analytics", match: (p: string) => p.startsWith("/analytics") },
] as const;

export function DesktopSidebar() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={[styles.sidebar, { backgroundColor: colors.background, borderRightColor: colors.border }]}>
      {/* Brand */}
      <View style={styles.brand}>
        <View style={[styles.brandIcon, { backgroundColor: colors.accent }]}>
          <Feather name="file-text" size={18} color={colors.primary} />
        </View>
        <Text style={[styles.brandName, { color: colors.foreground }]}>Receipt Tracker</Text>
      </View>

      {/* Nav links */}
      <View style={styles.nav}>
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <TouchableOpacity
              key={item.href}
              style={[
                styles.navItem,
                active && { backgroundColor: colors.accent },
              ]}
              onPress={() => router.push(item.href as never)}
              activeOpacity={0.7}
            >
              <Feather
                name={item.icon as never}
                size={17}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.navLabel,
                  { color: active ? colors.primary : colors.mutedForeground },
                  active && styles.navLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Account link */}
      <View style={styles.nav}>
        <TouchableOpacity
          style={[styles.navItem, pathname.startsWith("/account") && { backgroundColor: colors.accent }]}
          onPress={() => router.push("/account")}
          activeOpacity={0.7}
        >
          <Feather
            name="user"
            size={17}
            color={pathname.startsWith("/account") ? colors.primary : colors.mutedForeground}
          />
          <Text
            style={[
              styles.navLabel,
              { color: pathname.startsWith("/account") ? colors.primary : colors.mutedForeground },
            ]}
          >
            Account
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scan button */}
      <View style={styles.scanWrap}>
        <TouchableOpacity
          style={[styles.scanBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/scan")}
          activeOpacity={0.85}
        >
          <Feather name="upload" size={16} color="#fff" />
          <Text style={styles.scanBtnText}>Add Receipt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    paddingTop: 32,
    paddingBottom: 28,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexDirection: "column",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    marginBottom: 28,
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  nav: {
    gap: 2,
    paddingHorizontal: 10,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  navLabelActive: {
    fontFamily: "Inter_600SemiBold",
  },
  scanWrap: {
    paddingHorizontal: 10,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  scanBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
