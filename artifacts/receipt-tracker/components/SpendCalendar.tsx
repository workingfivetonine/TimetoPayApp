import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { DaySpend } from "@workspace/api-client-react";

interface Props {
  data: DaySpend[];
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMondayWeekday(date: Date): number {
  // 0=Mon, 6=Sun
  return (date.getDay() + 6) % 7;
}

export function SpendCalendar({ data }: Props) {
  const colors = useColors();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const spendByDate = useMemo(() => {
    const map = new Map<string, DaySpend>();
    for (const d of data) map.set(d.date, d);
    return map;
  }, [data]);

  // Max spend in the current month for intensity scaling
  const monthMax = useMemo(() => {
    let max = 0;
    for (const [dateStr, spend] of spendByDate) {
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) {
        max = Math.max(max, spend.total);
      }
    }
    return max;
  }, [spendByDate, year, month]);

  const goBack = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const goForward = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Build calendar grid: days from Mon of first week to Sun of last week
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = getMondayWeekday(firstDay);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = now.toISOString().split("T")[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.foreground }]}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity onPress={goForward} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="chevron-right" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Day labels */}
      <View style={styles.row}>
        {DAY_LABELS.map((l, i) => (
          <View key={i} style={styles.cell}>
            <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>{l}</Text>
          </View>
        ))}
      </View>

      {/* Weeks */}
      {Array.from({ length: cells.length / 7 }, (_, weekIdx) => (
        <View key={weekIdx} style={styles.row}>
          {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;

            const dateStr = date.toISOString().split("T")[0];
            const spend = spendByDate.get(dateStr);
            const isToday = dateStr === todayStr;
            const intensity = spend && monthMax > 0 ? spend.total / monthMax : 0;

            // teal fill: opacity 0.12 → 0.7 based on intensity
            const bgOpacity = intensity > 0 ? 0.12 + intensity * 0.58 : 0;
            const spendColor = `rgba(13, 148, 136, ${bgOpacity})`;

            return (
              <View key={i} style={styles.cell}>
                <View
                  style={[
                    styles.dayCell,
                    spend ? { backgroundColor: spendColor } : null,
                    isToday ? { borderWidth: 1.5, borderColor: colors.primary } : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      {
                        color: isToday ? colors.primary : spend && intensity > 0.6 ? "#fff" : colors.foreground,
                        fontFamily: isToday ? "Inter_700Bold" : "Inter_400Regular",
                      },
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {spend && (
                    <Text
                      style={[
                        styles.spendAmount,
                        { color: intensity > 0.6 ? "#fff" : colors.primary },
                      ]}
                      numberOfLines={1}
                    >
                      ${spend.total >= 100 ? Math.round(spend.total) : spend.total.toFixed(0)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}

      {/* Legend */}
      <View style={[styles.legend, { borderTopColor: colors.border }]}>
        <View style={styles.legendGradient}>
          {[0.12, 0.3, 0.48, 0.65, 0.7].map((op, i) => (
            <View
              key={i}
              style={[styles.legendDot, { backgroundColor: `rgba(13, 148, 136, ${op})` }]}
            />
          ))}
        </View>
        <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
          Less → More spend
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  monthLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    paddingVertical: 6,
  },
  dayCell: {
    width: "100%",
    aspectRatio: 0.82,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    gap: 1,
  },
  dayNumber: {
    fontSize: 12,
  },
  spendAmount: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendGradient: {
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
