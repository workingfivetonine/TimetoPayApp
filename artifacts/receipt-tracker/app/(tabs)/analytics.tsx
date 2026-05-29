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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetSpendAnalytics,
  getGetSpendAnalyticsQueryKey,
  useListItems,
  useGetItemPriceHistory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { WeeklySpendBar } from "@/components/WeeklySpendBar";
import { EmptyState } from "@/components/EmptyState";
import { Feather } from "@expo/vector-icons";

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
          <Text style={[styles.statValue, { color: colors.spendHighText }]}>
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
  const [refreshing, setRefreshing] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  const { data: analytics, isLoading: analyticsLoading } = useGetSpendAnalytics();
  const { data: items } = useListItems();

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    setRefreshing(false);
  };

  const maxTotal = Math.max(...(analytics?.weeks.map((w) => w.total) ?? [0]));

  const itemsWithHistory = items?.filter((i) => i.purchaseCount > 0) ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Analytics</Text>
      </View>

      {analyticsLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (analytics?.weeks.length ?? 0) === 0 ? (
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
          {/* Summary Cards */}
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

          {/* Weekly Spend Bars */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>WEEKLY SPEND</Text>
          {[...(analytics?.weeks ?? [])].reverse().map((week) => (
            <WeeklySpendBar key={week.weekStart} week={week} maxTotal={maxTotal} />
          ))}

          {/* Item Price History */}
          {itemsWithHistory.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 24 }]}>
                ITEM PRICES
              </Text>
              {itemsWithHistory.map((item) => (
                <View key={item.id}>
                  <TouchableOpacity
                    style={[
                      styles.itemRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() =>
                      setExpandedItemId(expandedItemId === item.id ? null : item.id)
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.itemRowRight}>
                      <Text style={[styles.purchaseCount, { color: colors.mutedForeground }]}>
                        {item.purchaseCount}x
                      </Text>
                      <Feather
                        name={expandedItemId === item.id ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.mutedForeground}
                      />
                    </View>
                  </TouchableOpacity>
                  {expandedItemId === item.id && (
                    <ItemPriceDetail itemId={item.id} itemName={item.name} />
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
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
  spendHighText: {},
});
