import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import {
  useUpdateItem,
  useDeleteLineItem,
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetShoppingListQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
  getListItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { LineItem } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { notify } from "@/lib/confirm";
import { getApiOrigin } from "@/lib/apiBase";
import { UNIT_GROUPS } from "@/lib/units";

const UNDO_WINDOW_MS = 4000;

export function lineItemUnit(li: LineItem): string {
  return (li as { unit?: string | null }).unit ?? "each";
}

export type LineItemEditor = ReturnType<typeof useLineItemEditor>;

// Editing/deleting a receipt's line items, shared by the single-receipt detail
// screen and the post-scan batch review. `receiptId` is passed per action rather
// than fixed at construction, so one editor instance can serve a screen showing
// several receipts at once.
export function useLineItemEditor() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const isOnline = useOnlineStatus();

  const [editing, setEditing] = useState<{ item: LineItem; receiptId: number } | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("each");
  const [saving, setSaving] = useState(false);

  // Deletes are deferred so an accidental tap can be undone; the timer commits
  // it. The row is hidden meanwhile, which is why callers must filter on
  // `pendingDeleteLiId`.
  const [pendingDeleteLiId, setPendingDeleteLiId] = useState<number | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateItemMutation = useUpdateItem();
  const deleteLineItemMutation = useDeleteLineItem();

  // Anything derived from a receipt's items: the receipt itself, the list, the
  // shopping list, and both spend views.
  const invalidateForReceipt = (receiptId: number) => {
    queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  const openEdit = (li: LineItem, receiptId: number) => {
    setEditing({ item: li, receiptId });
    setName(li.itemName);
    setNotes("");
    setPrice(String(Number(li.price)));
    setQty(String(Number(li.quantity)));
    setUnit(lineItemUnit(li));
  };

  const closeEdit = () => setEditing(null);

  const handleSave = async () => {
    if (!editing || !name.trim()) return;
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to edit items.");
      return;
    }
    const priceNum = Number(price);
    const qtyNum = Number(qty);
    if (!isFinite(priceNum) || priceNum < 0) {
      notify("Invalid price", "Enter a valid price.");
      return;
    }
    if (!isFinite(qtyNum) || qtyNum <= 0) {
      notify("Invalid amount", "Enter a valid weight/amount.");
      return;
    }
    setSaving(true);
    try {
      // 1. Item name + notes (catalog record).
      await updateItemMutation.mutateAsync({
        id: editing.item.itemId,
        data: { name: name.trim(), notes: notes.trim() || undefined },
      });
      // 2. This purchase's price / weight / unit (the line item). Raw fetch —
      // the endpoint is newer than the generated client.
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/receipts/line-items/${editing.item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-client-platform": Platform.OS,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ price: priceNum, quantity: qtyNum, unit }),
      });
      if (!res.ok) throw new Error(`line-item update ${res.status}`);
      invalidateForReceipt(editing.receiptId);
      setEditing(null);
    } catch {
      notify("Couldn't save", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const commitDelete = (liId: number, receiptId: number) => {
    deleteLineItemMutation.mutate({ id: liId }, { onSuccess: () => invalidateForReceipt(receiptId) });
  };

  const requestDelete = async (liId: number, receiptId: number) => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to remove items.");
      return;
    }
    // A second delete while one is still pending commits the first — the undo
    // banner only ever refers to the most recent row.
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
      if (pendingDeleteLiId !== null && pendingDeleteLiId !== liId) {
        commitDelete(pendingDeleteLiId, receiptId);
      }
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingDeleteLiId(liId);
    undoTimerRef.current = setTimeout(() => {
      setPendingDeleteLiId(null);
      undoTimerRef.current = null;
      commitDelete(liId, receiptId);
    }, UNDO_WINDOW_MS);
  };

  const undoDelete = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingDeleteLiId(null);
  };

  return {
    editing,
    openEdit,
    closeEdit,
    handleSave,
    saving,
    pendingDeleteLiId,
    requestDelete,
    undoDelete,
    fields: { name, setName, notes, setNotes, price, setPrice, qty, setQty, unit, setUnit },
  };
}

export function LineItemEditModal({ editor }: { editor: LineItemEditor }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { editing, closeEdit, handleSave, saving, fields } = editor;

  return (
    <Modal visible={!!editing} animationType="slide" presentationStyle="formSheet">
      <KeyboardAvoidingView
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.modalHeader,
            {
              borderBottomColor: colors.border,
              paddingTop: Platform.OS === "android" ? insets.top + 16 : 16,
            },
          ]}
        >
          <TouchableOpacity onPress={closeEdit}>
            <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Item</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[styles.modalSave, { color: colors.primary, opacity: saving ? 0.5 : 1 }]}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ITEM NAME</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={fields.name}
            onChangeText={fields.setName}
            placeholder="Item name"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />

          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PRICE</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={fields.price}
                onChangeText={fields.setPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AMOUNT / WEIGHT</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={fields.qty}
                onChangeText={fields.setQty}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>UNIT</Text>
          {UNIT_GROUPS.map((g) => (
            <View key={g.label} style={{ marginBottom: 6 }}>
              <Text style={[styles.unitGroupLabel, { color: colors.mutedForeground }]}>{g.label}</Text>
              <View style={styles.unitChips}>
                {g.units.map((u) => {
                  const active = fields.unit === u;
                  return (
                    <TouchableOpacity
                      key={u}
                      onPress={() => fields.setUnit(u)}
                      style={[
                        styles.unitChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? colors.primaryForeground : colors.mutedForeground,
                          fontSize: 13,
                          fontFamily: "Inter_500Medium",
                        }}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={fields.notes}
            onChangeText={fields.setNotes}
            placeholder="Add notes about this item..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={3}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Transient "Item removed — Undo" bar shown while a delete is still revertible.
export function LineItemUndoBanner({ editor }: { editor: LineItemEditor }) {
  const colors = useColors();
  if (editor.pendingDeleteLiId === null) return null;
  return (
    <View style={[styles.undoBanner, { backgroundColor: colors.foreground }]}>
      <Text style={[styles.undoText, { color: colors.background }]}>Item removed</Text>
      <TouchableOpacity onPress={editor.undoDelete} activeOpacity={0.7}>
        <Text style={[styles.undoAction, { color: colors.primary }]}>Undo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalSave: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalContent: { padding: 20 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  twoCol: { flexDirection: "row", gap: 12 },
  unitGroupLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  unitChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  unitChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  undoBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  undoText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  undoAction: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
