import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatRelativeTime } from "@/lib/relativeTime";

/**
 * Thin banner shown only while offline, telling the user the data on screen is
 * cached and how stale it is. `lastUpdated` is the React Query `dataUpdatedAt`
 * of the screen's primary query (omit when there's no cached data yet).
 */
export function OfflineBanner({ lastUpdated }: { lastUpdated?: number }) {
  const colors = useColors();
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Feather name="wifi-off" size={14} color={colors.mutedForeground} />
      <Text style={[styles.text, { color: colors.mutedForeground }]} numberOfLines={1}>
        {lastUpdated
          ? `Offline — showing data from ${formatRelativeTime(lastUpdated)}`
          : "Offline — no saved data to show"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
});
