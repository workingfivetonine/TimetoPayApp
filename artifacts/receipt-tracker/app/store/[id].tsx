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
import { useGetStoreSummary } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const storeId = parseInt(id ?? "0");
  const { data: summary, isLoading } = useGetStoreSummary(storeId);

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!summary) return null;

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
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Receipts</Text>
          </View>
        </View>

        {/* Delivery Section */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.deliveryHeader}>
            <Feather
              name="truck"
              size={18}
              color={summary.deliveryAvailable ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Delivery</Text>
            <View
              style={[
                styles.deliveryBadge,
                {
                  backgroundColor: summary.deliveryAvailable ? colors.accent : colors.secondary,
                },
              ]}
            >
              <Text
                style={[
                  styles.deliveryBadgeText,
                  { color: summary.deliveryAvailable ? colors.primary : colors.mutedForeground },
                ]}
              >
                {summary.deliveryAvailable ? "Available" : "Not Available"}
              </Text>
            </View>
          </View>

          {summary.deliveryAvailable && (
            <View style={styles.deliveryDetails}>
              {summary.deliveryFee != null && (
                <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                    Delivery Fee
                  </Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>
                    ${Number(summary.deliveryFee).toFixed(2)}
                  </Text>
                </View>
              )}
              {summary.minimumOrderAmount != null && (
                <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                    Minimum Order
                  </Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>
                    ${Number(summary.minimumOrderAmount).toFixed(2)}
                  </Text>
                </View>
              )}
              {summary.deliveryCostBenefitNote && (
                <View
                  style={[
                    styles.benefitNote,
                    { backgroundColor: colors.accent, borderTopColor: colors.border },
                  ]}
                >
                  <Feather name="info" size={14} color={colors.primary} />
                  <Text style={[styles.benefitNoteText, { color: colors.accentForeground }]}>
                    {summary.deliveryCostBenefitNote}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
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
  deliveryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
  },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  deliveryBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  deliveryBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  deliveryDetails: {},
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
});
