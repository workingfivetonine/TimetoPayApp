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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAdminGetCustomChartMeta,
  useAdminGetCustomChart,
  getAdminGetCustomChartQueryKey,
  adminGetCustomChartFieldValues,
} from "@workspace/api-client-react";
import type { AdminCustomChartSource, AdminCustomChartField } from "@workspace/api-client-react";
import { countryName } from "@workspace/geo";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";
import { CustomLineChart } from "@/components/CustomLineChart";
import { CustomBarChart } from "@/components/CustomBarChart";
import { PivotTable } from "@/components/PivotTable";

// Fields that represent a country, across the different sources — the same
// concept under two column names (receipts/items join to a store's country;
// users/stores carry it directly). There is no separate "currency" column in
// this app: currency is always derived from a country, so pinning one of these
// fields is what a "currency filter" actually is.
const COUNTRY_FIELD_KEYS = ["storeCountry", "countryCode"];

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
  // Zero or more selected values per category field (e.g. storeCountry ->
  // ["US","GB"], category -> ["Dairy"]) — a value matches if it's ANY of the
  // selected values (OR within a field), ANDed across different fields
  // server-side. An empty/absent array means that field isn't filtered.
  const [filters, setFilters] = React.useState<Record<string, string[]>>({});
  const [openPicker, setOpenPicker] = React.useState<null | {
    title: string;
    options: { key: string; label: string }[];
    onPick: (key: string) => void;
    loading?: boolean;
    // Present only for a filter picker: which field it's toggling, so the
    // modal can read the CURRENT selection live from `filters` on every
    // render rather than from a snapshot that would go stale the moment the
    // first option is tapped.
    fieldKey?: string;
  }>(null);
  const [pickerSearch, setPickerSearch] = React.useState("");
  // Bumped only on a genuinely FRESH picker open, never on the silent update
  // that swaps in field values once they've loaded — so typing a search term
  // while "All" is showing survives the real options arriving a moment later.
  const [pickerGeneration, setPickerGeneration] = React.useState(0);
  const openPickerFresh = (config: NonNullable<typeof openPicker>) => {
    setPickerGeneration((g) => g + 1);
    setOpenPicker(config);
  };
  React.useEffect(() => setPickerSearch(""), [pickerGeneration]);
  // Distinct values already fetched for a given (source, field), so reopening
  // the same filter doesn't refetch. Keyed as a plain string, not nested, since
  // both parts are simple identifiers with no separator collision risk.
  const fieldValuesCache = React.useRef(new Map<string, string[]>());

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
    // Filters from the previous source's fields are meaningless once the field
    // list underneath them has changed, same reasoning as groupBy/measure below.
    setFilters({});
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

  // Whichever of this source's category fields represents a country, if any —
  // and, if the admin has pinned it to EXACTLY one value, that value. This is
  // what lets a currency-typed measure format correctly: with zero selected
  // (unfiltered) or two-plus selected, rows from different countries could
  // still be summed together as if their currencies were interchangeable,
  // which they aren't — only a single pinned country is unambiguous.
  const countryFieldKey = sourceMeta?.categoryFields.find((f) => COUNTRY_FIELD_KEYS.includes(f.key))?.key ?? null;
  const countryFilterValues = countryFieldKey ? filters[countryFieldKey] ?? [] : [];
  const activeCountryCode = countryFilterValues.length === 1 ? countryFilterValues[0]! : null;

  const displayValueLabel = (fieldKey: string, raw: string): string =>
    COUNTRY_FIELD_KEYS.includes(fieldKey) ? countryName(raw) ?? raw : raw;

  const filterSummary = (fieldKey: string): string => {
    const selected = filters[fieldKey] ?? [];
    if (selected.length === 0) return "All";
    if (selected.length === 1) return displayValueLabel(fieldKey, selected[0]!);
    return `${selected.length} selected`;
  };

  const toggleFilterValue = (fieldKey: string, value: string) => {
    setFilters((prev) => {
      const current = prev[fieldKey] ?? [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      const copy = { ...prev };
      if (next.length > 0) copy[fieldKey] = next;
      else delete copy[fieldKey];
      return copy;
    });
  };

  const clearFilter = (fieldKey: string) => {
    setFilters((prev) => {
      if (!(fieldKey in prev)) return prev;
      const copy = { ...prev };
      delete copy[fieldKey];
      return copy;
    });
  };

  const openFilterPicker = async (field: AdminCustomChartField) => {
    if (!source) return;
    const cacheKey = `${source}:${field.key}`;
    const optionsFor = (values: string[]) => values.map((v) => ({ key: v, label: displayValueLabel(field.key, v) }));

    const cached = fieldValuesCache.current.get(cacheKey);
    openPickerFresh({
      title: field.label,
      fieldKey: field.key,
      options: optionsFor(cached ?? []),
      loading: !cached,
      // Toggles, and deliberately does not close the modal — picking several
      // values is the whole point, so each tap applies immediately (the query
      // re-runs live) and the admin closes the sheet themselves when done.
      onPick: (key) => toggleFilterValue(field.key, key),
    });
    if (cached) return;

    try {
      const res = await adminGetCustomChartFieldValues({ source, field: field.key });
      fieldValuesCache.current.set(cacheKey, res.values);
      // Swap the loading placeholder for the real list — via plain
      // setOpenPicker, not openPickerFresh, so it doesn't clear whatever the
      // admin already typed into the search box while this was loading.
      setOpenPicker((prev) =>
        prev && prev.title === field.label
          ? { ...prev, options: optionsFor(res.values), loading: false }
          : prev,
      );
    } catch {
      setOpenPicker((prev) => (prev && prev.title === field.label ? { ...prev, loading: false } : prev));
    }
  };

  const canRun = !!source && !!groupBy && !!aggregation && (!measureRequired || !!measure);

  const queryParams = {
    source: source ?? "",
    groupBy: groupBy ?? "",
    granularity: isDateGroupBy ? granularity : undefined,
    splitBy: isDateGroupBy && splitBy ? splitBy : undefined,
    aggregation,
    measure: measureRequired ? measure ?? undefined : undefined,
    filters: Object.keys(filters).length > 0 ? JSON.stringify(filters) : undefined,
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
              openPickerFresh({
                title: "Data",
                options: meta.sources.map((s) => ({ key: s.key, label: s.label })),
                onPick: (key) => {
                  setSource(key);
                  setOpenPicker(null);
                },
              })
            }
          />

          {sourceMeta && sourceMeta.categoryFields.length > 0 ? (
            <View style={styles.filterGroup}>
              <Text style={[styles.filterGroupLabel, { color: colors.mutedForeground }]}>
                FILTERS (optional)
              </Text>
              {sourceMeta.categoryFields.map((f) => {
                const isCountry = COUNTRY_FIELD_KEYS.includes(f.key);
                const label = isCountry ? `${f.label} (currency)` : f.label;
                return (
                  <PickerRow
                    key={f.key}
                    label={label}
                    value={filterSummary(f.key)}
                    onPress={() => void openFilterPicker(f)}
                  />
                );
              })}
            </View>
          ) : null}

          <PickerRow
            label="Group by"
            value={groupByFields.find((f) => f.key === groupBy)?.label ?? "Choose…"}
            onPress={() =>
              openPickerFresh({
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
                openPickerFresh({
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
                openPickerFresh({
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
              openPickerFresh({
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
                openPickerFresh({
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

          {/* There is no separate currency column — it's always derived from a
              country. Summing money across unfiltered countries would add
              incompatible currencies together as if they were the same unit,
              so this says so rather than silently showing a $ that isn't
              really $ for every row it's summing. */}
          {data?.unit === "currency" && countryFieldKey && !activeCountryCode ? (
            <View style={[styles.warnBanner, { backgroundColor: colors.warningBackground, borderColor: colors.warning }]}>
              <Feather name="alert-triangle" size={13} color={colors.warning} />
              <Text style={[styles.warnText, { color: colors.warning }]}>
                {countryFilterValues.length > 1
                  ? "More than one country selected — amounts are added together without converting currencies. Pick a single country above for a true total."
                  : "No country filter set — if this data spans more than one country, amounts are added together without converting currencies. Filter by country above for a true total."}
              </Text>
            </View>
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
                  <PivotTable series={data.series} granularity={granularity} unit={data.unit} countryCode={activeCountryCode} />
                ) : (
                  <CustomLineChart series={data.series} granularity={granularity} unit={data.unit} countryCode={activeCountryCode} />
                )}
                <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
                  {data.rowCount.toLocaleString()} row{data.rowCount === 1 ? "" : "s"}
                  {data.otherCount > 0 ? ` · ${data.otherCount} more folded into "Other"` : ""}
                </Text>
              </>
            ) : (
              <>
                <CustomBarChart points={data.series[0]?.points ?? []} unit={data.unit} otherCount={data.otherCount} countryCode={activeCountryCode} />
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
              <View style={styles.modalHeaderActions}>
                {openPicker?.fieldKey && (filters[openPicker.fieldKey]?.length ?? 0) > 0 ? (
                  <TouchableOpacity onPress={() => clearFilter(openPicker.fieldKey!)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.modalClearText, { color: colors.primary }]}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setOpenPicker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Search only earns its keep past a handful of options — Math or
                Per never need it, but a filter over 900 item names does. */}
            {(openPicker?.options.length ?? 0) > 6 ? (
              <View style={[styles.modalSearch, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.modalSearchInput, { color: colors.foreground }]}
                  placeholder="Search…"
                  placeholderTextColor={colors.mutedForeground}
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  autoCorrect={false}
                />
              </View>
            ) : null}

            {openPicker?.fieldKey ? (
              <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
                Pick as many as you need — leave none checked for "All".
              </Text>
            ) : null}

            <ScrollView keyboardShouldPersistTaps="handled">
              {(openPicker?.options ?? [])
                .filter((o) => o.label.toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                .map((o) => {
                  const isMulti = !!openPicker?.fieldKey;
                  const isChecked = isMulti ? (filters[openPicker!.fieldKey!] ?? []).includes(o.key) : false;
                  return (
                    <TouchableOpacity
                      key={o.key}
                      style={[styles.modalRow, { borderBottomColor: colors.border }]}
                      onPress={() => openPicker!.onPick(o.key)}
                      activeOpacity={0.7}
                    >
                      {isMulti ? (
                        <Feather
                          name={isChecked ? "check-square" : "square"}
                          size={17}
                          color={isChecked ? colors.primary : colors.mutedForeground}
                          style={styles.modalCheckbox}
                        />
                      ) : null}
                      <Text style={[styles.modalRowText, { color: colors.foreground }]}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              {openPicker?.loading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator color={colors.primary} size="small" />
                </View>
              ) : null}
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
  filterGroup: { gap: 8, marginTop: 4 },
  filterGroupLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, marginLeft: 2 },
  warnBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  warnText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
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
  modalHeaderActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  modalClearText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalHint: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 10 },
  modalSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalSearchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCheckbox: { marginRight: 12 },
  modalRowText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  modalLoading: { padding: 20, alignItems: "center" },
});
