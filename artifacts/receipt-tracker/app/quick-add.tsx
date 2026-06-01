import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { fetch as expoFetch } from "expo/fetch";
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStores,
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface LineItemRow {
  id: number;
  name: string;
  price: string;
  quantity: string;
}

function todayDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

let rowId = 100;
function makeRow(): LineItemRow {
  return { id: rowId++, name: "", price: "", quantity: "1" };
}

export default function QuickAddScreen() {
  const { getToken } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);

  const [storeName, setStoreName] = useState("");
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [date, setDate] = useState(todayDate());
  const [lineItems, setLineItems] = useState<LineItemRow[]>([makeRow()]);
  const [saving, setSaving] = useState(false);

  const { data: stores } = useListStores();

  const filteredStores = useMemo(() => {
    if (!stores || !storeName.trim()) return [];
    const q = storeName.toLowerCase();
    return stores.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5);
  }, [stores, storeName]);

  const calculatedTotal = useMemo(() => {
    return lineItems.reduce((sum, li) => {
      const p = parseFloat(li.price) || 0;
      const q = parseFloat(li.quantity) || 1;
      return sum + p * q;
    }, 0);
  }, [lineItems]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  const updateItem = (id: number, field: keyof LineItemRow, value: string) => {
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? { ...li, [field]: value } : li))
    );
  };

  const addItem = () => {
    setLineItems((prev) => [...prev, makeRow()]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const removeItem = (id: number) => {
    setLineItems((prev) => (prev.length === 1 ? prev : prev.filter((li) => li.id !== id)));
  };

  const handleSave = async () => {
    const trimStore = storeName.trim();
    if (!trimStore) {
      Alert.alert("Missing store", "Please enter a store name.");
      return;
    }
    const validItems = lineItems.filter((li) => li.name.trim());
    if (validItems.length === 0) {
      Alert.alert("No items", "Add at least one item with a name.");
      return;
    }

    let purchasedAt: string;
    try {
      purchasedAt = new Date(`${date}T12:00:00`).toISOString();
    } catch {
      Alert.alert("Invalid date", "Use YYYY-MM-DD format.");
      return;
    }

    setSaving(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const body = {
        storeName: trimStore,
        purchasedAt,
        total: Math.round(calculatedTotal * 100) / 100,
        lineItems: validItems.map((li) => ({
          name: li.name.trim(),
          price: parseFloat(li.price) || 0,
          quantity: parseFloat(li.quantity) || 1,
        })),
      };

      const token = await getToken();
      const response = await expoFetch(`https://${domain}/api/receipts/manual-entry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const receipt = (await response.json()) as { id: number };

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
      router.replace(`/receipt/${receipt.id}`);
    } catch {
      Alert.alert("Error", "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const s = styles(colors);

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={[s.closeBtn, { backgroundColor: colors.secondary }]}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.foreground }]}>Log Items</Text>
        <TouchableOpacity
          style={[s.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Store */}
        <View style={s.fieldWrap}>
          <Text style={[s.label, { color: colors.mutedForeground }]}>Store</Text>
          <View>
            <View style={[s.storeInputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="shopping-bag" size={15} color={colors.mutedForeground} style={{ marginLeft: 12 }} />
              <TextInput
                style={[s.storeInput, { color: colors.foreground }]}
                placeholder="Store name"
                placeholderTextColor={colors.mutedForeground}
                value={storeName}
                onChangeText={(v) => {
                  setStoreName(v);
                  setStoreDropdownOpen(v.trim().length > 0);
                }}
                onFocus={() => setStoreDropdownOpen(storeName.trim().length > 0)}
                returnKeyType="next"
              />
              {storeName.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setStoreName(""); setStoreDropdownOpen(false); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginRight: 12 }}
                >
                  <Feather name="x-circle" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            {/* Autocomplete dropdown */}
            {storeDropdownOpen && filteredStores.length > 0 && (
              <View style={[s.dropdown, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.foreground }]}>
                {filteredStores.map((store) => (
                  <TouchableOpacity
                    key={store.id}
                    style={[s.dropdownItem, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      setStoreName(store.name);
                      setStoreDropdownOpen(false);
                    }}
                  >
                    <Feather name="shopping-bag" size={13} color={colors.primary} />
                    <Text style={[s.dropdownText, { color: colors.foreground }]}>{store.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Date */}
        <View style={s.fieldWrap}>
          <Text style={[s.label, { color: colors.mutedForeground }]}>Date</Text>
          <View style={[s.dateRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="calendar" size={15} color={colors.mutedForeground} style={{ marginLeft: 12 }} />
            <TextInput
              style={[s.dateInput, { color: colors.foreground }]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
            />
          </View>
        </View>

        {/* Items */}
        <View style={s.itemsSection}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>Items</Text>

          {/* Column labels */}
          <View style={s.colHeader}>
            <Text style={[s.colLabel, { color: colors.mutedForeground, flex: 3 }]}>Name</Text>
            <Text style={[s.colLabel, { color: colors.mutedForeground, flex: 1.3, textAlign: "right" }]}>Price</Text>
            <Text style={[s.colLabel, { color: colors.mutedForeground, flex: 0.9, textAlign: "center" }]}>Qty</Text>
            <View style={{ width: 32 }} />
          </View>

          {lineItems.map((li, idx) => (
            <View
              key={li.id}
              style={[s.itemRow, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <TextInput
                style={[s.itemField, { color: colors.foreground, flex: 3 }]}
                placeholder={`Item ${idx + 1}`}
                placeholderTextColor={colors.mutedForeground}
                value={li.name}
                onChangeText={(v) => updateItem(li.id, "name", v)}
                returnKeyType="next"
              />
              <View style={[s.dividerV, { backgroundColor: colors.border }]} />
              <TextInput
                style={[s.itemField, { color: colors.foreground, flex: 1.3, textAlign: "right" }]}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                value={li.price}
                onChangeText={(v) => updateItem(li.id, "price", v)}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
              <View style={[s.dividerV, { backgroundColor: colors.border }]} />
              <TextInput
                style={[s.itemField, { color: colors.foreground, flex: 0.9, textAlign: "center" }]}
                placeholder="1"
                placeholderTextColor={colors.mutedForeground}
                value={li.quantity}
                onChangeText={(v) => updateItem(li.id, "quantity", v)}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <TouchableOpacity
                style={s.removeBtn}
                onPress={() => removeItem(li.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name="minus-circle"
                  size={17}
                  color={lineItems.length === 1 ? colors.border : "#ef4444"}
                />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={[s.addBtn, { borderColor: colors.primary, backgroundColor: colors.accent }]}
            onPress={addItem}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={[s.addBtnText, { color: colors.primary }]}>Add Item</Text>
          </TouchableOpacity>
        </View>

        {/* Total summary */}
        {calculatedTotal > 0 && (
          <View style={[s.totalRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.totalLabel, { color: colors.mutedForeground }]}>Calculated Total</Text>
            <Text style={[s.totalValue, { color: colors.primary }]}>
              ${calculatedTotal.toFixed(2)}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function styles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
    saveBtn: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 20,
      minWidth: 64,
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
    content: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
    fieldWrap: { marginBottom: 14 },
    label: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      marginBottom: 6,
    },
    storeInputRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      height: 46,
      gap: 8,
    },
    storeInput: {
      flex: 1,
      height: 46,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    dropdown: {
      position: "absolute",
      top: 50,
      left: 0,
      right: 0,
      borderWidth: 1,
      borderRadius: 12,
      zIndex: 100,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
      overflow: "hidden",
    },
    dropdownItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    dropdownText: { fontSize: 15, fontFamily: "Inter_400Regular" },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      height: 46,
      gap: 8,
    },
    dateInput: {
      flex: 1,
      height: 46,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    itemsSection: { marginTop: 4 },
    sectionTitle: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      marginBottom: 10,
    },
    colHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      marginBottom: 4,
    },
    colLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      marginBottom: 8,
      paddingHorizontal: 10,
      overflow: "hidden",
    },
    itemField: {
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    dividerV: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      marginHorizontal: 6,
    },
    removeBtn: {
      width: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: "dashed",
      marginTop: 2,
    },
    addBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 16,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    totalLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
    totalValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  });
}
