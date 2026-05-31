import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  SectionList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useBrowseCatalog,
  getBrowseCatalogQueryKey,
  useAddCatalogItemToList,
  getGetShoppingListQueryKey,
} from "@workspace/api-client-react";
import type { CatalogBrowseItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";

export default function CatalogBrowseScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useBrowseCatalog();
  const { mutateAsync: addToList } = useAddCatalogItemToList();
  const [pendingId, setPendingId] = React.useState<number | null>(null);

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  const sections = (data?.categories ?? []).map((c) => ({
    title: c.category,
    data: c.items,
  }));

  const handleAdd = async (item: CatalogBrowseItem) => {
    if (item.inList || pendingId != null) return;
    setPendingId(item.catalogItemId);
    try {
      await addToList({ data: { catalogItemId: item.catalogItemId } });
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
          ListHeaderComponent={
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              Prices seen across everyone's receipts. Tap + to add an item to your shopping list.
            </Text>
          }
          ListEmptyComponent={
            <EmptyState
              icon="grid"
              title="Catalog is empty"
              subtitle="Once receipts are scanned, items show up here grouped by category."
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <BrowseRow
              item={item}
              colors={colors}
              pending={pendingId === item.catalogItemId}
              onAdd={() => handleAdd(item)}
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
  onAdd,
}: {
  item: CatalogBrowseItem;
  colors: ReturnType<typeof useColors>;
  pending: boolean;
  onAdd: () => void;
}) {
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
        onPress={onAdd}
        disabled={item.inList || pending}
        activeOpacity={0.7}
        accessibilityLabel={item.inList ? "Already in list" : "Add to shopping list"}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.accentForeground} />
        ) : item.inList ? (
          <Feather name="check" size={18} color={colors.mutedForeground} />
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
