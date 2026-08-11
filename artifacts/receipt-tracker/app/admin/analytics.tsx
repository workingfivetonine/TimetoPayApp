import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAdminGetCustomChartMeta,
  useAdminGetCustomChart,
  getAdminGetCustomChartQueryKey,
} from "@workspace/api-client-react";
import type { AdminCustomChartSource, AdminCustomChartField } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";
import { CustomLineChart } from "@/components/CustomLineChart";
import { CustomBarChart } from "@/components/CustomBarChart";
import { PivotTable } from "@/components/PivotTable";

type Aggregation = "count" | "sum" | "avg" | "min" | "max";
type Granularity = "day" | "week" | "month" | "year";

const AGGREGATION_LABELS: Record<Aggregation, string> = {
  count: "Count",
  sum: "Total",
  avg: "Average",
  min: "Lowest",
  max: "Highest",
};
const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
};

// A field from the meta response, tagged with which list it came from so a
// single flat picker can offer both date and category fields for "Group by".
interface TaggedField extends AdminCustomChartField {
  kind: "date" | "category";
}

export default function AdminAnalyticsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: meta, isLoading: metaLoading, error: metaError } = useAdminGetCustomChartMeta();

  const [source, setSource] = React.useState<string | null>(null);
  const [groupBy, setGroupBy] = React.useState<string | null>(null);
  const [granularity, setGranularity] = React.useState<Granularity>("month");
  const [splitBy, setSplitBy] = React.useState<string | null>(null);
  const [aggregation, setAggregation] = React.useState<Aggregation>("sum");
  const [measure, setMeasure] = React.useState<string | null>(null);
  const [openPicker, setOpenPicker] = React.useState<null | {
    title: string;
    options: { key: string; label: string }[];
    onPick: (key: string) => void;
  }>(null);

  const sourceMeta: AdminCustomChartSource | undefined = meta?.sources.find((s) => s.key === source);

  // Seed sensible defaults once the meta loads, and re-seed whenever the
  // source changes — a groupBy/measure from the PREVIOUS source is meaningless
  // once the field list underneath it has changed.
  React.useEffect(() => {
    if (!meta || meta.sources.length === 0) return;
    if (source && meta.sources.some((s) => s.key === source)) return;
    const first = meta.sources[0]!;
    setSource(first.key);
  }, [meta, source]);

  React.useEffect(() => {
    if (!sourceMeta) return;
    setGroupBy(sourceMeta.dateFields[0]?.key ?? sourceMeta.categoryFields[0]?.key ?? null);
    setSplitBy(null);
    if (sourceMeta.measureFields.length > 0) {
      setAggregation("sum");
      setMeasure(sourceMeta.measureFields[0]!.key);
    } else {
      setAggregation("count");
      setMeasure(null);
    }
    // Deliberately re-runs only when the SOURCE changes, not on every meta
    // refetch — resetting the user's picks whenever the query silently
    // revalidates in the background would be a worse experience than a stale
    // field list for the rare case the whitelist itself changes at runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const isDateGroupBy = !!sourceMeta?.dateFields.some((f) => f.key === groupBy);
  const groupByFields: TaggedField[] = sourceMeta
    ? [
        ...sourceMeta.dateFields.map((f) => ({ ...f, kind: "date" as const })),
        ...sourceMeta.categoryFields.map((f) => ({ ...f, kind: "category" as const })),
      ]
    : [];
  const splitByFields = sourceMeta?.categoryFields.filter((f) => f.key !== groupBy) ?? [];
  const aggregationOptions: Aggregation[] =
    sourceMeta && sourceMeta.measureFields.length > 0 ? ["count", "sum", "avg", "min", "max"] : ["count"];
  const measureRequired = aggregation !== "count";
  const measureField = sourceMeta?.measureFields.find((f) => f.key === measure);

  // Split-by only means anything against a date axis (several lines over time).
  // Switching groupBy to a category field makes any chosen split stale.
  React.useEffect(() => {
    if (!isDateGroupBy) setSplitBy(null);
  }, [isDateGroupBy]);

  const canRun = !!source && !!groupBy && !!aggregation && (!measureRequired || !!measure);

  const queryParams = {
    source: source ?? "",
    groupBy: groupBy ?? "",
    granularity: isDateGroupBy ? granularity : undefined,
    splitBy: isDateGroupBy && splitBy ? splitBy : undefined,
    aggregation,
    measure: measureRequired ? measure ?? undefined : undefined,
  };

  const { data, isFetching, error } = useAdminGetCustomChart(queryParams, {
    query: { queryKey: getAdminGetCustomChartQueryKey(queryParams), enabled: canRun },
  });

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Build a Chart</Text>
        <View style={styles.backBtn} />
      </View>

      {metaLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : metaError || !meta ? (
        <View style={styles.center}>
          <EmptyState icon="alert-triangle" title="Unable to load chart options" subtitle="You may not have admin access." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            Pick what to look at and how to add it up. Grouping by a date draws a
            line over time; grouping by anything else draws a ranked breakdown.
          </Text>

          <PickerRow
            label="Data"
            value={sourceMeta?.label ?? "Choose…"}
            onPress={() =>
              setOpenPicker({
                title: "Data",
                options: meta.sources.map((s) => ({ key: s.key, label: s.label })),
                onPick: (key) => {
                  setSource(key);
                  setOpenPicker(null);
                },
              })
            }
          />

          <PickerRow
            label="Group by"
            value={groupByFields.find((f) => f.key === groupBy)?.label ?? "Choose…"}
            onPress={() =>
              setOpenPicker({
                title: "Group by",
                options: groupByFields.map((f) => ({
                  key: f.key,
                  label: f.kind === "date" ? `${f.label} (over time)` : f.label,
                })),
                onPick: (key) => {
                  setGroupBy(key);
                  setOpenPicker(null);
                },
              })
            }
          />

          {isDateGroupBy ? (
            <PickerRow
              label="Per"
              value={GRANULARITY_LABELS[granularity]}
              onPress={() =>
                setOpenPicker({
                  title: "Per",
                  options: (["day", "week", "month", "year"] as Granularity[]).map((g) => ({
                    key: g,
                    label: GRANULARITY_LABELS[g],
                  })),
                  onPick: (key) => {
                    setGranularity(key as Granularity);
                    setOpenPicker(null);
                  },
                })
              }
            />
          ) : null}

          {isDateGroupBy && splitByFields.length > 0 ? (
            <PickerRow
              label="Split into lines by"
              value={splitByFields.find((f) => f.key === splitBy)?.label ?? "None"}
              onPress={() =>
                setOpenPicker({
                  title: "Split into lines by",
                  options: [{ key: "", label: "None" }, ...splitByFields.map((f) => ({ key: f.key, label: f.label }))],
                  onPick: (key) => {
                    setSplitBy(key || null);
                    setOpenPicker(null);
                  },
                })
              }
            />
          ) : null}

          <PickerRow
            label="Math"
            value={AGGREGATION_LABELS[aggregation]}
            onPress={() =>
              setOpenPicker({
                title: "Math",
                options: aggregationOptions.map((a) => ({ key: a, label: AGGREGATION_LABELS[a] })),
                onPick: (key) => {
                  setAggregation(key as Aggregation);
                  setOpenPicker(null);
                },
              })
            }
          />

          {measureRequired ? (
            <PickerRow
              label="Of"
              value={measureField?.label ?? "Choose…"}
              onPress={() =>
                setOpenPicker({
                  title: "Of",
                  options: (sourceMeta?.measureFields ?? []).map((f) => ({ key: f.key, label: f.label })),
                  onPick: (key) => {
                    setMeasure(key);
                    setOpenPicker(null);
                  },
                })
              }
            />
          ) : null}

          <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {isFetching ? (
              <View style={styles.chartCenter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : error ? (
              <View style={styles.chartCenter}>
                <EmptyState
                  icon="alert-triangle"
                  title="Couldn't build that chart"
                  subtitle="Try a different combination."
                />
              </View>
            ) : !data || data.series.every((s) => s.points.length === 0) ? (
              <View style={styles.chartCenter}>
                <EmptyState icon="bar-chart-2" title="No data yet" subtitle="Try a different combination, or check back once there's more history." />
              </View>
            ) : data.kind === "time" ? (
              <>
                {/* Several lines crossing over a handful of points each reads
                    as noise, not a trend — a pivot table says the same numbers
                    precisely instead of asking the eye to untangle crossing
                    lines. A single, unsplit series stays a line chart, where a
                    trend over time is exactly the point. */}
                {data.series.length > 1 ? (
                  <PivotTable series={data.series} granularity={granularity} unit={data.unit} />
                ) : (
                  <CustomLineChart series={data.series} granularity={granularity} unit={data.unit} />
                )}
                <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
                  {data.rowCount.toLocaleString()} row{data.rowCount === 1 ? "" : "s"}
                  {data.otherCount > 0 ? ` · ${data.otherCount} more folded into "Other"` : ""}
                </Text>
              </>
            ) : (
              <>
                <CustomBarChart points={data.series[0]?.points ?? []} unit={data.unit} otherCount={data.otherCount} />
                <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
                  {data.rowCount.toLocaleString()} row{data.rowCount === 1 ? "" : "s"}
                  {data.otherCount > 0 ? ` · ${data.otherCount} more categories folded into "Other"` : ""}
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={openPicker != null} transparent animationType="slide" onRequestClose={() => setOpenPicker(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{openPicker?.title}</Text>
              <TouchableOpacity onPress={() => setOpenPicker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {openPicker?.options.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.modalRow, { borderBottomColor: colors.border }]}
                  onPress={() => openPicker.onPick(o.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalRowText, { color: colors.foreground }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PickerRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.pickerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.pickerValueRow}>
        <Text style={[styles.pickerValue, { color: colors.foreground }]}>{value}</Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 10, maxWidth: 720, width: "100%", alignSelf: "center", paddingBottom: 40 },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 6 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  pickerValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pickerValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  chartCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 8, minHeight: 220 },
  chartCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  footnote: { fontSize: 11.5, fontFamily: "Inter_400Regular", marginTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { maxHeight: "70%", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalRow: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalRowText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
