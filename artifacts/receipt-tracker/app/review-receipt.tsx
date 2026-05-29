import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { fetch as expoFetch } from "expo/fetch";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import {
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import {
  getPendingReceipt,
  clearPendingReceipt,
  type ParsedLineItem,
  type ParsedReceiptData,
} from "@/stores/pendingReceipt";

const WARN = "#F59E0B";
const WARN_BG_LIGHT = "#FFFBEB";
const WARN_BG_DARK = "#2D2000";
const WARN_BORDER_LIGHT = "#FCD34D";
const WARN_BORDER_DARK = "#92400E";

function toDateInput(iso: string): string {
  try {
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

function toIso(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr}T00:00:00.000Z`;
  }
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return dateStr;
  }
}

export default function ReviewReceiptScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isDark = colors.background === "#09090B" || colors.background < "#888888";

  const { receipt: initialReceipt, imageBase64 } = getPendingReceipt();
  const [receipt, setReceipt] = useState<ParsedReceiptData | null>(
    initialReceipt ? { ...initialReceipt } : null
  );
  const [saving, setSaving] = useState(false);

  const warnBg = isDark ? WARN_BG_DARK : WARN_BG_LIGHT;
  const warnBorder = isDark ? WARN_BORDER_DARK : WARN_BORDER_LIGHT;

  if (!receipt) {
    router.back();
    return null;
  }

  const uncertainCount =
    (receipt.storeNameUncertain ? 1 : 0) +
    (receipt.dateUncertain ? 1 : 0) +
    (receipt.totalUncertain ? 1 : 0) +
    receipt.lineItems.reduce(
      (n, li) => n + (li.nameUncertain ? 1 : 0) + (li.priceUncertain ? 1 : 0),
      0
    );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  const handleSave = async () => {
    const emptyItem = receipt.lineItems.find((li) => !li.name.trim());
    if (emptyItem) {
      Alert.alert("Missing name", "Every item must have a name.");
      return;
    }
    setSaving(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const url = `https://${domain}/api/receipts/save-parsed`;
      const response = await expoFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: receipt.storeName,
          purchasedAt: toIso(receipt.purchasedAt),
          total: receipt.total,
          lineItems: receipt.lineItems.map((li) => ({
            name: li.name,
            price: li.price,
            quantity: li.quantity,
          })),
        }),
      });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const saved = (await response.json()) as { id: number };
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearPendingReceipt();
      invalidateAll();
      router.replace(`/receipt/${saved.id}`);
    } catch {
      Alert.alert("Error", "Could not save receipt. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const setStoreName = (v: string) =>
    setReceipt((r) => r && { ...r, storeName: v, storeNameUncertain: false });
  const setDate = (v: string) =>
    setReceipt((r) => r && { ...r, purchasedAt: v, dateUncertain: false });
  const setTotal = (v: string) => {
    const n = parseFloat(v);
    setReceipt((r) => r && { ...r, total: isNaN(n) ? r.total : n, totalUncertain: false });
  };
  const setItemField = (
    idx: number,
    field: "name" | "price" | "quantity",
    value: string
  ) => {
    setReceipt((r) => {
      if (!r) return r;
      const items = r.lineItems.map((li, i) => {
        if (i !== idx) return li;
        if (field === "name") return { ...li, name: value, nameUncertain: false };
        if (field === "price") {
          const n = parseFloat(value);
          return { ...li, price: isNaN(n) ? li.price : n, priceUncertain: false };
        }
        const n = parseInt(value, 10);
        return { ...li, quantity: isNaN(n) ? li.quantity : n };
      });
      return { ...r, lineItems: items };
    });
  };
  const removeItem = (idx: number) =>
    setReceipt((r) => r && { ...r, lineItems: r.lineItems.filter((_, i) => i !== idx) });
  const addItem = () =>
    setReceipt((r) =>
      r && {
        ...r,
        lineItems: [
          ...r.lineItems,
          { name: "", price: 0, quantity: 1, nameUncertain: true, priceUncertain: true },
        ],
      }
    );

  const fieldStyle = (uncertain?: boolean) => ({
    backgroundColor: uncertain ? warnBg : colors.card,
    borderColor: uncertain ? warnBorder : colors.border,
    color: colors.foreground,
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 16, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
          onPress={() => {
            clearPendingReceipt();
            router.back();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Review Receipt</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Image + warning banner row */}
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            {uncertainCount > 0 ? (
              <View style={[styles.warnBanner, { backgroundColor: warnBg, borderColor: warnBorder }]}>
                <Feather name="alert-triangle" size={15} color={WARN} />
                <Text style={[styles.warnText, { color: WARN }]}>
                  AI flagged {uncertainCount} unclear{" "}
                  {uncertainCount === 1 ? "field" : "fields"} — highlighted below
                </Text>
              </View>
            ) : (
              <View style={[styles.warnBanner, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                <Feather name="check-circle" size={15} color={colors.primary} />
                <Text style={[styles.warnText, { color: colors.primary }]}>
                  All fields read clearly
                </Text>
              </View>
            )}
          </View>
          {imageBase64 ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
              style={[styles.thumb, { borderColor: colors.border }]}
              resizeMode="cover"
            />
          ) : null}
        </View>

        {/* Receipt header fields */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          RECEIPT DETAILS
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Store name */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Store
              {receipt.storeNameUncertain && (
                <Text style={{ color: WARN }}> ⚠</Text>
              )}
            </Text>
            <TextInput
              style={[styles.fieldInput, fieldStyle(receipt.storeNameUncertain)]}
              value={receipt.storeName}
              onChangeText={setStoreName}
              placeholder="Store name"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
            />
          </View>

          <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />

          {/* Date + Total row */}
          <View style={styles.twoColRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Date
                {receipt.dateUncertain && <Text style={{ color: WARN }}> ⚠</Text>}
              </Text>
              <TextInput
                style={[styles.fieldInput, fieldStyle(receipt.dateUncertain)]}
                value={toDateInput(receipt.purchasedAt)}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Total
                {receipt.totalUncertain && <Text style={{ color: WARN }}> ⚠</Text>}
              </Text>
              <TextInput
                style={[styles.fieldInput, fieldStyle(receipt.totalUncertain)]}
                value={String(receipt.total)}
                onChangeText={setTotal}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
            </View>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.itemsHeader}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            ITEMS ({receipt.lineItems.length})
          </Text>
        </View>

        {receipt.lineItems.map((li, idx) => {
          const rowUncertain = li.nameUncertain || li.priceUncertain;
          return (
            <View
              key={idx}
              style={[
                styles.itemCard,
                {
                  backgroundColor: rowUncertain ? warnBg : colors.card,
                  borderColor: rowUncertain ? warnBorder : colors.border,
                },
              ]}
            >
              {/* Item name row */}
              <View style={styles.itemNameRow}>
                {rowUncertain && (
                  <Feather name="alert-triangle" size={13} color={WARN} style={{ marginRight: 6, marginTop: 2 }} />
                )}
                <TextInput
                  style={[
                    styles.itemNameInput,
                    {
                      flex: 1,
                      backgroundColor: li.nameUncertain ? warnBg : colors.card,
                      borderColor: li.nameUncertain ? warnBorder : colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  value={li.name}
                  onChangeText={(v) => setItemField(idx, "name", v)}
                  placeholder="Item name"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  onPress={() => removeItem(idx)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Price + Qty row */}
              <View style={styles.itemNumRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.itemSubLabel, { color: colors.mutedForeground }]}>
                    Unit price
                    {li.priceUncertain && <Text style={{ color: WARN }}> ⚠</Text>}
                  </Text>
                  <TextInput
                    style={[
                      styles.itemNumInput,
                      {
                        backgroundColor: li.priceUncertain ? warnBg : colors.card,
                        borderColor: li.priceUncertain ? warnBorder : colors.border,
                        color: colors.foreground,
                      },
                    ]}
                    value={String(li.price)}
                    onChangeText={(v) => setItemField(idx, "price", v)}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="done"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemSubLabel, { color: colors.mutedForeground }]}>
                    Qty
                  </Text>
                  <TextInput
                    style={[
                      styles.itemNumInput,
                      { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
                    ]}
                    value={String(li.quantity)}
                    onChangeText={(v) => setItemField(idx, "quantity", v)}
                    keyboardType="number-pad"
                    placeholder="1"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>
          );
        })}

        {/* Add item */}
        <TouchableOpacity
          style={[styles.addItemBtn, { borderColor: colors.border }]}
          onPress={addItem}
          activeOpacity={0.7}
        >
          <Feather name="plus" size={16} color={colors.primary} />
          <Text style={[styles.addItemText, { color: colors.primary }]}>Add Item</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sticky save button */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 16,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name="check" size={18} color="#fff" />
          )}
          <Text style={styles.saveBtnText}>
            {saving ? "Saving…" : "Confirm & Save"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 4,
  },
  warnBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  thumb: {
    width: 72,
    height: 96,
    borderRadius: 8,
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginTop: 6,
    marginBottom: 4,
    marginLeft: 2,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  fieldRow: {
    paddingVertical: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 5,
  },
  fieldInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
  },
  twoColRow: {
    flexDirection: "row",
    paddingVertical: 10,
  },
  itemsHeader: {
    marginTop: 4,
  },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    marginBottom: 2,
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemNameInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  deleteBtn: {
    marginLeft: 10,
    padding: 4,
  },
  itemNumRow: {
    flexDirection: "row",
  },
  itemSubLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  itemNumInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  addItemText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
