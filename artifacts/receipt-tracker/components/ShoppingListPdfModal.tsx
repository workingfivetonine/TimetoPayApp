import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import { downloadShoppingListPdf, type PriceMode, type GroupMode } from "@/lib/shoppingListPdf";
import type { ShoppingListItem } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionFilter = "all" | "regular" | "oneoff" | "ranout";

interface MergePair {
  id: string;
  itemA: ShoppingListItem;
  itemB: ShoppingListItem;
  dismissed: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  recurring: ShoppingListItem[];
  oneOff: ShoppingListItem[];
  preparedFor: string;
  // Rendered as a sub-tab of the shopping screen rather than a modal: no
  // overlay, no sheet chrome, no close button (switching tabs is the way out).
  inline?: boolean;
  // Everything the user builds up here is owned by the parent when inline. As a
  // sub-tab this component is unmounted whenever another sub-tab is showing, so
  // any state kept locally would be destroyed on every tab switch — the parent
  // holding it is what makes the selection survive, and what lets Shopping Mode
  // read the ticked set. Each of these is controlled iff the value prop is
  // passed; the modal path passes none of them and keeps owning them locally.
  //
  // The change handlers take a SetStateAction rather than a plain value so the
  // parent's raw useState setter can be passed straight through and React's
  // update queueing is preserved — otherwise two taps landing in one batch would
  // both read the same stale value and one would be dropped.
  //
  // `excluded` holds the DEselected item ids — empty means everything included.
  excluded?: Set<number>;
  onExcludedChange?: React.Dispatch<React.SetStateAction<Set<number>>>;
  // Free-text extras so Shopping Mode can show them alongside the real items.
  // They have no item id, so they travel as names.
  customItems?: string[];
  onCustomItemsChange?: React.Dispatch<React.SetStateAction<string[]>>;
  // Per-item quantity overrides; absent id means 1. Only feeds the PDF/share
  // output, but it is lost on a tab switch for the same reason if not lifted.
  quantities?: Map<number, number>;
  onQuantitiesChange?: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  // An accepted merge decision, which is two pieces: `mergedOut` is the discarded
  // duplicate's id (hidden outright, distinct from merely unticked), and
  // `nameOverrides` is the display name the surviving row takes. Both have to be
  // lifted or the merge silently undoes itself on a tab switch.
  mergedOut?: Set<number>;
  onMergedOutChange?: React.Dispatch<React.SetStateAction<Set<number>>>;
  nameOverrides?: Map<number, string>;
  onNameOverridesChange?: React.Dispatch<React.SetStateAction<Map<number, string>>>;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, n + 1, ...curr);
  }
  return prev[n];
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findSimilarPairs(items: ShoppingListItem[]): MergePair[] {
  const pairs: MergePair[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = normalizeName(items[i].itemName);
      const b = normalizeName(items[j].itemName);
      if (!a || !b || Math.abs(a.length - b.length) > 5) continue;
      const threshold = Math.max(a.length, b.length) <= 8 ? 1 : 2;
      if (levenshtein(a, b) <= threshold) {
        const key = `${Math.min(items[i].itemId, items[j].itemId)}-${Math.max(items[i].itemId, items[j].itemId)}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({ id: key, itemA: items[i], itemB: items[j], dismissed: false });
        }
      }
    }
  }
  return pairs;
}

function formatRanOut(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return "";
  return `$${price.toFixed(2)}`;
}

function getItemMeta(item: ShoppingListItem, mode: PriceMode): string {
  const price = mode === "lowest" ? item.lowestPrice : item.recommendedPrice;
  const store = (mode === "lowest" ? item.lowestPriceStoreName : item.recommendedStoreName)?.trim() ?? "";
  const parts: string[] = [];
  const p = formatPrice(price);
  if (p) parts.push(p);
  if (store) parts.push(store);
  return parts.join(" · ");
}

function getItemStore(item: ShoppingListItem, mode: PriceMode): string {
  return ((mode === "lowest" ? item.lowestPriceStoreName : item.recommendedStoreName) ?? "").trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShoppingListPdfModal({
  visible,
  onClose,
  recurring,
  oneOff,
  preparedFor,
  inline = false,
  excluded: excludedProp,
  onExcludedChange,
  customItems: customItemsProp,
  onCustomItemsChange,
  quantities: quantitiesProp,
  onQuantitiesChange,
  mergedOut: mergedOutProp,
  onMergedOutChange,
  nameOverrides: nameOverridesProp,
  onNameOverridesChange,
}: Props) {
  const colors = useColors();
  const { symbol } = useCurrency();

  // Core builder state. Each piece is controlled by the parent when the matching
  // value prop is passed (the inline/sub-tab case); otherwise owned locally, as
  // the modal always did. Deliberately NOT a local-state-plus-mirror-effect: as
  // a sub-tab this component unmounts on every tab switch, so a mirror effect
  // would refire on remount with the empty initial value and clobber the
  // parent's copy — wiping exactly the state the lift was meant to preserve.
  const [excludedLocal, setExcludedLocal] = useState<Set<number>>(new Set());
  const excluded = excludedProp ?? excludedLocal;
  const setExcluded =
    excludedProp !== undefined && onExcludedChange ? onExcludedChange : setExcludedLocal;

  const [quantitiesLocal, setQuantitiesLocal] = useState<Map<number, number>>(new Map());
  const quantities = quantitiesProp ?? quantitiesLocal;
  const setQuantities =
    quantitiesProp !== undefined && onQuantitiesChange ? onQuantitiesChange : setQuantitiesLocal;

  const [customItemsLocal, setCustomItemsLocal] = useState<string[]>([]);
  const customItems = customItemsProp ?? customItemsLocal;
  const setCustomItems =
    customItemsProp !== undefined && onCustomItemsChange ? onCustomItemsChange : setCustomItemsLocal;

  const [customInput, setCustomInput] = useState("");
  const [generating, setGenerating] = useState(false);

  // Filter / display state
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [activeStores, setActiveStores] = useState<Set<string>>(new Set());
  const [priceMode, setPriceMode] = useState<PriceMode>("lowest");
  const [groupMode, setGroupMode] = useState<GroupMode>("category");

  // Merge state. `mergePairs` is recomputed from the list itself so it needn't be
  // lifted, but the accepted DECISIONS must be — see the prop comments.
  const [mergePairs, setMergePairs] = useState<MergePair[]>([]);

  const [mergedOutLocal, setMergedOutLocal] = useState<Set<number>>(new Set());
  const mergedOut = mergedOutProp ?? mergedOutLocal;
  const setMergedOut =
    mergedOutProp !== undefined && onMergedOutChange ? onMergedOutChange : setMergedOutLocal;

  const [nameOverridesLocal, setNameOverridesLocal] = useState<Map<number, string>>(new Map());
  const nameOverrides = nameOverridesProp ?? nameOverridesLocal;
  const setNameOverrides =
    nameOverridesProp !== undefined && onNameOverridesChange
      ? onNameOverridesChange
      : setNameOverridesLocal;

  // Reset state each time the modal opens. Skipped entirely when inline: as a
  // sub-tab there is no "open" moment, and wiping the selection on every tab
  // switch would defeat the point of the parent owning it.
  useEffect(() => {
    if (inline) return;
    if (visible) {
      setExcluded(new Set());
      setQuantities(new Map());
      setCustomItems([]);
      setCustomInput("");
      setGenerating(false);
      setSectionFilter("all");
      setActiveCats(new Set());
      setActiveStores(new Set());
      setPriceMode("lowest");
      setMergedOut(new Set());
      setNameOverrides(new Map());
      setMergePairs(findSimilarPairs([...recurring, ...oneOff]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, inline]);

  // Inline has no open event, so merge suggestions are computed from the list
  // itself and refresh when the list changes.
  useEffect(() => {
    if (!inline) return;
    setMergePairs(findSimilarPairs([...recurring, ...oneOff]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, recurring, oneOff]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const activePairs = useMemo(
    () => mergePairs.filter((p) => !p.dismissed && !mergedOut.has(p.itemA.itemId) && !mergedOut.has(p.itemB.itemId)),
    [mergePairs, mergedOut],
  );

  const sectionFiltered = useMemo(() => {
    const base = (items: ShoppingListItem[]) => items.filter((it) => !mergedOut.has(it.itemId));
    const reg = base(recurring);
    const off = base(oneOff);
    switch (sectionFilter) {
      case "regular": return { regular: reg, oneOff: [] as ShoppingListItem[] };
      case "oneoff":  return { regular: [] as ShoppingListItem[], oneOff: off };
      case "ranout":  return { regular: reg.filter((it) => it.ranOutAt != null), oneOff: off.filter((it) => it.ranOutAt != null) };
      default:        return { regular: reg, oneOff: off };
    }
  }, [recurring, oneOff, mergedOut, sectionFilter]);

  const availCats = useMemo(() => {
    const cats = new Set<string>();
    for (const it of [...sectionFiltered.regular, ...sectionFiltered.oneOff]) {
      if (it.category?.trim()) cats.add(it.category.trim());
    }
    return Array.from(cats).sort();
  }, [sectionFiltered]);

  const availStores = useMemo(() => {
    const stores = new Set<string>();
    for (const it of [...sectionFiltered.regular, ...sectionFiltered.oneOff]) {
      const s = getItemStore(it, priceMode);
      if (s) stores.add(s);
    }
    return Array.from(stores).sort();
  }, [sectionFiltered, priceMode]);

  const filtered = useMemo(() => {
    const apply = (items: ShoppingListItem[]) =>
      items.filter((it) => {
        if (activeCats.size > 0 && !activeCats.has(it.category?.trim() ?? "")) return false;
        if (activeStores.size > 0 && !activeStores.has(getItemStore(it, priceMode))) return false;
        return true;
      });
    return { regular: apply(sectionFiltered.regular), oneOff: apply(sectionFiltered.oneOff) };
  }, [sectionFiltered, activeCats, activeStores, priceMode]);

  const grouped = useMemo(() => {
    const groupByCat = (items: ShoppingListItem[]) => {
      const map = new Map<string, ShoppingListItem[]>();
      for (const it of items) {
        const cat = it.category?.trim() || "Other";
        const b = map.get(cat) ?? [];
        b.push(it);
        map.set(cat, b);
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)))
        .map(([cat, catItems]) => ({
          cat,
          items: catItems.slice().sort((a, b) => {
            if (a.ranOutAt && !b.ranOutAt) return -1;
            if (!a.ranOutAt && b.ranOutAt) return 1;
            return a.itemName.localeCompare(b.itemName);
          }),
        }));
    };
    return { regular: groupByCat(filtered.regular), oneOff: groupByCat(filtered.oneOff) };
  }, [filtered]);

  const selectedCount =
    filtered.regular.filter((it) => !excluded.has(it.itemId)).length +
    filtered.oneOff.filter((it) => !excluded.has(it.itemId)).length +
    customItems.length;

  const showSectionHeaders = sectionFilter === "all" || sectionFilter === "ranout";

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const toggle = (id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Bulk select/deselect acts on the CURRENTLY VISIBLE items only, so it
  // composes with the category/store filters instead of silently reaching
  // items the user has filtered out of view.
  const visibleIds = useMemo(
    () => [...filtered.regular, ...filtered.oneOff].map((it) => it.itemId),
    [filtered],
  );

  const selectAllVisible = () => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.delete(id);
      return next;
    });
  };

  const deselectAllVisible = () => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const toggleCat = (cat: string) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const toggleStore = (store: string) => {
    setActiveStores((prev) => {
      const next = new Set(prev);
      if (next.has(store)) next.delete(store); else next.add(store);
      return next;
    });
  };

  const getQty = (id: number) => quantities.get(id) ?? 1;

  const adjustQty = (id: number, delta: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? 1;
      const val = Math.max(1, cur + delta);
      if (val === 1) next.delete(id); else next.set(id, val);
      return next;
    });
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    setCustomItems((prev) => [...prev, trimmed]);
    setCustomInput("");
  };

  const removeCustom = (index: number) => {
    setCustomItems((prev) => prev.filter((_, i) => i !== index));
  };

  const dismissPair = (id: string) => {
    setMergePairs((prev) => prev.map((p) => (p.id === id ? { ...p, dismissed: true } : p)));
  };

  // Accepting a merge always discards itemB and keeps itemA's slot; the two
  // branches differ only in which NAME is displayed on that slot.
  //
  // The discarded id has to land in BOTH sets, and they are not redundant:
  // `mergedOut` hides the row outright in here and in the PDF/Share output, while
  // `excluded` is what the parent screen reads to build the Shopping Mode list.
  // Adding to `mergedOut` alone made the duplicate vanish from Create list but
  // reappear as its own tickable row in Shopping, double-counting in the basket
  // total.
  const acceptMerge = (pair: MergePair, displayName?: string) => {
    setMergedOut((prev) => new Set([...prev, pair.itemB.itemId]));
    if (displayName !== undefined) {
      setNameOverrides((prev) => new Map([...prev, [pair.itemA.itemId, displayName]]));
    }
    setExcluded((prev) => {
      const n = new Set(prev);
      n.delete(pair.itemA.itemId);
      n.add(pair.itemB.itemId);
      return n;
    });
    dismissPair(pair.id);
  };

  const handleMerge = (pair: MergePair) => {
    Alert.alert(
      "Merge Similar Items",
      `"${pair.itemA.itemName}" and "${pair.itemB.itemName}" look similar.\n\nWhich name should be kept?`,
      [
        { text: pair.itemA.itemName, onPress: () => acceptMerge(pair) },
        { text: pair.itemB.itemName, onPress: () => acceptMerge(pair, pair.itemB.itemName) },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  // ─── Export helpers ────────────────────────────────────────────────────────

  const getDisplayName = (item: ShoppingListItem) => nameOverrides.get(item.itemId) ?? item.itemName;

  const buildTextList = () => {
    const lines: string[] = [];
    lines.push(`🛒 Shopping List${preparedFor ? ` · ${preparedFor}` : ""}`);

    const buildSection = (title: string, groups: { cat: string; items: ShoppingListItem[] }[]) => {
      const hasVisible = groups.some((g) => g.items.some((it) => !excluded.has(it.itemId)));
      if (!hasVisible) return;
      lines.push("");
      lines.push(title);
      lines.push("─".repeat(Math.max(title.length, 8)));
      for (const { cat, items: catItems } of groups) {
        const visible = catItems.filter((it) => !excluded.has(it.itemId));
        if (visible.length === 0) continue;
        lines.push("");
        lines.push(cat);
        for (const item of visible) {
          const name = getDisplayName(item);
          const meta = getItemMeta(item, priceMode);
          const ranOut = item.ranOutAt ? " [ran out]" : "";
          const qty = getQty(item.itemId);
          const qtyStr = qty > 1 ? `×${qty} ` : "";
          lines.push(`☐ ${item.icon || "•"} ${qtyStr}${name}${ranOut}${meta ? `  ${meta}` : ""}`);
        }
      }
    };

    buildSection("Regular", grouped.regular);
    buildSection("One-Off Items", grouped.oneOff);

    if (customItems.length > 0) {
      lines.push("");
      lines.push("Added");
      lines.push("─────");
      for (const name of customItems) {
        lines.push(`☐ ${name}`);
      }
    }

    return lines.join("\n");
  };

  const handleShareText = async () => {
    if (selectedCount === 0) {
      Alert.alert("Nothing selected", "Select at least one item to share.");
      return;
    }
    try {
      await Share.share({ message: buildTextList(), title: "Shopping List" });
    } catch {
      // User cancelled share sheet — no-op
    }
  };

  const handleGenerate = async () => {
    if (generating) return;
    if (selectedCount === 0) {
      Alert.alert("Nothing selected", "Select at least one item to export.");
      return;
    }
    setGenerating(true);
    try {
      const applyOverrides = (items: ShoppingListItem[]) =>
        items.map((it) =>
          nameOverrides.has(it.itemId) ? { ...it, itemName: nameOverrides.get(it.itemId)! } : it,
        );
      await downloadShoppingListPdf({
        regularItems: applyOverrides(filtered.regular.filter((it) => !excluded.has(it.itemId))),
        oneOffItems: applyOverrides(filtered.oneOff.filter((it) => !excluded.has(it.itemId))),
        customItems,
        preparedFor,
        priceMode,
        groupMode,
        quantities: Object.fromEntries(quantities),
        currencySymbol: symbol,
      });
      onClose();
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error && err.message ? err.message : "Could not generate the PDF.",
      );
    } finally {
      setGenerating(false);
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderItem = (item: ShoppingListItem) => {
    const checked = !excluded.has(item.itemId);
    const ranOut = item.ranOutAt != null;
    const meta = getItemMeta(item, priceMode);
    const displayName = getDisplayName(item);

    return (
      <TouchableOpacity
        key={item.itemId}
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => toggle(item.itemId)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: checked ? colors.primary : colors.border,
              backgroundColor: checked ? colors.primary : "transparent",
            },
          ]}
        >
          {checked && <Feather name="check" size={14} color={colors.primaryForeground} />}
        </View>
        <Text style={styles.rowIcon}>{item.icon || "🛒"}</Text>
        <View style={styles.rowMain}>
          <Text
            style={[
              styles.rowName,
              {
                color: ranOut ? colors.mutedForeground : colors.foreground,
                fontStyle: ranOut ? "italic" : "normal",
              },
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {ranOut && (
            <View style={styles.ranOutRow}>
              <View style={[styles.ranOutTag, { backgroundColor: colors.spendHigh }]}>
                <Text style={[styles.ranOutText, { color: colors.spendHighText }]}>RAN OUT</Text>
              </View>
              <Text style={[styles.ranOutDate, { color: colors.mutedForeground }]}>
                {formatRanOut(item.ranOutAt as string)}
              </Text>
            </View>
          )}
          {meta ? (
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {/* Quantity stepper — only visible when item is checked */}
        {checked && (
          <View style={styles.qtyStepper}>
            <TouchableOpacity
              style={[styles.qtyBtn, { borderColor: colors.border }]}
              onPress={(e) => { e.stopPropagation?.(); adjustQty(item.itemId, -1); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            >
              <Feather name="minus" size={12} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.qtyValue, { color: colors.foreground }]}>{getQty(item.itemId)}</Text>
            <TouchableOpacity
              style={[styles.qtyBtn, { borderColor: colors.border }]}
              onPress={(e) => { e.stopPropagation?.(); adjustQty(item.itemId, 1); }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            >
              <Feather name="plus" size={12} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderGroups = (
    groups: { cat: string; items: ShoppingListItem[] }[],
    emptyMsg: string,
  ) => {
    if (groups.length === 0 || groups.every((g) => g.items.length === 0)) {
      return emptyMsg ? (
        <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>{emptyMsg}</Text>
      ) : null;
    }
    return groups.map(({ cat, items: catItems }) => (
      <View key={cat}>
        <Text style={[styles.catHeader, { color: colors.mutedForeground, borderBottomColor: colors.border }]}>
          {cat}
        </Text>
        {catItems.map(renderItem)}
      </View>
    ));
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  // Built as an element, not a wrapper component: a component defined inside
  // render gets a new identity every pass, so React would unmount and remount
  // this whole subtree on each keystroke and the custom-item input would lose
  // focus. Inline drops the overlay/sheet framing; the modal path is unchanged.
  const content = (
    <>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {inline ? "Build your list" : "Review & Export"}
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
              </Text>
            </View>
            {inline ? null : (
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter bar */}
          <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
            {/* Section pills + price toggle */}
            <View style={styles.filterRow}>
              {(["all", "regular", "oneoff", "ranout"] as SectionFilter[]).map((f) => {
                const label = f === "all" ? "All" : f === "regular" ? "Regular" : f === "oneoff" ? "One-offs" : "Ran Out";
                const active = sectionFilter === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.pill,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : "transparent",
                      },
                    ]}
                    onPress={() => setSectionFilter(f)}
                  >
                    <Text style={[styles.pillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.priceToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setPriceMode((m) => (m === "lowest" ? "recent" : "lowest"))}
              >
                <Text style={[styles.priceToggleText, { color: colors.primary }]}>
                  {priceMode === "lowest" ? "$ Lowest" : "⏱ Recent"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.priceToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() =>
                  setGroupMode((m) => (m === "category" ? "store" : m === "store" ? "alpha" : "category"))
                }
                accessibilityLabel="Change how the list is grouped"
              >
                <Text style={[styles.priceToggleText, { color: colors.primary }]}>
                  {groupMode === "category" ? "📂 By category" : groupMode === "store" ? "🏬 By store" : "🔤 A–Z"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Category chips */}
            {availCats.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipRow}
              >
                {availCats.map((cat) => {
                  const active = activeCats.has(cat);
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : "transparent",
                        },
                      ]}
                      onPress={() => toggleCat(cat)}
                    >
                      <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Store chips */}
            {availStores.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipRow}
              >
                {availStores.map((store) => {
                  const active = activeStores.has(store);
                  return (
                    <TouchableOpacity
                      key={store}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? colors.accent : colors.border,
                          backgroundColor: active ? colors.accent : "transparent",
                        },
                      ]}
                      onPress={() => toggleStore(store)}
                    >
                      <Text style={[styles.chipText, { color: active ? colors.accentForeground : colors.mutedForeground }]}>
                        🏪 {store}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Custom items — kept at the top so anything not already tracked
                can be added before working down the list. */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Add a custom item</Text>
              <View style={styles.customInputRow}>
                <TextInput
                  style={[
                    styles.customInput,
                    { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  placeholder="e.g. Birthday candles"
                  placeholderTextColor={colors.mutedForeground}
                  value={customInput}
                  onChangeText={setCustomInput}
                  onSubmitEditing={addCustom}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.accent }]}
                  onPress={addCustom}
                  accessibilityLabel="Add custom item"
                >
                  <Feather name="plus" size={20} color={colors.accentForeground} />
                </TouchableOpacity>
              </View>
              {customItems.map((name, index) => (
                <View key={`${name}-${index}`} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <Text style={styles.rowIcon}>📝</Text>
                  <Text style={[styles.rowName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeCustom(index)}
                    accessibilityLabel="Remove custom item"
                    style={styles.removeBtn}
                  >
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Bulk selection */}
            {visibleIds.length > 0 && (
              <View style={styles.bulkRow}>
                <TouchableOpacity
                  style={[styles.bulkBtn, { borderColor: colors.border }]}
                  onPress={selectAllVisible}
                  accessibilityLabel="Select all shown items"
                >
                  <Feather name="check-square" size={14} color={colors.primary} />
                  <Text style={[styles.bulkBtnText, { color: colors.primary }]}>Select all</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkBtn, { borderColor: colors.border }]}
                  onPress={deselectAllVisible}
                  accessibilityLabel="Deselect all shown items"
                >
                  <Feather name="square" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.bulkBtnText, { color: colors.mutedForeground }]}>Deselect all</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Merge suggestions */}
            {activePairs.length > 0 && (
              <View style={[styles.mergeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.mergeCardHeader}>
                  <Feather name="git-merge" size={14} color={colors.primary} />
                  <Text style={[styles.mergeCardTitle, { color: colors.foreground }]}>
                    Suggested merges
                  </Text>
                </View>
                {activePairs.map((pair) => (
                  <View key={pair.id} style={[styles.mergePairRow, { borderTopColor: colors.border }]}>
                    <View style={styles.mergePairNames}>
                      <Text style={[styles.mergePairName, { color: colors.foreground }]} numberOfLines={1}>
                        "{pair.itemA.itemName}"
                      </Text>
                      <Text style={[styles.mergePairSep, { color: colors.mutedForeground }]}> ≈ </Text>
                      <Text style={[styles.mergePairName, { color: colors.foreground }]} numberOfLines={1}>
                        "{pair.itemB.itemName}"
                      </Text>
                    </View>
                    <View style={styles.mergePairActions}>
                      <TouchableOpacity
                        style={[styles.mergeBtn, { backgroundColor: colors.primary }]}
                        onPress={() => handleMerge(pair)}
                      >
                        <Text style={[styles.mergeBtnText, { color: colors.primaryForeground }]}>Merge</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => dismissPair(pair.id)} style={styles.mergeDismiss}>
                        <Feather name="x" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Regular items */}
            {(sectionFilter !== "oneoff") && (
              <View style={styles.section}>
                {showSectionHeaders && (
                  <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Regular</Text>
                )}
                {renderGroups(grouped.regular, "No regular items match the current filters.")}
              </View>
            )}

            {/* One-off items */}
            {(sectionFilter !== "regular") && filtered.oneOff.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>One-off items</Text>
                {renderGroups(grouped.oneOff, "")}
              </View>
            )}

          </ScrollView>

          {/* Footer */}
          <View
            style={[
              styles.footer,
              { borderTopColor: colors.border, paddingBottom: Platform.OS === "ios" ? 28 : 16 },
            ]}
          >
            {/* No Cancel inline — switching sub-tabs is how you leave. */}
            {inline ? null : (
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={onClose}
                disabled={generating}
              >
                <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={handleShareText}
              disabled={generating}
              activeOpacity={0.8}
            >
              <Feather name="share-2" size={16} color={colors.foreground} />
              <Text style={[styles.shareBtnText, { color: colors.foreground }]}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.generateBtn, { backgroundColor: colors.primary }]}
              onPress={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="file-text" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.generateText, { color: colors.primaryForeground }]}>PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
    </>
  );

  if (inline) {
    return (
      <View style={[styles.inlineRoot, { backgroundColor: colors.background }]}>{content}</View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>{content}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  inlineRoot: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { padding: 4, marginLeft: 8 },

  // Filter bar
  filterBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  priceToggle: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  priceToggleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // Same guard as the board's filter row: a horizontal ScrollView has no
  // intrinsic height, so give it one it can't be squeezed below.
  chipScroll: { flexGrow: 0, flexShrink: 0, minHeight: 30 },
  chipRow: { gap: 6, paddingHorizontal: 2, alignItems: "center", minHeight: 30 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  // Merge card
  mergeCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    overflow: "hidden",
  },
  mergeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mergeCardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  mergePairRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  mergePairNames: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    minWidth: 0,
  },
  mergePairName: { fontSize: 12, fontFamily: "Inter_500Medium", flexShrink: 1 },
  mergePairSep: { fontSize: 12, fontFamily: "Inter_400Regular" },
  mergePairActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  mergeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  mergeBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  mergeDismiss: { padding: 4 },

  // Body
  body: { paddingHorizontal: 20 },
  section: { marginTop: 16 },
  bulkRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  bulkBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  catHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 10,
    marginBottom: 2,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyMsg: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },

  // Item row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowIcon: { fontSize: 18, marginRight: 10 },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  ranOutRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  ranOutTag: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  ranOutText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  ranOutDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  qtyStepper: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 },
  qtyBtn: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qtyValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", minWidth: 18, textAlign: "center" },

  // Custom items
  customInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  customInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  addBtn: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  removeBtn: { padding: 4 },

  // Footer
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  shareBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  shareBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  generateBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  generateText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
