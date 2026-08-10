import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ShoppingListItem } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import { EmptyState } from "@/components/EmptyState";
import { tabBarClearance } from "@/lib/tabBar";

interface Props {
  // Everything ticked in the Create-list tab, already in display order.
  items: ShoppingListItem[];
  // Free-text extras added in Create list; they have no item id, so they're
  // tracked separately by name.
  customItems: string[];
  // Ticked-off state is owned by the parent. It has to be: this view lives in a
  // ternary on the active sub-tab, so tapping over to Items to check a price
  // unmounts it, and anything held locally would take the shopper's progress with
  // it — mid-trip, with the trip still open. Cleared on "Done shopping" only.
  picked: Set<string>;
  onPickedChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  onDoneShopping: (summary: { picked: number; total: number }) => void | Promise<void>;
}

// The in-trip view: only what you chose to buy, with empty boxes to tick off as
// it goes in the basket. Deliberately not the same list rows as the Items tab —
// nothing here navigates away or offers Ran Out / Buy More, because the one job
// while standing in a shop is "have I got this yet".
export function ShoppingModeView({
  items,
  customItems,
  picked,
  onPickedChange: setPicked,
  onDoneShopping,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { format } = useCurrency();

  // Item ids and custom names share one key space so both can be ticked.
  const rows = useMemo(
    () => [
      ...items.map((it) => ({ key: `i${it.itemId}`, item: it, name: it.itemName })),
      ...customItems.map((name, i) => ({ key: `c${i}`, item: null, name })),
    ],
    [items, customItems],
  );

  const toggle = (key: string) => {
    void Haptics.selectionAsync();
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const remaining = rows.length - picked.size;

  // Running total of what's actually in the basket, using the same price the
  // Create-list view showed so the two never disagree.
  const basketTotal = useMemo(
    () =>
      rows.reduce((sum, r) => {
        if (!picked.has(r.key) || !r.item) return sum;
        return sum + (r.item.recommendedPrice ?? r.item.lowestPrice ?? 0);
      }, 0),
    [rows, picked],
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="shopping-cart"
        title="Nothing selected"
        subtitle="Tick some items in Create list, then come back here to shop."
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.progressBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.progressText, { color: colors.foreground }]}>
          {remaining === 0 ? "All done — nice work" : `${remaining} to go`}
        </Text>
        <Text style={[styles.progressMeta, { color: colors.mutedForeground }]}>
          {picked.size}/{rows.length}
          {basketTotal > 0 ? ` · ${format(basketTotal)}` : ""}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {rows.map((row) => {
          const isPicked = picked.has(row.key);
          const price = row.item?.recommendedPrice ?? row.item?.lowestPrice ?? null;
          const store = row.item?.recommendedStoreName ?? row.item?.lowestPriceStoreName ?? null;
          return (
            <TouchableOpacity
              key={row.key}
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => toggle(row.key)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isPicked }}
              accessibilityLabel={row.name}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: isPicked ? colors.primary : colors.border,
                    backgroundColor: isPicked ? colors.primary : "transparent",
                  },
                ]}
              >
                {isPicked ? <Feather name="check" size={16} color="#fff" /> : null}
              </View>

              <Text style={styles.rowIcon}>{row.item?.icon || (row.item ? "🛒" : "📝")}</Text>

              <View style={styles.rowMain}>
                <Text
                  style={[
                    styles.rowName,
                    { color: isPicked ? colors.mutedForeground : colors.foreground },
                    // Struck through once in the basket so the eye skips it.
                    isPicked && styles.rowNamePicked,
                  ]}
                  numberOfLines={1}
                >
                  {row.name}
                </Text>
                {store ? (
                  <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {store}
                  </Text>
                ) : null}
              </View>

              {price != null ? (
                <Text
                  style={[
                    styles.rowPrice,
                    { color: isPicked ? colors.mutedForeground : colors.foreground },
                  ]}
                >
                  {format(price)}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* "Done shopping" is the only way to end a trip, so it must never be
          under the floating tab bar — a fixed 28pt of padding put it there on
          every phone, which is what hid it. */}
      <View
        style={[
          styles.footer,
          { borderTopColor: colors.border, paddingBottom: tabBarClearance(insets.bottom) },
        ]}
      >
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: colors.primary }]}
          onPress={() => onDoneShopping({ picked: picked.size, total: basketTotal })}
          activeOpacity={0.85}
        >
          <Feather name="check-circle" size={18} color={colors.primaryForeground} />
          <Text style={[styles.doneBtnText, { color: colors.primaryForeground }]}>Done shopping</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  progressText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  progressMeta: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { paddingBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Deliberately larger than the Create-list checkbox: this one gets tapped
  // one-handed, in a shop, often while holding something.
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIcon: { fontSize: 18 },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  rowNamePicked: { textDecorationLine: "line-through" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowPrice: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  doneBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
