import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetItemHistory } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ItemHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const itemId = parseInt(id ?? "0");
  const { data, isLoading } = useGetItemHistory(itemId);

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!data) return null;

  const priceSpread = data.history.length > 1 ? data.highestPrice - data.lowestPrice : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
          {data.itemName}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: "#16a34a" }]}>
              ${data.lowestPrice.toFixed(2)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Lowest</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              ${data.averagePrice.toFixed(2)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Average</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: "#dc2626" }]}>
              ${data.highestPrice.toFixed(2)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Highest</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {data.purchaseCount}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Purchases</Text>
          </View>
        </View>

        {/* Price spread indicator */}
        {priceSpread > 0.01 && (
          <View style={[styles.spreadBanner, { backgroundColor: colors.accent, borderColor: colors.border }]}>
            <Feather name="trending-up" size={14} color={colors.primary} />
            <Text style={[styles.spreadText, { color: colors.foreground }]}>
              Price varies by{" "}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                ${priceSpread.toFixed(2)}
              </Text>{" "}
              across purchases
            </Text>
          </View>
        )}

        {/* Purchase history */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          PURCHASE HISTORY
        </Text>

        {data.history.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No purchase history yet</Text>
          </View>
        ) : (
          <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {data.history.map((entry, idx) => {
              const isLast = idx === data.history.length - 1;
              const isLowest = entry.price === data.lowestPrice;
              const isHighest = entry.price === data.highestPrice && data.history.length > 1;
              return (
                <TouchableOpacity
                  key={`${entry.receiptId}-${idx}`}
                  style={[
                    styles.historyRow,
                    !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  onPress={() => router.push(`/receipt/${entry.receiptId}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.historyLeft}>
                    <Text style={[styles.historyDate, { color: colors.foreground }]}>
                      {formatDate(entry.purchasedAt)}
                    </Text>
                    <View style={styles.storeRow}>
                      <Feather name="shopping-bag" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.historyStore, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {entry.storeName}
                      </Text>
                      {entry.quantity > 1 && (
                        <Text style={[styles.historyQty, { color: colors.mutedForeground }]}>
                          ×{entry.quantity}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.historyRight}>
                    <Text
                      style={[
                        styles.historyPrice,
                        {
                          color: isLowest ? "#16a34a" : isHighest ? "#dc2626" : colors.foreground,
                        },
                      ]}
                    >
                      ${entry.price.toFixed(2)}
                    </Text>
                    {isLowest && data.history.length > 1 && (
                      <Text style={[styles.priceBadge, { color: "#16a34a" }]}>lowest</Text>
                    )}
                    {isHighest && (
                      <Text style={[styles.priceBadge, { color: "#dc2626" }]}>highest</Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.border} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4, paddingTop: 2 },
  itemName: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1, lineHeight: 28 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 2,
    alignItems: "center",
  },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  spreadBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  spreadText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  historyCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  historyLeft: { flex: 1, gap: 3 },
  historyDate: { fontSize: 14, fontFamily: "Inter_500Medium" },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  historyStore: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  historyQty: { fontSize: 12, fontFamily: "Inter_400Regular" },
  historyRight: { alignItems: "flex-end", gap: 2 },
  historyPrice: { fontSize: 16, fontFamily: "Inter_700Bold" },
  priceBadge: { fontSize: 10, fontFamily: "Inter_500Medium" },
});
