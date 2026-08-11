import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import { formatBucket } from "@/components/CustomLineChart";
import type { CustomChartSeries } from "@/components/CustomLineChart";

const ROW_H = 34;
const LABEL_W = 128;
const COL_W = 84;

// Several lines crossing over a handful of points reads as noise, not
// information — the more series there are, the truer that gets. A grid of the
// exact numbers says the same thing precisely instead of asking the eye to
// untangle which colour did what. Used whenever a time chart has more than one
// series; a single line stays a line chart, where a trend is the whole point.
export function PivotTable({
  series,
  granularity,
  unit,
}: {
  series: CustomChartSeries[];
  granularity: string;
  unit: "currency" | "count";
}) {
  const colors = useColors();
  const { format } = useCurrency();
  const fmt = (v: number) => (unit === "currency" ? format(v) : v.toLocaleString());

  const buckets = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.bucket)))).sort();

  if (buckets.length === 0 || series.length === 0) return null;

  // Nested by series key then bucket, rather than a single string-joined key —
  // a series key is a free-text item/category name, so it could in principle
  // contain any separator character a joined key might pick.
  const cellsBySeries = new Map<string, Map<string, number>>();
  for (const s of series) {
    const byBucket = new Map<string, number>();
    for (const p of s.points) byBucket.set(p.bucket, p.value);
    cellsBySeries.set(s.key, byBucket);
  }

  return (
    <View style={styles.wrap}>
      {/* Row labels sit outside the horizontal scroll, so they stay in view
          while the numbers scroll underneath — the usual pivot-table shape. */}
      <View style={{ width: LABEL_W }}>
        <View style={[styles.headCell, { width: LABEL_W, borderBottomColor: colors.border }]} />
        {series.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.labelCell,
              { borderBottomColor: colors.border, backgroundColor: i % 2 ? colors.card : "transparent" },
            ]}
          >
            <Text style={[styles.labelText, { color: colors.foreground }]} numberOfLines={1}>
              {s.key}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ flexDirection: "row" }}>
          {buckets.map((b) => (
            <View key={b} style={{ width: COL_W }}>
              <View style={[styles.headCell, { width: COL_W, borderBottomColor: colors.border }]}>
                <Text style={[styles.headText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {formatBucket(b, granularity)}
                </Text>
              </View>
              {series.map((s, i) => {
                const v = cellsBySeries.get(s.key)?.get(b);
                return (
                  <View
                    key={s.key}
                    style={[
                      styles.valueCell,
                      { borderBottomColor: colors.border, backgroundColor: i % 2 ? colors.card : "transparent" },
                    ]}
                  >
                    <Text style={[styles.valueText, { color: v == null ? colors.mutedForeground : colors.foreground }]}>
                      {v == null ? "—" : fmt(v)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row" },
  headCell: {
    height: ROW_H,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1.5,
    paddingHorizontal: 6,
  },
  headText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  labelCell: {
    height: ROW_H,
    justifyContent: "center",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  labelText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  valueCell: {
    height: ROW_H,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  valueText: { fontSize: 12, fontFamily: "Inter_500Medium", fontVariant: ["tabular-nums"] },
});
