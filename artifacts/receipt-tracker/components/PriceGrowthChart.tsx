import React from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line as SvgLine, Path, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { formatPrice } from "@workspace/geo";

const CHART_H = 190;
const PAD = { left: 54, right: 14, top: 16, bottom: 28 };

// Past this many stores the lines stop being readable and the categorical
// palette runs out of validated slots. The rest fold into the legend's overflow
// note rather than getting invented colours.
const MAX_SERIES = 6;

export interface GrowthPoint {
  date: string;
  price: number;
}

export interface GrowthSeries {
  catalogStoreId: number;
  storeName: string;
  countryCode?: string | null;
  growthPct?: number | null;
  points: GrowthPoint[];
}

function dayMs(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

// One line per store over a real time axis. The x position is the actual date,
// not the point's index, so lines from stores sampled at different times stay
// comparable — indexing by position would silently align a store's 3 purchases
// with another's 12.
export function PriceGrowthChart({
  series,
  countryCode,
  // The reporting window. Every chart in a list shares it, so one item's line
  // can be read against another's instead of each stretching to fill its own
  // date range. Omit to fall back to this item's own extent.
  domainStart,
  domainEnd,
}: {
  series: GrowthSeries[];
  countryCode?: string | null;
  domainStart?: string;
  domainEnd?: string;
}) {
  const colors = useColors();
  const screenW = Dimensions.get("window").width;
  const svgW = Math.max(240, screenW - 72);
  const svgH = CHART_H;

  const shown = series.slice(0, MAX_SERIES);
  const hiddenCount = series.length - shown.length;

  const all = shown.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const times = all.map((p) => dayMs(p.date));
  const prices = all.map((p) => p.price);
  const minT = domainStart ? dayMs(domainStart) : Math.min(...times);
  const maxT = domainEnd ? dayMs(domainEnd) : Math.max(...times);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);

  const cLeft = PAD.left;
  const cRight = svgW - PAD.right;
  const cTop = PAD.top;
  const cBottom = svgH - PAD.bottom;
  const cW = cRight - cLeft;
  const cH = cBottom - cTop;

  // A flat series (one price all along) would give a zero range and divide by
  // zero, so pad it into a readable band centred on the value.
  const priceRange = maxP - minP || Math.max(maxP * 0.1, 0.5);
  const paddedMin = minP - priceRange * 0.15;
  const paddedMax = maxP + priceRange * 0.15;
  const timeRange = maxT - minT || 1;

  const toX = (t: number) => cLeft + ((t - minT) / timeRange) * cW;
  const toY = (price: number) =>
    cBottom - ((price - paddedMin) / (paddedMax - paddedMin)) * cH;

  const yTicks = [minP, maxP];
  if (priceRange > 0.05) yTicks.push((minP + maxP) / 2);

  return (
    <View>
      <Svg width={svgW} height={svgH}>
        {yTicks.map((tick, i) => (
          <SvgLine
            key={`g${i}`}
            x1={cLeft}
            y1={toY(tick)}
            x2={cRight}
            y2={toY(tick)}
            stroke={colors.border}
            strokeWidth={0.6}
            strokeDasharray="3 4"
          />
        ))}
        {yTicks.map((tick, i) => (
          <SvgText
            key={`t${i}`}
            x={cLeft - 5}
            y={toY(tick) + 3.5}
            textAnchor="end"
            fontSize={9.5}
            fill={colors.mutedForeground}
          >
            {formatPrice(tick, countryCode ?? null)}
          </SvgText>
        ))}

        {shown.map((s, si) => {
          const stroke = colors.chartSeries[si % colors.chartSeries.length]!;
          const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
          const d = pts
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"} ${toX(dayMs(p.date)).toFixed(1)} ${toY(p.price).toFixed(1)}`,
            )
            .join(" ");
          return (
            <React.Fragment key={s.catalogStoreId}>
              {pts.length > 1 ? (
                <Path
                  d={d}
                  stroke={stroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ) : null}
              {pts.map((p, i) => (
                <Circle
                  key={i}
                  cx={toX(dayMs(p.date))}
                  cy={toY(p.price)}
                  r={pts.length === 1 ? 5 : 3.5}
                  fill={stroke}
                  // A surface-coloured ring keeps overlapping points from two
                  // stores readable where their lines cross.
                  stroke={colors.card}
                  strokeWidth={1.5}
                />
              ))}
            </React.Fragment>
          );
        })}

        {/* Axis ends label the WINDOW, not this item's first and last purchase —
            otherwise two charts sharing a domain would appear to cover
            different periods. */}
        <SvgText x={cLeft} y={svgH - 6} textAnchor="start" fontSize={9.5} fill={colors.mutedForeground}>
          {shortDate(new Date(minT).toISOString().slice(0, 10))}
        </SvgText>
        <SvgText x={cRight} y={svgH - 6} textAnchor="end" fontSize={9.5} fill={colors.mutedForeground}>
          {shortDate(new Date(maxT).toISOString().slice(0, 10))}
        </SvgText>
      </Svg>

      {/* Legend is mandatory, not decorative: several palette slots fall below
          3:1 against the card, so the store name — never the colour alone —
          carries identity. */}
      <View style={styles.legend}>
        {shown.map((s, si) => (
          <View key={s.catalogStoreId} style={styles.legendRow}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: colors.chartSeries[si % colors.chartSeries.length] },
              ]}
            />
            <Text style={[styles.legendName, { color: colors.foreground }]} numberOfLines={1}>
              {s.storeName}
            </Text>
            {s.growthPct != null ? (
              <Text
                style={[
                  styles.legendPct,
                  { color: s.growthPct > 0 ? colors.priceBad : s.growthPct < 0 ? colors.priceGood : colors.mutedForeground },
                ]}
              >
                {s.growthPct > 0 ? "+" : ""}
                {s.growthPct.toFixed(1)}%
              </Text>
            ) : (
              <Text style={[styles.legendPct, { color: colors.mutedForeground }]}>one price</Text>
            )}
          </View>
        ))}
        {hiddenCount > 0 ? (
          <Text style={[styles.overflow, { color: colors.mutedForeground }]}>
            + {hiddenCount} more store{hiddenCount === 1 ? "" : "s"} not shown
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { marginTop: 10, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendName: { flex: 1, fontSize: 12.5, fontFamily: "Inter_500Medium" },
  legendPct: { fontSize: 12.5, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
  overflow: { fontSize: 11.5, fontFamily: "Inter_400Regular", marginTop: 2 },
});
