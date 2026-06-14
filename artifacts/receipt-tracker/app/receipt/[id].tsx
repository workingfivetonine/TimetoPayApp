import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  useGetReceipt,
  useUpdateItem,
  useDeleteLineItem,
  useDeleteReceipt,
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetShoppingListQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
  getListItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { notify, confirmDestructive } from "@/lib/confirm";
import { OfflineBanner } from "@/components/OfflineBanner";
import type { LineItem } from "@workspace/api-client-react";

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editingItem, setEditingItem] = useState<LineItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [pendingDeleteLiId, setPendingDeleteLiId] = useState<number | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const receiptId = parseInt(id ?? "0");
  const { data: receipt, isLoading, dataUpdatedAt } = useGetReceipt(receiptId);
  const updateItemMutation = useUpdateItem();
  const deleteLineItemMutation = useDeleteLineItem();
  const deleteReceiptMutation = useDeleteReceipt();
  const isOnline = useOnlineStatus();

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;

  const handleDeleteReceipt = () => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to delete this receipt.");
      return;
    }
    confirmDestructive({
      title: "Delete Receipt",
      message:
        "This permanently removes this receipt and all its line items. Item price history from this receipt will also be removed. This can't be undone.",
      confirmLabel: "Delete",
      onConfirm: () => {
        deleteReceiptMutation.mutate(
          { id: receiptId },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            },
          }
        );
      },
    });
  };

  const openEdit = (li: LineItem) => {
    setEditingItem(li);
    setEditName(li.itemName);
    setEditNotes("");
    // TODO: fetch item notes from item record
  };

  const handleSaveItemEdit = () => {
    if (!editingItem || !editName.trim()) return;
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to edit items.");
      return;
    }
    updateItemMutation.mutate(
      {
        id: editingItem.itemId,
        data: { name: editName.trim(), notes: editNotes.trim() || undefined },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
          setEditingItem(null);
        },
      }
    );
  };

  const commitDeleteLineItem = (liId: number) => {
    deleteLineItemMutation.mutate(
      { id: liId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
          queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
        },
      },
    );
  };

  const handleDeleteLineItem = async (liId: number) => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to remove items.");
      return;
    }
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
      if (pendingDeleteLiId !== null && pendingDeleteLiId !== liId) {
        commitDeleteLineItem(pendingDeleteLiId);
      }
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingDeleteLiId(liId);
    undoTimerRef.current = setTimeout(() => {
      setPendingDeleteLiId(null);
      undoTimerRef.current = null;
      commitDeleteLineItem(liId);
    }, 4000);
  };

  const handleUndoDeleteLineItem = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingDeleteLiId(null);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!receipt) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Receipt not found</Text>
      </View>
    );
  }

  const date = new Date(receipt.purchasedAt);
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Back button + header */}
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.storeName, { color: colors.foreground }]}>{receipt.storeName}</Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{dateStr}</Text>
        </View>
        <View style={[styles.totalBadge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.totalText, { color: colors.primary }]}>
            ${Number(receipt.total).toFixed(2)}
          </Text>
        </View>
      </View>

      <OfflineBanner lastUpdated={dataUpdatedAt} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Line Items */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>ITEMS</Text>
          {receipt.lineItems.filter((li) => li.id !== pendingDeleteLiId).map((li, idx, arr) => (
            <View
              key={li.id}
              style={[
                styles.lineItem,
                idx < arr.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={styles.lineItemLeft}>
                <Text style={styles.lineItemIcon}>{li.icon || "🛒"}</Text>
                <Text style={[styles.lineItemName, { color: colors.foreground }]} numberOfLines={1}>
                  {li.itemName}
                </Text>
                {li.quantity !== 1 && (
                  <Text style={[styles.lineItemQty, { color: colors.mutedForeground }]}>
                    x{Number(li.quantity)}
                  </Text>
                )}
              </View>
              <View style={styles.lineItemRight}>
                <Text style={[styles.lineItemPrice, { color: colors.foreground }]}>
                  ${Number(li.price).toFixed(2)}
                </Text>
                <TouchableOpacity
                  onPress={() => openEdit(li)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                >
                  <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteLineItem(li.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                >
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {receipt.lineItems.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No line items
            </Text>
          )}
        </View>

        {/* Total summary */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
            <Text style={[styles.totalAmount, { color: colors.foreground }]}>
              ${Number(receipt.total).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Delete receipt */}
        <TouchableOpacity
          style={[styles.deleteBtn, { borderColor: colors.destructive }]}
          onPress={handleDeleteReceipt}
          disabled={deleteReceiptMutation.isPending}
          activeOpacity={0.7}
        >
          <Feather name="trash-2" size={16} color={colors.destructive} />
          <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Delete Receipt</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Undo-delete banner for line items */}
      {pendingDeleteLiId !== null && (
        <View style={[styles.undoBanner, { backgroundColor: colors.foreground }]}>
          <Text style={[styles.undoText, { color: colors.background }]}>Item removed</Text>
          <TouchableOpacity onPress={handleUndoDeleteLineItem} activeOpacity={0.7}>
            <Text style={[styles.undoAction, { color: colors.primary }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Edit Item Modal */}
      <Modal visible={!!editingItem} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setEditingItem(null)}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Item</Text>
            <TouchableOpacity onPress={handleSaveItemEdit}>
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
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Add notes about this item..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  storeName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  date: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  totalBadge: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  totalText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    padding: 14,
    paddingBottom: 8,
  },
  lineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  lineItemLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  lineItemIcon: { fontSize: 17 },
  lineItemName: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  lineItemQty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  lineItemRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  lineItemPrice: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", padding: 14, textAlign: "center" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  totalLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  totalAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
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
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  undoBanner: {
    position: "absolute",
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  undoText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  undoAction: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
