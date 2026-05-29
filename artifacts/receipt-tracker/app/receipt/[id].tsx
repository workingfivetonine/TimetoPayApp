import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetShoppingListQueryKey,
  getGetSpendAnalyticsQueryKey,
  getListItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
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

  const receiptId = parseInt(id ?? "0");
  const { data: receipt, isLoading } = useGetReceipt(receiptId);
  const updateItemMutation = useUpdateItem();
  const deleteLineItemMutation = useDeleteLineItem();

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;

  const openEdit = (li: LineItem) => {
    setEditingItem(li);
    setEditName(li.itemName);
    setEditNotes("");
    // TODO: fetch item notes from item record
  };

  const handleSaveItemEdit = () => {
    if (!editingItem || !editName.trim()) return;
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

  const handleDeleteLineItem = (liId: number) => {
    Alert.alert("Remove Item", "Remove this line item from the receipt?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          deleteLineItemMutation.mutate(
            { id: liId },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
                queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
                queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
                queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
                queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              },
            }
          );
        },
      },
    ]);
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

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Line Items */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>ITEMS</Text>
          {receipt.lineItems.map((li, idx) => (
            <View
              key={li.id}
              style={[
                styles.lineItem,
                idx < receipt.lineItems.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={styles.lineItemLeft}>
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
      </ScrollView>

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
});
