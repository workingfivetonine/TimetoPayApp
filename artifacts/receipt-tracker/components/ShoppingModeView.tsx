import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
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
  /** Drops a row from this trip. Real items are de-selected; custom ones deleted. */
  onRemove: (row: { itemId: number | null; name: string }) => void;
  /** Screen-awake preference, owned by the parent so it survives a sub-tab switch. */
  keepAwake: boolean;
  onKeepAwakeChange: (next: boolean) => void;
}

const UNKNOWN_STORE = "Any store";
const UNKNOWN_CATEGORY = "Other";

const KEEP_AWAKE_TAG = "timetopay-shopping";

/**
 * Holds the screen on while `enabled` and the caller is mounted.
 *
 * Not `useKeepAwake()` from expo-keep-awake, which is unconditional. Failures
 * are swallowed on purpose: on web this is the Wake Lock API, which some
 * browsers do not implement and which rejects outside a user gesture — neither
 * is worth an error in a shop. Web also drops the lock when the tab is hidden
 * and does not restore it, so treat this as best-effort there and reliable on
 * native.
 */
function useKeepAwakeWhen(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => {});
    };
  }, [enabled]);
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
  onRemove,
  keepAwake,
  onKeepAwakeChange,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { format } = useCurrency();

  // Holds the screen on while this view is mounted and the option is ticked.
  // The hook handles its own cleanup, so leaving Shopping Mode — including by
  // switching sub-tabs, which unmounts this — always releases the lock.
  useKeepAwakeWhen(keepAwake);

  // Item ids and custom names share one key space so both can be ticked.
  const rows = useMemo(
    () => [
      ...items.map((it) => ({ key: `i${it.itemId}`, item: it, name: it.itemName })),
      ...customItems.map((name, i) => ({ key: `c${i}`, item: null, name })),
    ],
    [items, customItems],
  );

  // Grouped the way a trip actually runs: you are in one shop at a time, and
  // within it you walk aisles. So store first, then category — not the flat
  // list the Create-list tab shows, where ordering is about choosing.
  const groups = useMemo(() => {
    const byStore = new Map<string, Map<string, typeof rows>>();
    for (const row of rows) {
      const store =
        row.item?.recommendedStoreName ?? row.item?.lowestPriceStoreName ?? UNKNOWN_STORE;
      const category = row.item?.category || UNKNOWN_CATEGORY;
      if (!byStore.has(store)) byStore.set(store, new Map());
      const cats = byStore.get(store)!;
      if (!cats.has(category)) cats.set(category, []);
      cats.get(category)!.push(row);
    }

    // "Any store" sinks to the bottom — it is the leftovers bucket, not a shop.
    const storeNames = [...byStore.keys()].sort((a, b) => {
      if (a === UNKNOWN_STORE) return 1;
      if (b === UNKNOWN_STORE) return -1;
      return a.localeCompare(b);
    });

    return storeNames.map((store) => {
      const cats = byStore.get(store)!;
      const catNames = [...cats.keys()].sort((a, b) => {
        if (a === UNKNOWN_CATEGORY) return 1;
        if (b === UNKNOWN_CATEGORY) return -1;
        return a.localeCompare(b);
      });
      return {
        store,
        categories: catNames.map((category) => ({ category, rows: cats.get(category)! })),
        total: [...cats.values()].reduce((n, r) => n + r.length, 0),
      };
    });
  }, [rows]);

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
      <View style={[styles.topBar, { backgroundColor: colors.accent }]}>
        <TouchableOpacity
          style={styles.keepAwakeRow}
          onPress={() => onKeepAwakeChange(!keepAwake)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: keepAwake }}
          accessibilityLabel="Keep the screen on while shopping"
        >
          <View
            style={[
              styles.keepAwakeBox,
              {
                borderColor: keepAwake ? colors.primary : colors.border,
                backgroundColor: keepAwake ? colors.primary : "transparent",
              },
            ]}
          >
            {keepAwake ? <Feather name="check" size={12} color="#fff" /> : null}
          </View>
          <Text style={[styles.keepAwakeText, { color: colors.mutedForeground }]}>
            Keep screen on
          </Text>
        </TouchableOpacity>
      </View>

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
        {groups.map((group) => (
          <View key={group.store}>
            <View style={[styles.storeHeader, { backgroundColor: colors.accent }]}>
              <Feather name="map-pin" size={13} color={colors.primary} />
              <Text style={[styles.storeHeaderText, { color: colors.primary }]} numberOfLines={1}>
                {group.store}
              </Text>
              <Text style={[styles.storeHeaderCount, { color: colors.primary }]}>
                {group.total}
              </Text>
            </View>

            {group.categories.map(({ category, rows: catRows }) => (
              <View key={`${group.store}:${category}`}>
                <Text style={[styles.categoryHeader, { color: colors.mutedForeground }]}>
                  {category}
                </Text>

                {catRows.map((row) => {
                  const isPicked = picked.has(row.key);
                  const price = row.item?.recommendedPrice ?? row.item?.lowestPrice ?? null;
                  return (
                    <View key={row.key} style={[styles.row, { borderBottomColor: colors.border }]}>
                      <TouchableOpacity
                        style={styles.rowTap}
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

                        <Text style={styles.rowIcon}>
                          {row.item?.icon || (row.item ? "🛒" : "📝")}
                        </Text>

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

                      {/* Removes the row from THIS trip only — it stays on the
                          shopping list, because "not buying it today" is not the
                          same as "done with it". */}
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => onRemove({ itemId: row.item?.itemId ?? null, name: row.name })}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${row.name} from this trip`}
                      >
                        <Feather name="x" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
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
  topBar: {
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
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
  storeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  storeHeaderText: { flex: 1, fontSize: 13.5, fontFamily: "Inter_700Bold" },
  storeHeaderCount: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  categoryHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 14,
  },
  removeBtn: { padding: 6 },
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
  keepAwakeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingBottom: 12,
  },
  keepAwakeBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  keepAwakeText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
