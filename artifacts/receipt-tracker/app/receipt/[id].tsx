import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import {
  useGetReceipt,
  useDeleteReceipt,
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetShoppingListQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
  getListItemsQueryKey,
  getListStoresQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { notify, confirmDestructive } from "@/lib/confirm";
import { getApiOrigin } from "@/lib/apiBase";
import { OfflineBanner } from "@/components/OfflineBanner";
import { StoreNameField } from "@/components/StoreNameField";
import {
  useLineItemEditor,
  LineItemEditModal,
  LineItemUndoBanner,
  lineItemUnit,
} from "@/components/LineItemEditor";

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { format } = useCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { getToken } = useAuth();
  const editor = useLineItemEditor();
  const { pendingDeleteLiId } = editor;
  const [editingStore, setEditingStore] = useState(false);
  const [editStoreName, setEditStoreName] = useState("");
  const [savingStore, setSavingStore] = useState(false);

  const receiptId = parseInt(id ?? "0");
  const { data: receipt, isLoading, dataUpdatedAt } = useGetReceipt(receiptId);
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

  const handleSaveStoreEdit = async () => {
    const name = editStoreName.trim();
    if (!name) {
      notify("Store name required", "Enter a store name.");
      return;
    }
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to change the store.");
      return;
    }
    setSavingStore(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/receipts/${receiptId}/store`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-client-platform": Platform.OS,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ storeName: name }),
      });
      if (!res.ok) throw new Error(`store update ${res.status}`);
      queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
      setEditingStore(false);
    } catch {
      notify("Couldn't save", "Please try again.");
    } finally {
      setSavingStore(false);
    }
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
          <TouchableOpacity
            style={styles.storeNameRow}
            onPress={() => {
              setEditStoreName(receipt.storeName);
              setEditingStore(true);
            }}
            accessibilityLabel="Edit store name"
          >
            <Text style={[styles.storeName, { color: colors.foreground }]} numberOfLines={1}>
              {receipt.storeName}
            </Text>
            <Feather name="edit-2" size={13} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{dateStr}</Text>
        </View>
        <View style={[styles.totalBadge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.totalText, { color: colors.primary }]}>
            {format(Number(receipt.total))}
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
                {(() => {
                  const u = lineItemUnit(li);
                  const q = Number(li.quantity);
                  if (u === "each" && q === 1) return null;
                  return (
                    <Text style={[styles.lineItemQty, { color: colors.mutedForeground }]}>
                      {u === "each" ? `×${q}` : `${q} ${u}`}
                    </Text>
                  );
                })()}
              </View>
              <View style={styles.lineItemRight}>
                <Text style={[styles.lineItemPrice, { color: colors.foreground }]}>
                  {format(Number(li.price))}
                </Text>
                <TouchableOpacity
                  onPress={() => editor.openEdit(li, receiptId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                >
                  <Feather name="edit-2" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editor.requestDelete(li.id, receiptId)}
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
          {(() => {
            // These qualify the total rather than being purchased items, so they
            // sit above it here instead of in the item list.
            const adj = receipt;
            const rows: { label: string; amount: number; negative?: boolean }[] = [];
            if (adj.deliveryFee != null && adj.deliveryFee > 0)
              rows.push({ label: "Delivery / service fee", amount: Number(adj.deliveryFee) });
            if (adj.tax != null && adj.tax > 0) rows.push({ label: "Tax", amount: Number(adj.tax) });
            // Stored as a positive magnitude; shown with a minus so it reads the
            // way it appeared on the receipt.
            if (adj.discount != null && adj.discount > 0)
              rows.push({ label: "Discount", amount: Number(adj.discount), negative: true });
            return rows.map((row) => (
              <View key={row.label} style={[styles.totalRow, { marginBottom: 8 }]}>
                <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
                  {row.negative ? `−${format(row.amount)}` : format(row.amount)}
                </Text>
              </View>
            ));
          })()}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
            <Text style={[styles.totalAmount, { color: colors.foreground }]}>
              {format(Number(receipt.total))}
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

      <LineItemUndoBanner editor={editor} />

      {/* Edit Store Modal — moves THIS receipt to another store (creating it if
          new); it never renames the store other receipts still point at. */}
      <Modal visible={editingStore} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: Platform.OS === "android" ? insets.top + 16 : 16 }]}>
            <TouchableOpacity onPress={() => setEditingStore(false)}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Store</Text>
            <TouchableOpacity onPress={handleSaveStoreEdit} disabled={savingStore}>
              <Text style={[styles.modalSave, { color: colors.primary, opacity: savingStore ? 0.5 : 1 }]}>
                {savingStore ? "Saving…" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STORE</Text>
            <StoreNameField value={editStoreName} onChangeText={setEditStoreName} autoFocus />
            <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
              Only this receipt moves. Other receipts keep their current store.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <LineItemEditModal editor={editor} />
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
  storeNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  storeName: { flexShrink: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
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
  modalHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 12 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 16,
  },
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
});
