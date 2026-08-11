import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { formatPrice } from "@workspace/geo";
import type { CustomChartPoint } from "./CustomLineChart";

// A ranked breakdown by category — already sorted descending by the server.
// One measure across many categories doesn't need the categorical palette or a
// legend (a single series never does): every bar is the same accent colour, and
// the category name IS the label, so nothing here relies on colour to carry
// identity.
export function CustomBarChart({
  points,
  unit,
  otherCount,
  // See CustomLineChart.tsx for why this is explicit rather than pulled from
  // useCurrency() — this breakdown may be scoped to a filtered country, or to
  // none at all, neither of which is "the viewer's own account country".
  countryCode = null,
}: {
  points: CustomChartPoint[];
  unit: "currency" | "count";
  otherCount: number;
  countryCode?: string | null;
}) {
  const colors = useColors();
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 0.01);
  const fmt = (v: number) => (unit === "currency" ? formatPrice(v, countryCode) : v.toLocaleString());

  return (
    <View style={styles.wrap}>
      {points.map((p) => {
        const isOther = p.bucket === "Other";
        const pct = Math.max(2, (p.value / max) * 100); // 2% floor so a real but tiny value still shows a sliver
        return (
          <View key={p.bucket} style={styles.row}>
            <View style={styles.rowHead}>
              <Text
                style={[
                  styles.rowLabel,
                  { color: isOther ? colors.mutedForeground : colors.foreground },
                  isOther && styles.rowLabelOther,
                ]}
                numberOfLines={1}
              >
                {isOther ? `Other (${otherCount})` : p.bucket}
              </Text>
              <Text style={[styles.rowValue, { color: colors.foreground }]}>{fmt(p.value)}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.secondary }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${pct}%`,
                    backgroundColor: isOther ? colors.mutedForeground : colors.primary,
                    opacity: isOther ? 0.5 : 1,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: { gap: 5 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  rowLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  rowLabelOther: { fontFamily: "Inter_400Regular", fontStyle: "italic" },
  rowValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  track: { height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
});
