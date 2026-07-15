import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAdminGetGlobalPrices } from "@workspace/api-client-react";
import type { CatalogGlobalItem } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";
import { ListControls, type SortOption } from "@/components/ListControls";
import { formatPrice, countryName } from "@workspace/geo";

// The generated CatalogGlobalItem type is drifted and lacks the new country
// fields the API now returns; read them through these narrow casts.
const storeCountry = (s: unknown): string | null =>
  (s as { countryCode?: string | null }).countryCode ?? null;
const itemCountry = (it: unknown): string | null =>
  (it as { overallLatestStoreCountry?: string | null }).overallLatestStoreCountry ?? null;

type GlobalSort = "az" | "price" | "recent";
const GLOBAL_SORT: SortOption<GlobalSort>[] = [
  { key: "az", label: "A–Z" },
  { key: "price", label: "Price" },
  { key: "recent", label: "Recent" },
];

export default function AdminGlobalPricesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useAdminGetGlobalPrices();
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({});
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<GlobalSort>("az");
  const [country, setCountry] = React.useState<string | null>(null); // null = all countries

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  const hasData = (data?.length ?? 0) > 0;

  // Countries present in the data, for the filter chips.
  const countries = React.useMemo(() => {
    const set = new Set<string>();
    for (const it of data ?? []) {
      for (const s of it.stores) {
        const c = storeCountry(s);
        if (c) set.add(c);
      }
    }
    return Array.from(set).sort();
  }, [data]);

  // Augment each item with the price/store/country to DISPLAY. When a country
  // is selected we keep only that country's stores and headline the lowest of
  // them (stores arrive sorted ascending by price); otherwise we use the
  // cross-country "overall latest".
  const visible = React.useMemo(() => {
    const base = (data ?? []).map((it) => {
      if (country) {
        const stores = it.stores.filter((s) => storeCountry(s) === country);
        if (stores.length === 0) return null;
        return { ...it, stores, _price: stores[0].latestPrice, _storeName: stores[0].storeName, _country: country };
      }
      return {
        ...it,
        _price: it.overallLatestPrice,
        _storeName: it.overallLatestStoreName,
        _country: itemCountry(it),
      };
    });
    const all = base.filter((x): x is NonNullable<typeof x> => x !== null);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((it) => it.name.toLowerCase().includes(q) || it._storeName.toLowerCase().includes(q))
      : all;
    filtered.sort((a, b) => {
      if (sortKey === "price") return a._price - b._price;
      if (sortKey === "recent")
        return new Date(b.overallLatestDate).getTime() - new Date(a.overallLatestDate).getTime();
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [data, query, sortKey, country]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Global Prices</Text>
        <View style={styles.backBtn} />
      </View>

      {hasData ? (
        <ListControls
          query={query}
          onQueryChange={setQuery}
          placeholder="Search items or stores…"
          sortOptions={GLOBAL_SORT}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
        />
      ) : null}

      {hasData && countries.length > 1 ? (
        <View style={styles.chipRow}>
          {[null, ...countries].map((c) => {
            const active = country === c;
            return (
              <TouchableOpacity
                key={c ?? "all"}
                onPress={() => setCountry(c)}
                style={[
                  styles.chip,
                  { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                  {c ? countryName(c) ?? c : "All countries"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState icon="alert-triangle" title="Unable to load prices" subtitle="You may not have admin access." />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(i) => String(i.catalogItemId)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              Most recent price per item across all users. Tap a card for per-store prices.
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon="tag"
              title={query ? "No matching items" : "No prices yet"}
              subtitle={query ? "Try a different search." : "Once users scan receipts, prices show up here."}
            />
          }
          renderItem={({ item }) => (
            <PriceCard
              item={item}
              colors={colors}
              expanded={!!expanded[item.catalogItemId]}
              onToggle={() =>
                setExpanded((e) => ({ ...e, [item.catalogItemId]: !e[item.catalogItemId] }))
              }
            />
          )}
        />
      )}
    </View>
  );
}

function PriceCard({
  item,
  colors,
  expanded,
  onToggle,
}: {
  item: CatalogGlobalItem & { _price: number; _storeName: string; _country: string | null };
  colors: ReturnType<typeof useColors>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.7}
      onPress={onToggle}
    >
      <View style={styles.cardTop}>
        <Text style={styles.icon}>{item.icon ?? "🛒"}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item._storeName} · {new Date(item.overallLatestDate).toLocaleDateString()}
          </Text>
        </View>
        <Text style={[styles.price, { color: colors.primary }]}>
          {formatPrice(item._price, item._country)}
        </Text>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.mutedForeground}
          style={{ marginLeft: 6 }}
        />
      </View>

      {expanded ? (
        <View style={[styles.stores, { borderTopColor: colors.border }]}>
          {item.stores.map((s, idx) => (
            <View key={s.catalogStoreId} style={styles.storeRow}>
              <Text style={[styles.storeName, { color: colors.foreground }]} numberOfLines={1}>
                {s.storeName}
                {storeCountry(s) ? (
                  <Text style={{ color: colors.mutedForeground }}> · {storeCountry(s)}</Text>
                ) : null}
              </Text>
              {idx === 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.badgeText, { color: colors.accentForeground }]}>Lowest</Text>
                </View>
              ) : null}
              <Text
                style={[
                  styles.storePrice,
                  { color: idx === 0 ? colors.priceGood : colors.foreground },
                ]}
              >
                {formatPrice(s.latestPrice, storeCountry(s))}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { padding: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { fontSize: 24 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  price: { fontSize: 17, fontFamily: "Inter_700Bold" },
  stores: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  storeName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  storePrice: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});
