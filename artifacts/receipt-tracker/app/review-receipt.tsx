import React, { useState, useEffect } from "react";
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
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import { getApiOrigin } from "@/lib/apiBase";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { StoreNameField } from "@/components/StoreNameField";
import { ZoomableImageModal } from "@/components/ZoomableImageModal";
import {
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getListStoresQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
  useSuggestItemNames,
} from "@workspace/api-client-react";
import {
  getPendingReceipt,
  clearPendingReceipt,
  type ParsedLineItem,
  type ParsedReceiptData,
} from "@/stores/pendingReceipt";

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
  const { getToken } = useAuth();
  const colors = useColors();
  const { format } = useCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { receipt: initialReceipt, imageBase64 } = getPendingReceipt();
  const [receipt, setReceipt] = useState<ParsedReceiptData | null>(
    initialReceipt ? { ...initialReceipt } : null
  );
  const [saving, setSaving] = useState(false);
  const [viewingImage, setViewingImage] = useState(false);

  // Raw text buffers for the numeric inputs (price / qty / total). Keeping the
  // typed text lets users clear the field and type a fresh integer or a partial
  // decimal ("2", "2.", "0.5") instead of the value snapping back to the old
  // number on every keystroke.
  const [numText, setNumText] = useState<Record<string, string>>({});

  // Existing item names that scanned lines almost match. Advisory: scan-time
  // matching won't merge these on its own (an abbreviation scores below the
  // auto-merge bar), so without this each scan quietly mints a duplicate item
  // and splits the price history. Keyed by line index.
  const [nameHints, setNameHints] = useState<Record<number, string>>({});
  const [dismissedHints, setDismissedHints] = useState<Record<number, boolean>>({});
  const { mutateAsync: fetchNameSuggestions } = useSuggestItemNames();

  // Re-run whenever the store changes: the candidate pool is "what you've bought
  // HERE", so correcting a misread store name changes the answer.
  const storeKey = receipt?.storeName?.trim().toLowerCase() ?? "";
  const lineNames = React.useMemo(() => receipt?.lineItems.map((li) => li.name) ?? [], [receipt]);
  // Stable identity for the effect. Serialised rather than joined on a
  // separator because item names can contain any character, and this must only
  // change when the names actually do. It is never parsed back — the request
  // sends the array itself.
  const lineNamesKey = JSON.stringify(lineNames);
  useEffect(() => {
    if (!storeKey || lineNames.length === 0) {
      setNameHints({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchNameSuggestions({
          data: { storeName: storeKey, names: lineNames },
        });
        if (cancelled) return;
        const map: Record<number, string> = {};
        for (const s of res.suggestions) map[s.index] = s.suggestedName;
        setNameHints(map);
      } catch {
        // A failed suggestion lookup must never block the review — the receipt
        // saves fine without it.
        if (!cancelled) setNameHints({});
      }
    })();
    return () => {
      cancelled = true;
    };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey, lineNamesKey, fetchNameSuggestions]);
  // `allowEmpty` is for the nullable adjustment fields (delivery fee / tax /
  // discount), where clearing the box MEANS "no such charge" and has to reach the
  // setter so it can null the value. Without it the input looked empty while the
  // old number stayed in state and got saved anyway. Deliberately not the default:
  // total, price and quantity are required, and passing "" to them would flip
  // their `*Uncertain` flags while keeping the old number — a silent no-op that
  // reads as "confirmed" when the user hasn't confirmed anything.
  const setNum = (
    key: string,
    text: string,
    applyValid: () => void,
    { allowEmpty = false }: { allowEmpty?: boolean } = {},
  ) => {
    setNumText((m) => ({ ...m, [key]: text }));
    const isEmpty = text.trim() === "";
    if (isEmpty ? allowEmpty : !isNaN(parseFloat(text))) applyValid();
  };
  const numVal = (key: string, current: number) =>
    numText[key] !== undefined ? numText[key] : String(current);

  const warnBg = colors.warningBackground;
  const warnBorder = colors.warning;

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

  // Does the stated total match what the line items add up to, once the
  // receipt-level adjustments are applied? Tolerance is a cent per line item
  // (plus one) so ordinary per-line rounding doesn't get flagged as a mismatch.
  const reconciliation = (() => {
    const items = receipt.lineItems.reduce(
      (sum, li) => sum + (Number(li.price) || 0) * (Number(li.quantity) || 0),
      0,
    );
    const expected =
      items + (receipt.tax ?? 0) + (receipt.deliveryFee ?? 0) - (receipt.discount ?? 0);
    const actual = Number(receipt.total) || 0;
    const difference = Math.abs(expected - actual);
    const tolerance = 0.01 * (receipt.lineItems.length + 1);
    return { expected, actual, difference, matches: difference <= tolerance };
  })();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    // A scanned receipt can create a new store, so refresh the Stores list too —
    // otherwise the new store doesn't appear until a manual refresh.
    queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  // `after` decides where a successful save lands: straight into another scan
  // (for working through a stack of receipts), back where the user came from, or
  // the saved receipt itself.
  const handleSave = async (
    after: "receipt" | "scan" | "back" = "receipt",
    // Set by the "Save anyway" branch of the reconciliation prompt. Passed
    // explicitly rather than held in state because the retry happens in the same
    // tick as the alert callback, before a state update would be visible.
    skipTotalCheck = false,
  ) => {
    const emptyItem = receipt.lineItems.find((li) => !li.name.trim());
    if (emptyItem) {
      Alert.alert("Missing name", "Every item must have a name.");
      return;
    }

    // A total that doesn't add up usually means a missed line item or a misread
    // price, but plenty of real receipts legitimately don't reconcile (loyalty
    // adjustments, deposits, rounding). So this warns and lets the user through
    // rather than blocking a save they know is right.
    if (!skipTotalCheck && reconciliation && !reconciliation.matches) {
      Alert.alert(
        "Total doesn't add up",
        `The items, tax and fees come to ${format(reconciliation.expected)}, but the receipt total says ${format(reconciliation.actual)} — a difference of ${format(reconciliation.difference)}.\n\nCheck for a missed item or a misread price, or save it as-is if the receipt really does read this way.`,
        [
          { text: "Go back and check", style: "cancel" },
          { text: "Save anyway", onPress: () => void handleSave(after, true) },
        ],
      );
      return;
    }

    setSaving(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const url = `${getApiOrigin()}/api/receipts/save-parsed`;
      const token = await getToken();
      const response = await expoFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          storeName: receipt.storeName,
          storeAddress: receipt.storeAddress ?? undefined,
          storeCountryCode: receipt.storeCountryCode ?? undefined,
          storeStateCode: receipt.storeStateCode ?? undefined,
          purchasedAt: toIso(receipt.purchasedAt),
          total: receipt.total,
          deliveryFee: receipt.deliveryFee ?? undefined,
          tax: receipt.tax ?? undefined,
          discount: receipt.discount ?? undefined,
          lineItems: receipt.lineItems.map((li) => ({
            name: li.name,
            price: li.price,
            quantity: li.quantity,
            icon: li.icon ?? undefined,
            category: li.category ?? undefined,
            // "Priced by weight" rows record the weight in pounds — persist the
            // unit so the saved item shows "2.5 lb" instead of a bare "×2.5".
            unit: li.byWeight ? "lb" : undefined,
          })),
        }),
      });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const saved = (await response.json()) as { id: number };
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearPendingReceipt();
      invalidateAll();
      showSuccessToast("Receipt saved", `${receipt.lineItems.length} item${receipt.lineItems.length === 1 ? "" : "s"} added`);
      if (after === "scan") router.replace("/scan?autoOpen=1");
      else if (after === "back") router.back();
      else router.replace(`/receipt/${saved.id}`);
    } catch {
      showErrorToast("Couldn't save receipt", "Please try again.");
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
  // Delivery fee, tax and discount share one shape: optional positive amounts
  // that qualify the total. Blank clears the field rather than forcing a 0.
  const setAdjustment = (key: "deliveryFee" | "tax" | "discount") => (v: string) => {
    const trimmed = v.trim();
    if (trimmed === "") {
      setReceipt((r) => r && { ...r, [key]: null });
      return;
    }
    const n = parseFloat(trimmed);
    setReceipt((r) => r && { ...r, [key]: isNaN(n) ? r[key] ?? null : n });
  };
  const setDeliveryFee = setAdjustment("deliveryFee");
  const setTax = setAdjustment("tax");
  const setDiscount = setAdjustment("discount");
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
        // Quantity is numeric(10,3) — allow decimals so weights like 2.35 lb work.
        const n = parseFloat(value);
        return { ...li, quantity: isNaN(n) ? li.quantity : n };
      });
      return { ...r, lineItems: items };
    });
  };
  // Toggle a row between flat unit-price and price-per-pound (weight) mode.
  const toggleWeight = (idx: number) =>
    setReceipt((r) => {
      if (!r) return r;
      const items = r.lineItems.map((li, i) =>
        i === idx ? { ...li, byWeight: !li.byWeight } : li,
      );
      return { ...r, lineItems: items };
    });
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
                <Feather name="alert-triangle" size={15} color={colors.warning} />
                <Text style={[styles.warnText, { color: colors.warning }]}>
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
            <TouchableOpacity
              onPress={() => setViewingImage(true)}
              activeOpacity={0.8}
              accessibilityLabel="View receipt photo full screen"
            >
              <Image
                source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                style={[styles.thumb, { borderColor: colors.border }]}
                resizeMode="cover"
              />
              <View style={styles.thumbZoomBadge}>
                <Feather name="maximize-2" size={11} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Totals reconciliation — surfaced here as well as on save, so a
            mismatch is visible while the numbers are still in front of you. */}
        {!reconciliation.matches ? (
          <View style={[styles.warnBanner, { backgroundColor: warnBg, borderColor: warnBorder }]}>
            <Feather name="alert-triangle" size={15} color={colors.warning} />
            <Text style={[styles.warnText, { color: colors.warning }]}>
              Items add up to {format(reconciliation.expected)}, but the total says{" "}
              {format(reconciliation.actual)} — check for a missed item
            </Text>
          </View>
        ) : null}

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
                <Text style={{ color: colors.warning }}> ⚠</Text>
              )}
            </Text>
            <StoreNameField
              value={receipt.storeName}
              onChangeText={setStoreName}
              uncertain={receipt.storeNameUncertain}
            />
          </View>

          <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />

          {/* Date + Total row */}
          <View style={styles.twoColRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Date
                {receipt.dateUncertain && <Text style={{ color: colors.warning }}> ⚠</Text>}
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
                {receipt.totalUncertain && <Text style={{ color: colors.warning }}> ⚠</Text>}
              </Text>
              <TextInput
                style={[styles.fieldInput, fieldStyle(receipt.totalUncertain)]}
                value={numVal("total", receipt.total)}
                onChangeText={(v) => setNum("total", v, () => setTotal(v))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Delivery / service fee (auto-detected; blank = none) */}
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Delivery / service fee (optional)
            </Text>
            <TextInput
              style={[styles.fieldInput, fieldStyle(false)]}
              value={numVal("deliveryFee", receipt.deliveryFee ?? 0)}
              onChangeText={(v) => setNum("deliveryFee", v, () => setDeliveryFee(v), { allowEmpty: true })}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
            />
          </View>

          {/* Tax + discount — like the fee above, these qualify the total and
              are never line items. Discount is entered as a positive amount. */}
          <View style={styles.twoColRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Tax (optional)
              </Text>
              <TextInput
                style={[styles.fieldInput, fieldStyle(false)]}
                value={numVal("tax", receipt.tax ?? 0)}
                onChangeText={(v) => setNum("tax", v, () => setTax(v), { allowEmpty: true })}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Discount (optional)
              </Text>
              <TextInput
                style={[styles.fieldInput, fieldStyle(false)]}
                value={numVal("discount", receipt.discount ?? 0)}
                onChangeText={(v) => setNum("discount", v, () => setDiscount(v), { allowEmpty: true })}
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
                  <Feather name="alert-triangle" size={13} color={colors.warning} style={{ marginRight: 6, marginTop: 2 }} />
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

              {/* Suggested existing name. Offered, never applied automatically:
                  the server won't merge at this similarity because a wrong merge
                  corrupts price history silently, so the decision is the
                  user's. Accepting it keeps one item and one price history
                  instead of minting a near-duplicate. */}
              {nameHints[idx] && !dismissedHints[idx] && nameHints[idx] !== li.name ? (
                <View style={[styles.hintRow, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                  <Feather name="link-2" size={12} color={colors.primary} />
                  <Text style={[styles.hintText, { color: colors.foreground }]} numberOfLines={2}>
                    You usually call this{" "}
                    <Text style={{ fontFamily: "Inter_600SemiBold" }}>{nameHints[idx]}</Text> here
                  </Text>
                  <TouchableOpacity
                    onPress={() => setItemField(idx, "name", nameHints[idx]!)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Text style={[styles.hintUse, { color: colors.primary }]}>Use it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDismissedHints((d) => ({ ...d, [idx]: true }))}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
                    accessibilityLabel="Dismiss name suggestion"
                  >
                    <Feather name="x" size={13} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Price + Qty row */}
              <View style={styles.itemNumRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.itemSubLabel, { color: colors.mutedForeground }]}>
                    {li.byWeight ? "Price / lb" : "Unit price"}
                    {li.priceUncertain && <Text style={{ color: colors.warning }}> ⚠</Text>}
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
                    value={numVal(`p${idx}`, li.price)}
                    onChangeText={(v) => setNum(`p${idx}`, v, () => setItemField(idx, "price", v))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="done"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemSubLabel, { color: colors.mutedForeground }]}>
                    {li.byWeight ? "Weight (lb)" : "Qty"}
                  </Text>
                  <TextInput
                    style={[
                      styles.itemNumInput,
                      { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
                    ]}
                    value={numVal(`q${idx}`, li.quantity)}
                    onChangeText={(v) => setNum(`q${idx}`, v, () => setItemField(idx, "quantity", v))}
                    keyboardType="decimal-pad"
                    placeholder={li.byWeight ? "0.00" : "1"}
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="done"
                  />
                </View>
              </View>

              {/* Weight toggle + computed line total */}
              <View style={styles.itemWeightRow}>
                <TouchableOpacity
                  onPress={() => toggleWeight(idx)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={styles.weightToggle}
                >
                  <Feather
                    name={li.byWeight ? "check-square" : "square"}
                    size={14}
                    color={li.byWeight ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.weightToggleText, { color: li.byWeight ? colors.primary : colors.mutedForeground }]}>
                    Priced by weight (per lb)
                  </Text>
                </TouchableOpacity>
                {li.byWeight ? (
                  <Text style={[styles.lineTotal, { color: colors.foreground }]}>
                    = {format(li.price * li.quantity)}
                  </Text>
                ) : null}
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
          onPress={() => void handleSave("scan")}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name="plus-circle" size={18} color="#fff" />
          )}
          <Text style={styles.saveBtnText}>
            {saving ? "Saving…" : "Save & scan next receipt"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.saveSecondaryBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
            saving && { opacity: 0.6 },
          ]}
          onPress={() => void handleSave("back")}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Feather name="check" size={18} color={colors.foreground} />
          <Text style={[styles.saveSecondaryBtnText, { color: colors.foreground }]}>
            Save & close receipt
          </Text>
        </TouchableOpacity>
      </View>

      <ZoomableImageModal
        visible={viewingImage}
        uri={imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : null}
        onClose={() => setViewingImage(false)}
      />
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
  thumbZoomBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
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
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 7,
  },
  hintText: { flex: 1, fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 17 },
  hintUse: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
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
  itemWeightRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weightToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  weightToggleText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  lineTotal: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
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
  saveSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
  },
  saveSecondaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
