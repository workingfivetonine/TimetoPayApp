import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { WeeklySpend } from "@workspace/api-client-react";

interface Props {
  week: WeeklySpend;
  maxTotal: number;
}

export function WeeklySpendBar({ week, maxTotal }: Props) {
  const colors = useColors();

  const barWidth = maxTotal > 0 ? (week.total / maxTotal) * 100 : 0;

  const bgColor = week.isHigh
    ? colors.spendHigh
    : week.isLow
    ? colors.spendLow
    : colors.card;
  const textColor = week.isHigh
    ? colors.spendHighText
    : week.isLow
    ? colors.spendLowText
    : colors.foreground;
  const barColor = week.isHigh
    ? colors.spendHighText
    : week.isLow
    ? colors.spendLowText
    : colors.primary;

  const startDate = new Date(week.weekStart);
  const label = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor: colors.border }]}>
      <View style={styles.top}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
        <View style={styles.rightRow}>
          {(week.isHigh || week.isLow) && (
            <View
              style={[
                styles.badge,
                { backgroundColor: week.isHigh ? "#fecaca" : "#bbf7d0" },
              ]}
            >
              <Text
                style={[styles.badgeText, { color: textColor }]}
              >
                {week.isHigh ? "HIGH" : "LOW"}
              </Text>
            </View>
          )}
          <Text style={[styles.amount, { color: textColor }]}>${week.total.toFixed(2)}</Text>
        </View>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            { width: `${barWidth}%` as any, backgroundColor: barColor },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  amount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
});
