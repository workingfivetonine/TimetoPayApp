import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useMergeReceipts } from "@workspace/api-client-react";
import {
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import {
  getBatchReceipts,
  setBatchReceipts,
  clearBatchReceipts,
  type BatchReceiptSummary,
} from "@/stores/batchReceipts";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function BatchReviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [receipts, setReceipts] = useState<BatchReceiptSummary[]>(() => getBatchReceipts());
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const mergeMutation = useMergeReceipts();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  // Nothing to review (e.g. screen reopened after the batch was cleared).
  if (receipts.length === 0) {
    router.replace("/(tabs)");
    return null;
  }

  const toggle = (id: number) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const finish = () => {
    clearBatchReceipts();
    router.replace("/(tabs)");
  };

  const handleMerge = () => {
    if (selected.size < 2 || mergeMutation.isPending) return;
    const ids = [...selected];

    mergeMutation.mutate(
      { data: { receiptIds: ids } },
      {
        onSuccess: (merged) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          invalidateAll();

          // Collapse the merged sources into the single returned receipt: drop
          // every selected row, then re-insert the merged receipt's summary.
          const mergedSummary: BatchReceiptSummary = {
            id: merged.id,
            storeName: merged.storeName,
            total: merged.total,
            itemCount: merged.lineItems.length,
            purchasedAt: merged.purchasedAt,
          };
          const remaining = receipts.filter((r) => !selected.has(r.id));
          const next = [mergedSummary, ...remaining];
          setReceipts(next);
          setBatchReceipts(next);
          setSelected(new Set());
        },
        onError: () => {
          Alert.alert(
            "Couldn't merge receipts",
            "Something went wrong merging these receipts. Please try again.",
          );
        },
      },
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
        <View style={{ width: 60 }} />
        <Text style={[styles.title, { color: colors.foreground }]}>Review receipts</Text>
        <TouchableOpacity onPress={finish} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.doneText, { color: colors.primary }]}>Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          We saved {receipts.length} {receipts.length === 1 ? "receipt" : "receipts"}. Select
          two or more that belong together and merge them into one.
        </Text>

        {receipts.map((r) => {
          const isSelected = selected.has(r.id);
          return (
            <View key={r.id} style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.checkbox,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : "transparent",
                  },
                ]}
                onPress={() => toggle(r.id)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {isSelected ? <Feather name="check" size={15} color="#fff" /> : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/receipt/${r.id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.cardMain}>
                  <Text style={[styles.storeName, { color: colors.foreground }]} numberOfLines={1}>
                    {r.storeName}
                  </Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                    {formatDate(r.purchasedAt)} · {r.itemCount}{" "}
                    {r.itemCount === 1 ? "item" : "items"}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={[styles.total, { color: colors.foreground }]}>
                    ${r.total.toFixed(2)}
                  </Text>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      {/* Merge action bar */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.mergeBtn,
            { backgroundColor: selected.size >= 2 ? colors.primary : colors.secondary },
          ]}
          onPress={handleMerge}
          disabled={selected.size < 2 || mergeMutation.isPending}
          activeOpacity={0.85}
        >
          {mergeMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather
                name="git-merge"
                size={18}
                color={selected.size >= 2 ? "#fff" : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.mergeBtnText,
                  { color: selected.size >= 2 ? "#fff" : colors.mutedForeground },
                ]}
              >
                {selected.size >= 2 ? `Merge selected (${selected.size})` : "Select 2+ to merge"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  doneText: { fontSize: 16, fontFamily: "Inter_600SemiBold", width: 60, textAlign: "right" },
  scrollContent: { padding: 20, gap: 12 },
  intro: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardMain: { flex: 1, gap: 4 },
  storeName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  total: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  mergeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  mergeBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
