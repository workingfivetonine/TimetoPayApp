import React from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line as SvgLine, Path, Rect, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { formatPrice } from "@workspace/geo";
import { ChartTooltip, type TooltipData } from "@/components/ChartTooltip";
import { webHoverProps } from "@/lib/chartHover";

const CHART_H = 190;
const PAD = { left: 54, right: 14, top: 16, bottom: 28 };
const MAX_SERIES_SHOWN = 8; // matches the server's own cap; belt-and-suspenders

export interface CustomChartPoint {
  bucket: string;
  value: number;
}
export interface CustomChartSeries {
  key: string;
  points: CustomChartPoint[];
}

// Buckets are discrete steps (a day/week/month/year), not points on a
// continuous timeline, so — unlike PriceGrowthChart's real date axis — this
// spaces them evenly by their sorted order rather than by elapsed time. That's
// the right model here: two purchases three months apart shouldn't be plotted
// three times farther apart than two purchases one month apart when the x-axis
// is itself a sequence of month buckets.
export function formatBucket(bucket: string, granularity: string): string {
  if (granularity === "year") return bucket;
  if (granularity === "month") {
    const [y, m] = bucket.split("-");
    const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
  }
  // day or week: bucket is a full YYYY-MM-DD. Year is always spelled out (never
  // "Feb 26" for 2026) so it can't be misread as a day of the month.
  const d = new Date(`${bucket}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function CustomLineChart({
  series,
  granularity,
  unit,
  // The country a currency-typed measure should format as. Explicit rather
  // than pulled from useCurrency() (the viewer's OWN account country) — this
  // chart's rows might be scoped to a different country's data entirely via a
  // filter, and there is no per-app "the" currency to fall back on when they
  // aren't scoped to any single one.
  countryCode = null,
}: {
  series: CustomChartSeries[];
  granularity: string;
  unit: "currency" | "count";
  countryCode?: string | null;
}) {
  const colors = useColors();
  // Measured from the card's own rendered width, not the window's — see the
  // identical fix and reasoning in PriceGrowthChart.tsx. Sizing off the window
  // drew this chart far wider than its card on any wide (desktop web) viewport.
  const [containerW, setContainerW] = React.useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== containerW) setContainerW(w);
  };
  const [active, setActive] = React.useState<(TooltipData & { id: string }) | null>(null);

  const shown = series.slice(0, MAX_SERIES_SHOWN);
  const buckets = Array.from(new Set(shown.flatMap((s) => s.points.map((p) => p.bucket)))).sort();
  if (buckets.length === 0) return null;
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]));

  const svgW = Math.max(200, containerW ?? 240);
  const svgH = CHART_H;

  const allValues = shown.flatMap((s) => s.points.map((p) => p.value));
  const minV = Math.min(0, ...allValues); // 0 is always in view — these are counts/sums, never meaningfully negative-only
  const maxV = Math.max(...allValues, 0.01); // avoid a zero range when every value is 0

  const cLeft = PAD.left;
  const cRight = svgW - PAD.right;
  const cTop = PAD.top;
  const cBottom = svgH - PAD.bottom;
  const cW = cRight - cLeft;
  const cH = cBottom - cTop;

  const toX = (i: number) =>
    buckets.length === 1 ? (cLeft + cRight) / 2 : cLeft + (i / (buckets.length - 1)) * cW;
  const toY = (v: number) => cBottom - ((v - minV) / (maxV - minV)) * cH;

  const fmt = (v: number) => (unit === "currency" ? formatPrice(v, countryCode) : v.toLocaleString());

  const yTicks = [minV, maxV];
  if (maxV - minV > 0.02) yTicks.push((minV + maxV) / 2);

  // Show the first, last, and (for a longer axis) one middle bucket label —
  // enough to orient without crowding narrow phone widths.
  const xLabelIdx = buckets.length >= 3 ? [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1] : buckets.length === 2 ? [0, 1] : [0];

  return (
    <View onLayout={onLayout} style={{ overflow: "hidden" }}>
      <Svg width={svgW} height={svgH}>
        {/* Tapping empty chart area dismisses an open tooltip on native, where
            there's no hover to leave. Sits behind everything else. */}
        <Rect x={0} y={0} width={svgW} height={svgH} fill={colors.card} fillOpacity={0.001} onPress={() => setActive(null)} />

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
          <SvgText key={`t${i}`} x={cLeft - 5} y={toY(tick) + 3.5} textAnchor="end" fontSize={9.5} fill={colors.mutedForeground}>
            {fmt(tick)}
          </SvgText>
        ))}

        {shown.map((s, si) => {
          const stroke = colors.chartSeries[si % colors.chartSeries.length]!;
          const pts = [...s.points].sort((a, b) => a.bucket.localeCompare(b.bucket));
          const d = pts
            .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(bucketIndex.get(p.bucket)!).toFixed(1)} ${toY(p.value).toFixed(1)}`)
            .join(" ");
          return (
            <React.Fragment key={s.key}>
              {pts.length > 1 ? (
                <Path d={d} stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ) : null}
              {pts.map((p, i) => {
                const px = toX(bucketIndex.get(p.bucket)!);
                const py = toY(p.value);
                const id = `${s.key}:${p.bucket}`;
                const tooltipLines =
                  shown.length > 1
                    ? [s.key, formatBucket(p.bucket, granularity), fmt(p.value)]
                    : [formatBucket(p.bucket, granularity), fmt(p.value)];
                const toggle = () =>
                  setActive((a) => (a?.id === id ? null : { id, x: px, y: py, lines: tooltipLines, color: stroke }));
                const show = () => setActive({ id, x: px, y: py, lines: tooltipLines, color: stroke });
                const hide = () => setActive((a) => (a?.id === id ? null : a));
                return (
                  <React.Fragment key={i}>
                    <Circle
                      cx={px}
                      cy={py}
                      r={pts.length === 1 ? 5 : 3.5}
                      fill={stroke}
                      stroke={colors.card}
                      strokeWidth={1.5}
                    />
                    {/* Invisible larger hit target — see PriceGrowthChart.tsx
                        for why (a bare 3.5px dot is too small to reliably tap)
                        and how the web hover / native tap split works. */}
                    <Circle cx={px} cy={py} r={12} fill={stroke} fillOpacity={0.001} onPress={toggle} {...webHoverProps(show, hide)} />
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}

        {xLabelIdx.map((i) => (
          <SvgText
            key={i}
            x={toX(i)}
            y={svgH - 6}
            textAnchor={i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle"}
            fontSize={9.5}
            fill={colors.mutedForeground}
          >
            {formatBucket(buckets[i]!, granularity)}
          </SvgText>
        ))}

        {active ? <ChartTooltip data={active} chartWidth={svgW} chartHeight={svgH} /> : null}
      </Svg>

      {/* A single unsplit series needs no legend — the card title already names
          it. Several series always get one; colour never carries identity alone. */}
      {shown.length > 1 ? (
        <View style={styles.legend}>
          {shown.map((s, si) => (
            <View key={s.key} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: colors.chartSeries[si % colors.chartSeries.length] }]} />
              <Text style={[styles.legendName, { color: colors.foreground }]} numberOfLines={1}>
                {s.key}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { marginTop: 10, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendName: { flex: 1, fontSize: 12.5, fontFamily: "Inter_500Medium" },
});
