import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useGetSpendAnalytics,
  getGetSpendAnalyticsQueryKey,
  useListItems,
  useListReceipts,
  useGetItemPriceHistory,
  useGetDailySpend,
  getGetDailySpendQueryKey,
  getListItemsQueryKey,
  getGetShoppingListQueryKey,
  useUpdateItem,
  useMergeItem,
} from "@workspace/api-client-react";
import type { DaySpend, Item } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useDesktop } from "@/hooks/useDesktop";
import { usePremiumLock } from "@/hooks/usePremiumLock";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PremiumUpsell } from "@/components/PremiumUpsell";
import { WeeklySpendBar } from "@/components/WeeklySpendBar";
import { EmptyState } from "@/components/EmptyState";
import { SpendCalendar } from "@/components/SpendCalendar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { notify } from "@/lib/confirm";
import { Feather } from "@expo/vector-icons";

type Tab = "calendar" | "items";

function ItemPriceDetail({ itemId, itemName }: { itemId: number; itemName: string }) {
  const colors = useColors();
  const { data } = useGetItemPriceHistory(itemId);

  if (!data) return null;

  return (
    <View style={[styles.itemDetail, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.itemDetailName, { color: colors.foreground }]}>{itemName}</Text>
      <View style={styles.itemDetailStats}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            ${data.lowestPrice.toFixed(2)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Lowest</Text>
          <Text style={[styles.statStore, { color: colors.mutedForeground }]} numberOfLines={1}>
            {data.lowestPriceStoreName}
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>
            ${data.averagePrice.toFixed(2)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Average</Text>
          <Text style={[styles.statStore, { color: colors.mutedForeground }]}>
            {data.pricePoints.length} purchase{data.pricePoints.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: "#dc2626" }]}>
            ${data.highestPrice.toFixed(2)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Highest</Text>
        </View>
      </View>
    </View>
  );
}

export default function AnalyticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("calendar");
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<DaySpend | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editName, setEditName] = useState("");
  const [mergingItem, setMergingItem] = useState<Item | null>(null);

  const { data: analytics, isLoading: analyticsLoading, dataUpdatedAt } = useGetSpendAnalytics();
  const { data: dailySpend, isLoading: calendarLoading } = useGetDailySpend();
  const { data: items } = useListItems();
  const { data: receipts } = useListReceipts();
  const updateItem = useUpdateItem();
  const mergeItem = useMergeItem();

  const isDesktop = useDesktop();
  const locked = usePremiumLock();
  const isOnline = useOnlineStatus();
  const paddingTop = isDesktop ? 32 : Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = isDesktop ? 24 : Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() }),
    ]);
    setRefreshing(false);
  };

  const invalidateItemData = () => {
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
  };

  const maxTotal = Math.max(...(analytics?.weeks.map((w) => w.total) ?? [0]));
  const itemsWithHistory = items?.filter((i) => i.purchaseCount > 0) ?? [];
  const hasData = (analytics?.weeks.length ?? 0) > 0;
  const isLoading = analyticsLoading || calendarLoading;

  const receiptById = React.useMemo(() => {
    const m = new Map<number, { storeName: string; total: number }>();
    for (const r of receipts ?? []) m.set(r.id, { storeName: r.storeName, total: Number(r.total) });
    return m;
  }, [receipts]);

  const openDay = (day: DaySpend) => {
    if (day.receiptIds.length === 1) {
      router.push(`/receipt/${day.receiptIds[0]}`);
    } else if (day.receiptIds.length > 1) {
      setSelectedDay(day);
    }
  };

  const openEdit = (item: Item) => {
    setEditName(item.name);
    setEditingItem(item);
  };

  const saveEdit = () => {
    if (!editingItem || !editName.trim()) return;
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to edit items.");
      return;
    }
    updateItem.mutate(
      { id: editingItem.id, data: { name: editName.trim() } },
      {
        onSuccess: () => {
          invalidateItemData();
          setEditingItem(null);
        },
      }
    );
  };

  const doMerge = (targetId: number) => {
    if (!mergingItem) return;
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to merge items.");
      return;
    }
    mergeItem.mutate(
      { id: mergingItem.id, data: { targetId } },
      {
        onSuccess: () => {
          invalidateItemData();
          setExpandedItemId(null);
          setMergingItem(null);
        },
      }
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Analytics</Text>
      </View>

      {/* Tab Switcher */}
      <View style={[styles.tabBar, { backgroundColor: colors.secondary, marginHorizontal: 16 }]}>
        {(["calendar", "items"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabBtn,
              activeTab === tab && { backgroundColor: colors.card },
            ]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Feather
              name={tab === "calendar" ? "calendar" : "tag"}
              size={14}
              color={activeTab === tab ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab ? colors.primary : colors.mutedForeground },
                activeTab === tab && { fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {tab === "calendar" ? "Calendar" : "Items"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <OfflineBanner lastUpdated={dataUpdatedAt} />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !hasData ? (
        <EmptyState
          icon="bar-chart-2"
          title="No data yet"
          subtitle="Scan receipts to see your spending analytics"
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
          {/* Summary Cards — always visible */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                ${analytics?.weeklyAverage.toFixed(2)}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Weekly avg</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                ${analytics?.totalSpend.toFixed(2)}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total spend</Text>
            </View>
          </View>

          {/* Calendar tab: calendar + weekly totals below */}
          {activeTab === "calendar" && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DAILY SPEND</Text>
              <SpendCalendar
                data={dailySpend ?? []}
                onDayPress={openDay}
                onAddReceipt={() => router.push("/scan")}
              />
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>WEEKLY SPEND</Text>
              {[...(analytics?.weeks ?? [])].reverse().map((week) => (
                <WeeklySpendBar key={week.weekStart} week={week} maxTotal={maxTotal} />
              ))}
            </>
          )}

          {/* Items tab */}
          {activeTab === "items" && locked && (
            <PremiumUpsell
              icon="trending-up"
              title="Per-item price history"
              subtitle="Track how each item's price changes over time — lowest, average, and highest across your receipts. Subscribe to unlock deep price insights."
              compact
            />
          )}
          {activeTab === "items" && !locked && (
            <>
              {itemsWithHistory.length === 0 ? (
                <View style={styles.emptyItems}>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    No item price history yet
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ITEM PRICES</Text>
                  {itemsWithHistory.map((item) => (
                    <View key={item.id}>
                      <TouchableOpacity
                        style={[
                          styles.itemRow,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                        onPress={() =>
                          setExpandedItemId(expandedItemId === item.id ? null : item.id)
                        }
                        activeOpacity={0.7}
                      >
                        <Text style={styles.itemRowIcon}>{item.icon || "🛒"}</Text>
                        <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View style={styles.itemRowRight}>
                          <Text style={[styles.purchaseCount, { color: colors.mutedForeground }]}>
                            {item.purchaseCount}×
                          </Text>
                          <Feather
                            name={expandedItemId === item.id ? "chevron-up" : "chevron-down"}
                            size={16}
                            color={colors.mutedForeground}
                          />
                        </View>
                      </TouchableOpacity>
                      {expandedItemId === item.id && (
                        <>
                          <ItemPriceDetail itemId={item.id} itemName={item.name} />
                          <View style={styles.actionRow}>
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: colors.border }]}
                              onPress={() => router.push(`/item/${item.id}`)}
                              activeOpacity={0.7}
                            >
                              <Feather name="bar-chart-2" size={14} color={colors.primary} />
                              <Text style={[styles.actionText, { color: colors.primary }]}>History</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: colors.border }]}
                              onPress={() => openEdit(item)}
                              activeOpacity={0.7}
                            >
                              <Feather name="edit-2" size={14} color={colors.primary} />
                              <Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { borderColor: colors.border }]}
                              onPress={() => setMergingItem(item)}
                              activeOpacity={0.7}
                            >
                              <Feather name="git-merge" size={14} color={colors.primary} />
                              <Text style={[styles.actionText, { color: colors.primary }]}>Merge</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Day receipts picker (only when a day has multiple receipts) */}
      <Modal visible={!!selectedDay} transparent animationType="fade" onRequestClose={() => setSelectedDay(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedDay(null)}
        >
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              Receipts on this day
            </Text>
            {(selectedDay?.receiptIds ?? []).map((rid) => {
              const r = receiptById.get(rid);
              return (
                <TouchableOpacity
                  key={rid}
                  style={[styles.sheetRow, { borderColor: colors.border }]}
                  onPress={() => {
                    setSelectedDay(null);
                    router.push(`/receipt/${rid}`);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sheetRowName, { color: colors.foreground }]} numberOfLines={1}>
                    {r?.storeName ?? `Receipt #${rid}`}
                  </Text>
                  {r ? (
                    <Text style={[styles.sheetRowAmount, { color: colors.primary }]}>
                      ${r.total.toFixed(2)}
                    </Text>
                  ) : null}
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit item modal */}
      <Modal visible={!!editingItem} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setEditingItem(null)}>
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setEditingItem(null)}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Item</Text>
            <TouchableOpacity onPress={saveEdit} disabled={updateItem.isPending}>
              <Text style={[styles.modalSave, { color: colors.primary }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ITEM NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Item name"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Merge item modal */}
      <Modal visible={!!mergingItem} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setMergingItem(null)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setMergingItem(null)}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Merge Into…</Text>
            <View style={{ width: 50 }} />
          </View>
          <Text style={[styles.mergeHint, { color: colors.mutedForeground }]}>
            Merge "{mergingItem?.name}" into another item. Its purchase history moves over and "
            {mergingItem?.name}" is removed.
          </Text>
          <ScrollView contentContainerStyle={styles.mergeList}>
            {(items ?? [])
              .filter((i) => i.id !== mergingItem?.id)
              .map((target) => (
                <TouchableOpacity
                  key={target.id}
                  style={[styles.sheetRow, { borderColor: colors.border }]}
                  onPress={() => doMerge(target.id)}
                  disabled={mergeItem.isPending}
                  activeOpacity={0.7}
                >
                  <Text style={styles.itemRowIcon}>{target.icon || "🛒"}</Text>
                  <Text style={[styles.sheetRowName, { color: colors.foreground }]} numberOfLines={1}>
                    {target.name}
                  </Text>
                  <Text style={[styles.purchaseCount, { color: colors.mutedForeground }]}>
                    {target.purchaseCount}×
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  tabBar: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    marginBottom: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 16, paddingTop: 12 },
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  summaryValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 6,
  },
  itemRowIcon: { fontSize: 19, marginRight: 10 },
  itemName: { fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
  itemRowRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  purchaseCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  itemDetail: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginBottom: 6,
    marginTop: -4,
  },
  itemDetailName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  itemDetailStats: { flexDirection: "row", alignItems: "center" },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statStore: { fontSize: 10, fontFamily: "Inter_400Regular", maxWidth: 70, textAlign: "center" },
  statDivider: { width: 1, height: 40, marginHorizontal: 4 },
  emptyItems: { alignItems: "center", paddingVertical: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  actionRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
    marginTop: -4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 11,
  },
  actionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  sheet: {
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 4 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  sheetRowName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  sheetRowAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalCancel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  modalSave: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalContent: { padding: 20 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  mergeHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    lineHeight: 18,
  },
  mergeList: { paddingHorizontal: 16, paddingBottom: 40, gap: 6 },
});
