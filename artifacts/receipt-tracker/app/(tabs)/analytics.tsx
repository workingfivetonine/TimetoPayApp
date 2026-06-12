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
  Share,
  Alert,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
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
  useDismissItem,
} from "@workspace/api-client-react";
import type { DaySpend, Item } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import { getApiOrigin } from "@/lib/apiBase";
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

type InactiveItem = {
  itemId: number;
  itemName: string;
  icon: string | null;
  category: string | null;
  daysSinceLastPurchase: number;
  lastPurchasedAt: string;
  purchaseCount: number;
};

type CategorySpendItem = {
  category: string;
  totalSpend: number;
  itemCount: number;
  purchaseCount: number;
  percentOfTotal: number;
};

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

  const { getToken } = useAuth();
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const isDesktop = useDesktop();
  const locked = usePremiumLock();

  const { data: analytics, isLoading: analyticsLoading, dataUpdatedAt } = useGetSpendAnalytics();
  const { data: dailySpend, isLoading: calendarLoading } = useGetDailySpend();
  const { data: items } = useListItems();
  const { data: receipts } = useListReceipts();
  const updateItem = useUpdateItem();
  const mergeItem = useMergeItem();
  const dismissItem = useDismissItem();

  const analyticsGet = async <T,>(path: string): Promise<T> => {
    const token = await getToken();
    const res = await fetch(`${getApiOrigin()}/api/analytics/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json() as Promise<T>;
  };

  const { data: inactiveData } = useQuery({
    queryKey: ["analytics", "items", "inactive"],
    queryFn: () =>
      analyticsGet<{ inactive30to60: InactiveItem[]; inactive60plus: InactiveItem[] }>("items/inactive"),
    enabled: activeTab === "items" && !locked,
  });

  const { data: categoryData } = useQuery({
    queryKey: ["analytics", "category-spend"],
    queryFn: () =>
      analyticsGet<{ categories: CategorySpendItem[]; totalSpend: number }>("category-spend"),
    enabled: activeTab === "items" && !locked,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/analytics/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json() as { stores: object[]; items: object[]; lineItems: object[] };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.stores), "Stores");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.items), "Items");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.lineItems), "Purchase History");

      if (Platform.OS === "web") {
        XLSX.writeFile(wb, "TimetoPay_Export.xlsx");
      } else {
        const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
        const fileUri = `${FileSystem.cacheDirectory}TimetoPay_Export.xlsx`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: "Save / Share Excel Export",
          UTI: "com.microsoft.excel.xlsx",
        });
      }
    } catch (err) {
      if (err instanceof Error && err.message !== "Export failed") return;
      Alert.alert("Export failed", "Could not export your data. Please try again.");
    } finally {
      setExporting(false);
    }
  };

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
        <TouchableOpacity
          onPress={handleExport}
          disabled={exporting || !hasData}
          style={styles.exportBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name="download" size={20} color={hasData ? colors.primary : colors.mutedForeground} />
          )}
        </TouchableOpacity>
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
              {/* Budget tracker — shown once 4+ weeks of data exist */}
              {(analytics as typeof analytics & { recommendedWeeklyBudget?: number | null })?.recommendedWeeklyBudget != null && (
                <View style={[styles.budgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.budgetRow}>
                    <Feather name="target" size={15} color={colors.primary} />
                    <Text style={[styles.budgetTitle, { color: colors.foreground }]}>
                      Recommended Weekly Budget
                    </Text>
                  </View>
                  <Text style={[styles.budgetAmount, { color: colors.primary }]}>
                    ${(analytics as typeof analytics & { recommendedWeeklyBudget: number }).recommendedWeeklyBudget.toFixed(2)}
                  </Text>
                  <Text style={[styles.budgetCaption, { color: colors.mutedForeground }]}>
                    Based on your average across {analytics?.weeks.length} weeks of receipts
                  </Text>
                </View>
              )}
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
              {/* Category spend breakdown */}
              {(categoryData?.categories.length ?? 0) > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SPEND BY CATEGORY</Text>
                  {categoryData!.categories.map((cat) => (
                    <View
                      key={cat.category}
                      style={[styles.catRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.catHeader}>
                        <Text style={[styles.catName, { color: colors.foreground }]}>{cat.category}</Text>
                        <Text style={[styles.catAmount, { color: colors.primary }]}>
                          ${cat.totalSpend.toFixed(2)}
                        </Text>
                      </View>
                      <View style={[styles.catBarBg, { backgroundColor: colors.secondary }]}>
                        <View
                          style={[
                            styles.catBar,
                            { backgroundColor: colors.primary, width: `${cat.percentOfTotal}%` },
                          ]}
                        />
                      </View>
                      <Text style={[styles.catMeta, { color: colors.mutedForeground }]}>
                        {cat.percentOfTotal.toFixed(1)}% · {cat.purchaseCount} purchase{cat.purchaseCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {/* Items not purchased in 30-60 days */}
              {(inactiveData?.inactive30to60.filter((i) => !dismissedIds.has(i.itemId)).length ?? 0) > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                    NOT BOUGHT IN 30–60 DAYS
                  </Text>
                  {inactiveData!.inactive30to60
                    .filter((i) => !dismissedIds.has(i.itemId))
                    .map((item) => (
                      <View
                        key={item.itemId}
                        style={[styles.inactiveRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        <Text style={styles.itemRowIcon}>{item.icon || "🛒"}</Text>
                        <View style={styles.inactiveInfo}>
                          <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                            {item.itemName}
                          </Text>
                          <Text style={[styles.inactiveDays, { color: colors.mutedForeground }]}>
                            {item.daysSinceLastPurchase} days ago
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.inlineBtn, { borderColor: colors.border }]}
                          onPress={() => router.push(`/item/${item.itemId}`)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inlineBtnText, { color: colors.primary }]}>History</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.inlineBtn, { borderColor: colors.border }]}
                          onPress={() => {
                            dismissItem.mutate({ id: item.itemId });
                            setDismissedIds((prev) => new Set([...prev, item.itemId]));
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inlineBtnText, { color: colors.mutedForeground }]}>Dismiss</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                </>
              )}

              {/* Items not purchased in 60+ days */}
              {(inactiveData?.inactive60plus.filter((i) => !dismissedIds.has(i.itemId)).length ?? 0) > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                    NOT BOUGHT IN 60+ DAYS
                  </Text>
                  {inactiveData!.inactive60plus
                    .filter((i) => !dismissedIds.has(i.itemId))
                    .map((item) => (
                      <View
                        key={item.itemId}
                        style={[styles.inactiveRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        <Text style={styles.itemRowIcon}>{item.icon || "🛒"}</Text>
                        <View style={styles.inactiveInfo}>
                          <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                            {item.itemName}
                          </Text>
                          <Text style={[styles.inactiveDays, { color: colors.destructive }]}>
                            {item.daysSinceLastPurchase} days ago
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.inlineBtn, { borderColor: colors.border }]}
                          onPress={() => router.push(`/item/${item.itemId}`)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inlineBtnText, { color: colors.primary }]}>History</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.inlineBtn, { borderColor: colors.border }]}
                          onPress={() => {
                            dismissItem.mutate({ id: item.itemId });
                            setDismissedIds((prev) => new Set([...prev, item.itemId]));
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.inlineBtnText, { color: colors.mutedForeground }]}>Dismiss</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                </>
              )}

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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", flex: 1 },
  exportBtn: { padding: 4 },
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
  budgetCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  budgetTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  budgetAmount: { fontSize: 26, fontFamily: "Inter_700Bold" },
  budgetCaption: { fontSize: 12, fontFamily: "Inter_400Regular" },
  catRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 6,
    gap: 6,
  },
  catHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  catAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  catBarBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  catBar: { height: 6, borderRadius: 3 },
  catMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  inactiveRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 6,
    gap: 8,
  },
  inactiveInfo: { flex: 1 },
  inactiveDays: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  inlineBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  inlineBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
