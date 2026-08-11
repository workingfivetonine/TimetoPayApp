import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import { useMergeReceipts, useGetReceipt, useListReceipts } from "@workspace/api-client-react";
import {
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import {
  useLineItemEditor,
  LineItemEditModal,
  LineItemUndoBanner,
  lineItemUnit,
  type LineItemEditor,
} from "@/components/LineItemEditor";
import { useStoreEditor, StoreEditModal } from "@/components/StoreEditModal";
import { ZoomableImageModal } from "@/components/ZoomableImageModal";
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

// One expanded card's line items. Split into its own component so the receipt is
// only fetched when the card is actually opened, rather than fetching every
// receipt in the batch up front.
function ReceiptItems({ receiptId, editor }: { receiptId: number; editor: LineItemEditor }) {
  const colors = useColors();
  const { format } = useCurrency();
  const { data: receipt, isLoading } = useGetReceipt(receiptId);

  if (isLoading) {
    return (
      <View style={styles.itemsLoading}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  if (!receipt) return null;

  const items = receipt.lineItems.filter((li) => li.id !== editor.pendingDeleteLiId);
  if (items.length === 0) {
    return (
      <Text style={[styles.itemsEmpty, { color: colors.mutedForeground }]}>No line items</Text>
    );
  }

  return (
    <View style={[styles.itemsWrap, { borderTopColor: colors.border }]}>
      {items.map((li) => (
        <View key={li.id} style={styles.itemRow}>
          <Text style={styles.itemIcon}>{li.icon || "🛒"}</Text>
          <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
            {li.itemName}
          </Text>
          {(() => {
            const u = lineItemUnit(li);
            const q = Number(li.quantity);
            if (u === "each" && q === 1) return null;
            return (
              <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>
                {u === "each" ? `×${q}` : `${q} ${u}`}
              </Text>
            );
          })()}
          <Text style={[styles.itemPrice, { color: colors.foreground }]}>
            {format(Number(li.price))}
          </Text>
          <TouchableOpacity
            onPress={() => editor.openEdit(li, receiptId)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            accessibilityLabel={`Edit ${li.itemName}`}
          >
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => editor.requestDelete(li.id, receiptId)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            accessibilityLabel={`Remove ${li.itemName}`}
          >
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

export default function BatchReviewScreen() {
  const colors = useColors();
  const { format } = useCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [receipts, setReceipts] = useState<BatchReceiptSummary[]>(() => getBatchReceipts());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  // The just-scanned receipt the user wants to fold into one they already had.
  const [mergeIntoSource, setMergeIntoSource] = useState<BatchReceiptSummary | null>(null);

  const editor = useLineItemEditor();
  // Keep the summary card in step with a store rename without refetching the
  // whole batch — the cards are local state, not query data.
  const storeEditor = useStoreEditor((receiptId, storeName) => {
    setReceipts((prev) => {
      const next = prev.map((r) => (r.id === receiptId ? { ...r, storeName } : r));
      setBatchReceipts(next);
      return next;
    });
  });

  const mergeMutation = useMergeReceipts();

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  // Nothing to review (e.g. screen reopened after the batch was cleared).
  if (receipts.length === 0) {
    router.replace("/receipts");
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
    router.replace("/receipts");
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

  // Fold a just-scanned receipt into one the user already had — the case where a
  // receipt arrives in pieces (a second page photographed later, an emailed PDF
  // for a trip already logged). Same endpoint as in-batch merge: earliest
  // purchase date wins and the sources are deleted, so the existing receipt is
  // the one that survives.
  const handleMergeIntoExisting = (targetId: number) => {
    const source = mergeIntoSource;
    if (!source || mergeMutation.isPending) return;

    mergeMutation.mutate(
      { data: { receiptIds: [targetId, source.id] } },
      {
        onSuccess: (merged) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          invalidateAll();
          const mergedSummary: BatchReceiptSummary = {
            id: merged.id,
            storeName: merged.storeName,
            total: merged.total,
            itemCount: merged.lineItems.length,
            purchasedAt: merged.purchasedAt,
          };
          // merged.id is whichever receipt actually survived (server picks by
          // earliest purchase date, not by targetId) — drop the scanned row,
          // then upsert the survivor's fresh totals into the batch list.
          const withoutSource = receipts.filter((r) => r.id !== source.id);
          const next = withoutSource.some((r) => r.id === merged.id)
            ? withoutSource.map((r) => (r.id === merged.id ? mergedSummary : r))
            : [mergedSummary, ...withoutSource];
          setReceipts(next);
          setBatchReceipts(next);
          setSelected((prev) => {
            const s = new Set(prev);
            s.delete(source.id);
            return s;
          });
          setMergeIntoSource(null);
          if (withoutSource.length === 0) {
            clearBatchReceipts();
            router.replace(`/receipt/${merged.id}`);
          }
        },
        onError: () => {
          Alert.alert(
            "Couldn't merge",
            "Something went wrong merging into that receipt. Please try again.",
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
          {receipts.length === 1
            ? "We saved 1 receipt. Tap the page image to check it against what we read, and fix any misread store or items."
            : `We saved ${receipts.length} receipts. Fix any misread store or items, and select two or more that belong together to merge them into one.`}
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

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeaderRow}>
                  {r.previewUri ? (
                    <TouchableOpacity
                      onPress={() => setPreviewUri(r.previewUri ?? null)}
                      activeOpacity={0.8}
                      accessibilityLabel={`View the scanned page for ${r.storeName}`}
                    >
                      <Image
                        source={{ uri: r.previewUri }}
                        style={[styles.preview, { borderColor: colors.border }]}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ) : null}
                  <View style={styles.cardMain}>
                    <TouchableOpacity
                      style={styles.storeNameRow}
                      onPress={() => storeEditor.open(r.id, r.storeName)}
                      accessibilityLabel="Edit store name"
                    >
                      <Text style={[styles.storeName, { color: colors.foreground }]} numberOfLines={1}>
                        {r.storeName}
                      </Text>
                      <Feather name="edit-2" size={12} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                      {formatDate(r.purchasedAt)} · {r.itemCount}{" "}
                      {r.itemCount === 1 ? "item" : "items"}
                    </Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={[styles.total, { color: colors.foreground }]}>
                      {format(r.total)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.cardAction}
                    onPress={() => toggleExpanded(r.id)}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={expanded.has(r.id) ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={[styles.cardActionText, { color: colors.primary }]}>
                      {expanded.has(r.id) ? "Hide items" : "Edit items"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cardAction}
                    onPress={() => setMergeIntoSource(r)}
                    activeOpacity={0.7}
                  >
                    <Feather name="git-merge" size={14} color={colors.primary} />
                    <Text style={[styles.cardActionText, { color: colors.primary }]}>
                      Merge into existing
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cardAction}
                    onPress={() => router.push(`/receipt/${r.id}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cardActionText, { color: colors.mutedForeground }]}>
                      Open
                    </Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {expanded.has(r.id) && <ReceiptItems receiptId={r.id} editor={editor} />}
              </View>
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

      <MergeIntoExistingModal
        source={mergeIntoSource}
        excludeIds={receipts.map((r) => r.id)}
        pending={mergeMutation.isPending}
        onPick={handleMergeIntoExisting}
        onClose={() => setMergeIntoSource(null)}
      />

      <ZoomableImageModal
        visible={previewUri != null}
        uri={previewUri}
        onClose={() => setPreviewUri(null)}
      />

      <LineItemUndoBanner editor={editor} />
      <LineItemEditModal editor={editor} />
      <StoreEditModal editor={storeEditor} />
    </View>
  );
}

// Picks an already-saved receipt to fold a freshly-scanned one into. The
// receipts in this batch are excluded — merging a batch row into another batch
// row is what the checkboxes already do.
function MergeIntoExistingModal({
  source,
  excludeIds,
  pending,
  onPick,
  onClose,
}: {
  source: BatchReceiptSummary | null;
  excludeIds: number[];
  pending: boolean;
  onPick: (targetId: number) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { format } = useCurrency();
  const [query, setQuery] = useState("");
  const { data: all, isLoading } = useListReceipts({
    query: { queryKey: getListReceiptsQueryKey(), enabled: source != null },
  });

  const candidates = React.useMemo(() => {
    const exclude = new Set(excludeIds);
    const q = query.trim().toLowerCase();
    return (all ?? [])
      .filter((r) => !exclude.has(r.id))
      .filter((r) => (q ? (r.storeName ?? "").toLowerCase().includes(q) : true))
      .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());
  }, [all, excludeIds, query]);

  return (
    <Modal
      visible={source != null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Merge into which receipt?
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
            {source
              ? `"${source.storeName}" will be folded into the receipt you pick, and its own row removed.`
              : ""}
          </Text>

          <View
            style={[
              styles.modalSearch,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              style={[styles.modalSearchInput, { color: colors.foreground }]}
              placeholder="Find a receipt by store…"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>

          {isLoading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : candidates.length === 0 ? (
            <Text style={[styles.modalEmpty, { color: colors.mutedForeground }]}>
              {query ? "No receipts match that search." : "You have no other receipts to merge into."}
            </Text>
          ) : (
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {candidates.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.modalRow, { borderBottomColor: colors.border }]}
                  onPress={() => onPick(r.id)}
                  disabled={pending}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.modalRowTitle, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {r.storeName}
                    </Text>
                    <Text style={[styles.modalRowMeta, { color: colors.mutedForeground }]}>
                      {formatDate(r.purchasedAt)}
                    </Text>
                  </View>
                  <Text style={[styles.modalRowTotal, { color: colors.foreground }]}>
                    {format(Number(r.total))}
                  </Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {pending ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  modalSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalSearchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  modalList: { marginTop: 8 },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalRowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalRowMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalRowTotal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalLoading: { padding: 28, alignItems: "center" },
  modalEmpty: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    padding: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  preview: {
    width: 44,
    height: 58,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 10,
  },
  doneText: { fontSize: 16, fontFamily: "Inter_600SemiBold", width: 60, textAlign: "right" },
  scrollContent: { padding: 20, gap: 12 },
  intro: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 4,
  },
  // Cards grow when expanded, so the checkbox aligns to the card's first row
  // rather than drifting to the vertical centre of a tall card.
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: {
    marginTop: 16,
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardMain: { flex: 1, gap: 4 },
  storeNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  storeName: { flexShrink: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  total: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardActionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  itemsWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemIcon: { fontSize: 15 },
  itemName: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  itemQty: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemPrice: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  itemsLoading: { paddingVertical: 16, alignItems: "center" },
  itemsEmpty: { marginTop: 10, fontSize: 13, fontFamily: "Inter_400Regular" },
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
