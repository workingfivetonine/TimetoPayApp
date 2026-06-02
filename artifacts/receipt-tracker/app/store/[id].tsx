import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetStoreSummary, useGetStoreVisits } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { resolveStoreLink } from "@/lib/storeLink";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [visitsExpanded, setVisitsExpanded] = useState(true);
  const [itemsExpanded, setItemsExpanded] = useState(true);

  const storeId = parseInt(id ?? "0");
  const { data: summary, isLoading, dataUpdatedAt } = useGetStoreSummary(storeId);
  const { data: visits } = useGetStoreVisits(storeId);

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!summary) return null;

  const storeLink = resolveStoreLink({
    websiteUrl: summary.websiteUrl,
    storeName: summary.storeName,
    address: summary.address,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.storeName, { color: colors.foreground }]} numberOfLines={1}>
          {summary.storeName}
        </Text>
      </View>

      <OfflineBanner lastUpdated={dataUpdatedAt} />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              ${summary.totalSpend.toFixed(2)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Spent</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              ${summary.averageReceiptTotal.toFixed(2)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Avg Receipt</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{summary.receiptCount}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Visits</Text>
          </View>
        </View>

        {/* Contact / Info Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Store Info</Text>
            </View>
            <TouchableOpacity
              style={[styles.infoRow, { borderTopColor: colors.border }]}
              onPress={() => Linking.openURL(storeLink.url)}
              activeOpacity={0.6}
            >
              <Feather name="shopping-bag" size={15} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.primary }]} numberOfLines={1}>
                {storeLink.isOfficial ? "Visit website" : "Find online"}
              </Text>
              <Feather name="external-link" size={13} color={colors.mutedForeground} />
            </TouchableOpacity>
            {summary.address && (
              <TouchableOpacity
                style={[styles.infoRow, { borderTopColor: colors.border }]}
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(summary.address!)}`)}
                activeOpacity={0.6}
              >
                <Feather name="map-pin" size={15} color={colors.mutedForeground} />
                <Text style={[styles.infoText, { color: colors.foreground }]} numberOfLines={2}>{summary.address}</Text>
                <Feather name="external-link" size={13} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            {summary.phone && (
              <TouchableOpacity
                style={[styles.infoRow, { borderTopColor: colors.border }]}
                onPress={() => Linking.openURL(`tel:${summary.phone}`)}
                activeOpacity={0.6}
              >
                <Feather name="phone" size={15} color={colors.mutedForeground} />
                <Text style={[styles.infoText, { color: colors.foreground }]}>{summary.phone}</Text>
                <Feather name="external-link" size={13} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            {summary.openTimes && (
              <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                <Feather name="clock" size={15} color={colors.mutedForeground} />
                <Text style={[styles.infoText, { color: colors.foreground }]}>{summary.openTimes}</Text>
              </View>
            )}
        </View>

        {/* Delivery Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.deliveryHeader}>
            <Feather name="truck" size={18} color={summary.deliveryAvailable ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Delivery</Text>
            <View style={[styles.badge, { backgroundColor: summary.deliveryAvailable ? colors.accent : colors.secondary }]}>
              <Text style={[styles.badgeText, { color: summary.deliveryAvailable ? colors.primary : colors.mutedForeground }]}>
                {summary.deliveryAvailable ? "Available" : "Not Available"}
              </Text>
            </View>
          </View>
          {summary.deliveryAvailable && (
            <View>
              {summary.deliveryFee != null && (
                <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Delivery Fee</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>${Number(summary.deliveryFee).toFixed(2)}</Text>
                </View>
              )}
              {summary.minimumOrderAmount != null && (
                <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Minimum Order</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>${Number(summary.minimumOrderAmount).toFixed(2)}</Text>
                </View>
              )}
              {summary.deliveryCostBenefitNote && (
                <View style={[styles.benefitNote, { backgroundColor: colors.accent, borderTopColor: colors.border }]}>
                  <Feather name="info" size={14} color={colors.primary} />
                  <Text style={[styles.benefitNoteText, { color: colors.accentForeground }]}>{summary.deliveryCostBenefitNote}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* All Items Bought Here */}
        {visits && visits.uniqueItems.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.cardHeaderRow}
              onPress={() => setItemsExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Feather name="tag" size={16} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                All Items ({visits.uniqueItems.length})
              </Text>
              <Feather name={itemsExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            {itemsExpanded && (
              <View style={[styles.itemsWrap, { borderTopColor: colors.border }]}>
                {visits.uniqueItems.map((name) => (
                  <View key={name} style={[styles.itemChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Text style={[styles.itemChipText, { color: colors.foreground }]}>{name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Visit History */}
        {visits && visits.visits.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.cardHeaderRow}
              onPress={() => setVisitsExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Feather name="calendar" size={16} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Visit History ({visits.visits.length})
              </Text>
              <Feather name={visitsExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            {visitsExpanded &&
              visits.visits.map((visit, vIdx) => {
                const isLastVisit = vIdx === visits.visits.length - 1;
                return (
                  <TouchableOpacity
                    key={visit.receiptId}
                    style={[
                      styles.visitBlock,
                      { borderTopColor: colors.border },
                      !isLastVisit && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => router.push(`/receipt/${visit.receiptId}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.visitHeader}>
                      <View style={[styles.visitDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.visitDate, { color: colors.foreground }]}>
                        {formatDate(visit.purchasedAt)}
                      </Text>
                      <Text style={[styles.visitItemCount, { color: colors.mutedForeground }]}>
                        {visit.items.length} item{visit.items.length !== 1 ? "s" : ""}
                      </Text>
                      <Feather name="chevron-right" size={14} color={colors.border} />
                    </View>
                    <View style={styles.visitItems}>
                      {visit.items.map((li, liIdx) => (
                        <View key={liIdx} style={styles.visitItemRow}>
                          <Text style={[styles.visitItemName, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {li.quantity > 1 ? `${li.quantity}× ` : ""}{li.itemName}
                          </Text>
                          <Text style={[styles.visitItemPrice, { color: colors.mutedForeground }]}>
                            ${li.price.toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
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
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  storeName: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
    alignItems: "center",
  },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
  },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  deliveryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
  },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  benefitNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  benefitNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  // Items chips
  itemsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  itemChipText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  // Visit history
  visitBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  visitHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  visitDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  visitDate: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  visitItemCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  visitItems: { paddingLeft: 15, gap: 3 },
  visitItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  visitItemName: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  visitItemPrice: { fontSize: 13, fontFamily: "Inter_400Regular", marginLeft: 8 },
});
