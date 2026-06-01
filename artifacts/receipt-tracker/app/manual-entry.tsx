import React, { useState, useRef } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { fetch as expoFetch } from "expo/fetch";
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { getApiOrigin } from "@/lib/apiBase";

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

function currentTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

let nextId = 1;

function makeRow(): LineItemRow {
  return { id: nextId++, name: "", price: "", quantity: "1" };
}

export default function ManualEntryScreen() {
  const { getToken } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);

  // Store fields
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeOpenTimes, setStoreOpenTimes] = useState("");

  // Receipt fields
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState(currentTime());
  const [totalBeforeTax, setTotalBeforeTax] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");

  // Line items
  const [lineItems, setLineItems] = useState<LineItemRow[]>([makeRow()]);

  const [saving, setSaving] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  const updateLineItem = (id: number, field: keyof LineItemRow, value: string) => {
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? { ...li, [field]: value } : li))
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, makeRow()]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const removeLineItem = (id: number) => {
    setLineItems((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((li) => li.id !== id);
    });
  };

  const handleSave = async () => {
    const trimmedStore = storeName.trim();
    const trimmedTotal = total.trim();

    if (!trimmedStore) {
      Alert.alert("Missing field", "Store name is required.");
      return;
    }
    if (!trimmedTotal || isNaN(parseFloat(trimmedTotal))) {
      Alert.alert("Missing field", "Total after tax is required.");
      return;
    }

    const validItems = lineItems.filter((li) => li.name.trim());
    if (validItems.length === 0) {
      Alert.alert("No items", "Add at least one item with a name.");
      return;
    }

    // Build ISO 8601 date-time from date + time fields
    let purchasedAt: string;
    try {
      purchasedAt = new Date(`${date}T${time}:00`).toISOString();
    } catch {
      Alert.alert("Invalid date", "Use YYYY-MM-DD for date and HH:MM for time.");
      return;
    }

    setSaving(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const url = `${getApiOrigin()}/api/receipts/manual-entry`;
      const body = {
        storeName: trimmedStore,
        storeAddress: storeAddress.trim() || null,
        storePhone: storePhone.trim() || null,
        storeOpenTimes: storeOpenTimes.trim() || null,
        purchasedAt,
        total: parseFloat(trimmedTotal),
        totalBeforeTax: totalBeforeTax.trim() ? parseFloat(totalBeforeTax.trim()) : null,
        notes: notes.trim() || null,
        lineItems: validItems.map((li) => ({
          name: li.name.trim(),
          price: parseFloat(li.price) || 0,
          quantity: parseFloat(li.quantity) || 1,
        })),
      };

      const token = await getToken();
      const response = await expoFetch(url, {
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
      Alert.alert("Error", "Could not save the receipt. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const s = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
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
        <Text style={[s.title, { color: colors.foreground }]}>Enter Manually</Text>
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
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Store Section ─────────────────────────────── */}
        <SectionHeader label="Store" icon="shopping-bag" colors={colors} />

        <Field label="Store Name *" colors={colors}>
          <TextInput
            style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            placeholder="e.g. Whole Foods"
            placeholderTextColor={colors.mutedForeground}
            value={storeName}
            onChangeText={setStoreName}
            returnKeyType="next"
          />
        </Field>

        <Field label="Address" colors={colors}>
          <TextInput
            style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            placeholder="123 Main St, City"
            placeholderTextColor={colors.mutedForeground}
            value={storeAddress}
            onChangeText={setStoreAddress}
            returnKeyType="next"
          />
        </Field>

        <View style={s.row}>
          <View style={s.flex1}>
            <Field label="Phone" colors={colors}>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="555-0100"
                placeholderTextColor={colors.mutedForeground}
                value={storePhone}
                onChangeText={setStorePhone}
                keyboardType="phone-pad"
                returnKeyType="next"
              />
            </Field>
          </View>
          <View style={s.flex1}>
            <Field label="Open Times" colors={colors}>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="Mon–Fri 9am–9pm"
                placeholderTextColor={colors.mutedForeground}
                value={storeOpenTimes}
                onChangeText={setStoreOpenTimes}
                returnKeyType="next"
              />
            </Field>
          </View>
        </View>

        {/* ── Receipt Section ───────────────────────────── */}
        <SectionHeader label="Receipt" icon="file-text" colors={colors} style={{ marginTop: 8 }} />

        <View style={s.row}>
          <View style={s.flex1}>
            <Field label="Date *" colors={colors}>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={date}
                onChangeText={setDate}
                keyboardType="numbers-and-punctuation"
                returnKeyType="next"
              />
            </Field>
          </View>
          <View style={s.flex1}>
            <Field label="Time" colors={colors}>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="HH:MM"
                placeholderTextColor={colors.mutedForeground}
                value={time}
                onChangeText={setTime}
                keyboardType="numbers-and-punctuation"
                returnKeyType="next"
              />
            </Field>
          </View>
        </View>

        <View style={s.row}>
          <View style={s.flex1}>
            <Field label="Total Before Tax" colors={colors}>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                value={totalBeforeTax}
                onChangeText={setTotalBeforeTax}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </Field>
          </View>
          <View style={s.flex1}>
            <Field label="Total After Tax *" colors={colors}>
              <TextInput
                style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                value={total}
                onChangeText={setTotal}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </Field>
          </View>
        </View>

        <Field label="Notes" colors={colors}>
          <TextInput
            style={[s.input, s.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            placeholder="Any additional notes…"
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            returnKeyType="done"
          />
        </Field>

        {/* ── Items Section ─────────────────────────────── */}
        <SectionHeader label="Items" icon="tag" colors={colors} style={{ marginTop: 8 }} />

        {/* Column headers */}
        <View style={s.itemHeader}>
          <Text style={[s.itemHeaderText, { color: colors.mutedForeground, flex: 3 }]}>Name</Text>
          <Text style={[s.itemHeaderText, { color: colors.mutedForeground, flex: 1.2, textAlign: "center" }]}>Price</Text>
          <Text style={[s.itemHeaderText, { color: colors.mutedForeground, flex: 0.9, textAlign: "center" }]}>Qty</Text>
          <View style={{ width: 32 }} />
        </View>

        {lineItems.map((li, idx) => (
          <View key={li.id} style={[s.itemRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              style={[s.itemInput, { color: colors.foreground, flex: 3 }]}
              placeholder={`Item ${idx + 1}`}
              placeholderTextColor={colors.mutedForeground}
              value={li.name}
              onChangeText={(v) => updateLineItem(li.id, "name", v)}
              returnKeyType="next"
            />
            <TextInput
              style={[s.itemInput, { color: colors.foreground, flex: 1.2, textAlign: "right" }]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              value={li.price}
              onChangeText={(v) => updateLineItem(li.id, "price", v)}
              keyboardType="decimal-pad"
              returnKeyType="next"
            />
            <TextInput
              style={[s.itemInput, { color: colors.foreground, flex: 0.9, textAlign: "center" }]}
              placeholder="1"
              placeholderTextColor={colors.mutedForeground}
              value={li.quantity}
              onChangeText={(v) => updateLineItem(li.id, "quantity", v)}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
            <TouchableOpacity
              style={s.removeBtn}
              onPress={() => removeLineItem(li.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="minus-circle" size={18} color={lineItems.length === 1 ? colors.mutedForeground : "#ef4444"} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          style={[s.addItemBtn, { borderColor: colors.primary, backgroundColor: colors.accent }]}
          onPress={addLineItem}
          activeOpacity={0.7}
        >
          <Feather name="plus" size={16} color={colors.primary} />
          <Text style={[s.addItemText, { color: colors.primary }]}>Add Item</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({
  label,
  icon,
  colors,
  style,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  colors: ReturnType<typeof useColors>;
  style?: object;
}) {
  return (
    <View style={[sectionStyles.container, style]}>
      <Feather name={icon} size={14} color={colors.primary} />
      <Text style={[sectionStyles.text, { color: colors.primary }]}>{label}</Text>
      <View style={[sectionStyles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    marginTop: 4,
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  line: {
    flex: 1,
    height: 1,
  },
});

function Field({
  label,
  children,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={fieldStyles.container}>
      <Text style={[fieldStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  container: { marginBottom: 10 },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStyles(colors: any) {
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
    title: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
    },
    saveBtn: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 20,
      minWidth: 64,
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtnText: {
      color: "#fff",
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 4,
    },
    row: {
      flexDirection: "row",
      gap: 10,
    },
    flex1: { flex: 1 },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    textArea: {
      minHeight: 72,
      paddingTop: 10,
      textAlignVertical: "top",
    },
    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
      paddingHorizontal: 12,
    },
    itemHeaderText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 10,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    itemInput: {
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    removeBtn: {
      width: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    addItemBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1.5,
      borderStyle: "dashed",
      marginTop: 2,
    },
    addItemText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
  });
}
