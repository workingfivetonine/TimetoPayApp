import React from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useGetShoppingList,
  getGetShoppingListQueryKey,
  useMarkRanOut,
  useDismissItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useDesktop } from "@/hooks/useDesktop";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { ShoppingListItemRow } from "@/components/ShoppingListItem";
import { EmptyState } from "@/components/EmptyState";
import { ListControls, type SortOption } from "@/components/ListControls";
import { ShoppingListPdfModal } from "@/components/ShoppingListPdfModal";
import { OfflineBanner } from "@/components/OfflineBanner";
import { notify } from "@/lib/confirm";
import { getApiOrigin } from "@/lib/apiBase";
import type { ShoppingListItem } from "@workspace/api-client-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useUser, useAuth } from "@clerk/expo";

type ShoppingSort = "az" | "price" | "category";
const SHOPPING_SORT: SortOption<ShoppingSort>[] = [
  { key: "az", label: "A–Z" },
  { key: "price", label: "Price" },
  { key: "category", label: "Category" },
];

function filterAndSortShopping(
  arr: ShoppingListItem[],
  query: string,
  sortKey: ShoppingSort,
): ShoppingListItem[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? arr.filter(
        (it) =>
          it.itemName.toLowerCase().includes(q) ||
          (it.category ?? "").toLowerCase().includes(q),
      )
    : [...arr];
  filtered.sort((a, b) => {
    if (sortKey === "price") {
      const ap = a.recommendedPrice ?? a.lowestPrice ?? Number.POSITIVE_INFINITY;
      const bp = b.recommendedPrice ?? b.lowestPrice ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
    } else if (sortKey === "category") {
      const ac = a.category ?? "\uffff";
      const bc = b.category ?? "\uffff";
      const c = ac.localeCompare(bc);
      if (c !== 0) return c;
    }
    return a.itemName.localeCompare(b.itemName);
  });
  return filtered;
}

export default function ShoppingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<number | null>(null);
  const [dismissingItemId, setDismissingItemId] = useState<number | null>(null);
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ShoppingSort>("az");

  const { user } = useUser();
  const { getToken } = useAuth();
  const { data: list, isLoading, dataUpdatedAt } = useGetShoppingList();
  const { mutateAsync: markRanOut } = useMarkRanOut();
  const { mutateAsync: dismissItem } = useDismissItem();
  const isOnline = useOnlineStatus();

  // Undo affordance for the last ran-out/dismiss action.
  const [undo, setUndo] = useState<{ itemId: number; name: string; action: "ranOut" | "dismiss" } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showUndo = (itemId: number, name: string, action: "ranOut" | "dismiss") => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ itemId, name, action });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // Restore an item to the active list (clears ran-out + dismissed). Raw fetch:
  // the endpoint is newer than the generated client.
  const restoreItem = async (itemId: number) => {
    const token = await getToken();
    const res = await fetch(`${getApiOrigin()}/api/items/${itemId}/restore`, {
      method: "POST",
      headers: {
        "x-client-platform": Platform.OS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`restore ${res.status}`);
    await queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
  };

  const isDesktop = useDesktop();
  const paddingTop = isDesktop ? 32 : Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = isDesktop ? 24 : Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    setRefreshing(false);
  };

  const handleRanOut = async (itemId: number, name: string) => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to update your list.");
      return;
    }
    setLoadingItemId(itemId);
    try {
      await markRanOut({ id: itemId });
      await queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
      showUndo(itemId, name, "ranOut");
    } catch {
      notify("Couldn't update", "Something went wrong. Please try again.");
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleDismiss = async (itemId: number, name: string) => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to update your list.");
      return;
    }
    setDismissingItemId(itemId);
    try {
      await dismissItem({ id: itemId });
      await queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
      showUndo(itemId, name, "dismiss");
    } catch {
      notify("Couldn't update", "Something went wrong. Please try again.");
    } finally {
      setDismissingItemId(null);
    }
  };

  // "Buy More" on a ran-out item — restore it to the active list.
  const handleBuyMore = async (itemId: number) => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to update your list.");
      return;
    }
    setLoadingItemId(itemId);
    try {
      await restoreItem(itemId);
    } catch {
      notify("Couldn't update", "Something went wrong. Please try again.");
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleUndo = async () => {
    if (!undo) return;
    const target = undo;
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    try {
      await restoreItem(target.itemId);
    } catch {
      notify("Couldn't undo", "Something went wrong. Please try again.");
    }
  };

  const preparedFor =
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    "";

  const handleOpenPdfModal = () => {
    setPdfModalVisible(true);
  };

  const recurring = useMemo(
    () => filterAndSortShopping(list?.recurring ?? [], query, sortKey),
    [list?.recurring, query, sortKey],
  );
  const oneOff = useMemo(
    () => filterAndSortShopping(list?.oneOff ?? [], query, sortKey),
    [list?.oneOff, query, sortKey],
  );

  const sections: { title: string; subtitle: string; data: ShoppingListItem[] }[] = [
    {
      title: "Regulars",
      subtitle: "Bought 2+ times",
      data: recurring,
    },
    {
      title: "One-offs",
      subtitle: "Bought once",
      data: oneOff,
    },
  ];

  const hasItems = (list?.recurring?.length ?? 0) + (list?.oneOff?.length ?? 0) > 0;
  const matchCount = recurring.length + oneOff.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Shopping List</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.browseButton, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/catalog")}
            accessibilityLabel="Browse catalog"
          >
            <Feather name="grid" size={16} color={colors.accentForeground} />
            <Text style={[styles.browseButtonText, { color: colors.accentForeground }]}>Browse</Text>
          </TouchableOpacity>
          {hasItems && (
            <TouchableOpacity
              style={[styles.downloadButton, { backgroundColor: colors.accent }]}
              onPress={handleOpenPdfModal}
              accessibilityLabel="generate printable shopping list"
            >
              <Feather name="download" size={16} color={colors.accentForeground} />
              <Text style={[styles.downloadButtonText, { color: colors.accentForeground }]}>
                Download
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <OfflineBanner lastUpdated={dataUpdatedAt} />

      {hasItems ? (
        <ListControls
          query={query}
          onQueryChange={setQuery}
          placeholder="Search your list…"
          sortOptions={SHOPPING_SORT}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
        />
      ) : null}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !hasItems ? (
        <EmptyState
          icon="check-square"
          title="No items yet"
          subtitle="Scan receipts to auto-build your shopping list with prices"
        />
      ) : matchCount === 0 ? (
        <EmptyState
          icon="search"
          title="No matching items"
          subtitle="Try a different search."
        />
      ) : (
        <SectionList
          sections={sections.filter((s) => s.data.length > 0)}
          keyExtractor={(item) => String(item.itemId)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={{ paddingBottom }}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                {section.subtitle} · {section.data.length} item{section.data.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.card }}>
              <ShoppingListItemRow
                item={item}
                onPress={() => router.push(`/item/${item.itemId}`)}
                onRanOut={() => handleRanOut(item.itemId, item.itemName)}
                onBuyMore={() => handleBuyMore(item.itemId)}
                ranOutLoading={loadingItemId === item.itemId}
                onDismiss={() => handleDismiss(item.itemId, item.itemName)}
                dismissLoading={dismissingItemId === item.itemId}
              />
            </View>
          )}
          SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
          stickySectionHeadersEnabled
        />
      )}

      <ShoppingListPdfModal
        visible={pdfModalVisible}
        onClose={() => setPdfModalVisible(false)}
        recurring={list?.recurring ?? []}
        oneOff={list?.oneOff ?? []}
        preparedFor={preparedFor}
      />

      {undo ? (
        <View style={[styles.undoBanner, { backgroundColor: colors.foreground }]}>
          <Text style={[styles.undoText, { color: colors.background }]} numberOfLines={1}>
            {undo.action === "ranOut" ? `Marked "${undo.name}" as out` : `Removed "${undo.name}"`}
          </Text>
          <TouchableOpacity onPress={handleUndo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.undoAction, { color: colors.background }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  undoBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 96,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  undoText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  undoAction: { fontSize: 14, fontFamily: "Inter_700Bold" },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  downloadButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  browseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  browseButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
