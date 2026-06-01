import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  SectionList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useBrowseCatalog,
  getBrowseCatalogQueryKey,
  useAddCatalogItemToList,
  useDismissItem,
  getGetShoppingListQueryKey,
} from "@workspace/api-client-react";
import type { CatalogBrowseItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";

type SortKey = "category" | "az" | "price" | "store";
type FilterKey = "all" | "history";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "az", label: "A–Z" },
  { key: "price", label: "Price" },
  { key: "store", label: "Store" },
];

function formatSeen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CatalogBrowseScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useBrowseCatalog();
  const { mutateAsync: addToList } = useAddCatalogItemToList();
  const { mutateAsync: dismissItem } = useDismissItem();
  const [pendingId, setPendingId] = React.useState<number | null>(null);
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("category");
  const [filterKey, setFilterKey] = React.useState<FilterKey>("all");

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  const sections = React.useMemo(() => {
    const all: CatalogBrowseItem[] = (data?.categories ?? []).flatMap((c) => c.items);
    const q = query.trim().toLowerCase();
    let filtered = all.filter((it) => {
      if (q && !it.name.toLowerCase().includes(q)) return false;
      if (filterKey === "history" && !it.inHistory) return false;
      return true;
    });

    if (sortKey === "category") {
      // Preserve the server's category grouping/order.
      return (data?.categories ?? [])
        .map((c) => ({
          title: c.category,
          data: c.items.filter((it) => filtered.includes(it)),
        }))
        .filter((s) => s.data.length > 0);
    }

    if (sortKey === "store") {
      const byStore = new Map<string, CatalogBrowseItem[]>();
      for (const it of filtered) {
        const key = it.bestStoreName ?? "No store yet";
        const list = byStore.get(key);
        if (list) list.push(it);
        else byStore.set(key, [it]);
      }
      return Array.from(byStore.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([title, items]) => ({
          title,
          data: items.sort((a, b) => a.name.localeCompare(b.name)),
        }));
    }

    if (sortKey === "price") {
      filtered = [...filtered].sort((a, b) => {
        const ap = a.bestPrice ?? Number.POSITIVE_INFINITY;
        const bp = b.bestPrice ?? Number.POSITIVE_INFINITY;
        return ap - bp;
      });
    } else {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered.length ? [{ title: "", data: filtered }] : [];
  }, [data, query, sortKey, filterKey]);

  const handleToggle = async (item: CatalogBrowseItem) => {
    if (pendingId != null) return;
    setPendingId(item.catalogItemId);
    try {
      if (item.inList && item.userItemId != null) {
        await dismissItem({ id: item.userItemId });
      } else if (!item.inList) {
        await addToList({ data: { catalogItemId: item.catalogItemId } });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getBrowseCatalogQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() }),
      ]);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Browse Catalog</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Find an item…"
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort + filter controls */}
      <View style={styles.controls}>
        {SORT_OPTIONS.map((opt) => {
          const active = sortKey === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.pill,
                { borderColor: colors.border, backgroundColor: active ? colors.primary : colors.card },
              ]}
              onPress={() => setSortKey(opt.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: active ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[
            styles.pill,
            {
              borderColor: colors.border,
              backgroundColor: filterKey === "history" ? colors.primary : colors.card,
            },
          ]}
          onPress={() => setFilterKey(filterKey === "history" ? "all" : "history")}
          activeOpacity={0.7}
        >
          <Feather
            name="clock"
            size={12}
            color={filterKey === "history" ? colors.primaryForeground : colors.mutedForeground}
          />
          <Text
            style={[
              styles.pillText,
              { color: filterKey === "history" ? colors.primaryForeground : colors.mutedForeground },
            ]}
          >
            My history
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState
            icon="alert-triangle"
            title="Unable to load catalog"
            subtitle="Please try again later."
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => String(i.catalogItemId)}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              Prices from items multiple shoppers have bought (we never show whose). Tap + to add an
              item to your shopping list, or the check to remove it.
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon="grid"
              title={query || filterKey === "history" ? "No matching items" : "Catalog is empty"}
              subtitle={
                query || filterKey === "history"
                  ? "Try a different search or filter."
                  : "Once receipts are scanned, items show up here grouped by category."
              }
            />
          }
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {section.title}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <BrowseRow
              item={item}
              colors={colors}
              pending={pendingId === item.catalogItemId}
              onToggle={() => handleToggle(item)}
            />
          )}
        />
      )}
    </View>
  );
}

function BrowseRow({
  item,
  colors,
  pending,
  onToggle,
}: {
  item: CatalogBrowseItem;
  colors: ReturnType<typeof useColors>;
  pending: boolean;
  onToggle: () => void;
}) {
  const seen = formatSeen(item.bestDate);
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
        <Text style={styles.iconText}>{item.icon || "🛒"}</Text>
      </View>
      <View style={styles.left}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.bestStoreName ? (
          <View style={styles.storeRow}>
            <Feather name="map-pin" size={11} color={colors.mutedForeground} />
            <Text style={[styles.storeText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.bestStoreName}
              {seen ? ` · ${seen}` : ""}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.priceCol}>
        {item.bestPrice != null ? (
          <Text style={[styles.price, { color: colors.primary }]}>
            ${item.bestPrice.toFixed(2)}
          </Text>
        ) : (
          <Text style={[styles.noPrice, { color: colors.mutedForeground }]}>—</Text>
        )}
      </View>
      <TouchableOpacity
        style={[
          styles.addBtn,
          {
            backgroundColor: item.inList ? colors.secondary : colors.primary,
            borderColor: item.inList ? colors.border : colors.primary,
          },
        ]}
        onPress={onToggle}
        disabled={pending}
        activeOpacity={0.7}
        accessibilityLabel={item.inList ? "Remove from shopping list" : "Add to shopping list"}
      >
        {pending ? (
          <ActivityIndicator size="small" color={item.inList ? colors.primary : colors.primaryForeground} />
        ) : item.inList ? (
          <Feather name="check" size={18} color={colors.primary} />
        ) : (
          <Feather name="plus" size={18} color={colors.primaryForeground} />
        )}
      </TouchableOpacity>
    </View>
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
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  list: { paddingBottom: 40, maxWidth: 720, width: "100%", alignSelf: "center" },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingVertical: 12 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
  },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { fontSize: 19 },
  left: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: "Inter_500Medium" },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  storeText: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },
  priceCol: { alignItems: "flex-end", minWidth: 60 },
  price: { fontSize: 16, fontFamily: "Inter_700Bold" },
  noPrice: { fontSize: 16, fontFamily: "Inter_400Regular" },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
