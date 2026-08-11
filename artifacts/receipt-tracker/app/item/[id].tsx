import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
  Modal,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Path,
  Circle,
  Line as SvgLine,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import {
  useGetItemHistory,
  useMarkRanOut,
  useUpdateItem,
  useDeleteItem,
  useFindSimilarItem,
  useMergeItem,
  useListItems,
  getGetShoppingListQueryKey,
  getGetItemHistoryQueryKey,
  getGetItemPriceHistoryQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuth } from "@clerk/expo";
import { getApiOrigin } from "@/lib/apiBase";
import { confirmDestructive, notify } from "@/lib/confirm";
import { OfflineBanner } from "@/components/OfflineBanner";
import { RenameMergeModal, type SimilarMatch } from "@/components/RenameMergeModal";
import { MergePickerModal, type MergeCandidate } from "@/components/MergePickerModal";
import type { ItemHistoryEntry } from "@workspace/api-client-react";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Price Trend Chart ────────────────────────────────────────────────────────

const CHART_H = 160;
const PAD = { left: 52, right: 16, top: 18, bottom: 30 };

interface ChartProps {
  history: ItemHistoryEntry[];
  lowestPrice: number;
  highestPrice: number;
  trendColor: string;
  borderColor: string;
  mutedColor: string;
  cardColor: string;
}

function PriceTrendChart({
  history,
  lowestPrice,
  highestPrice,
  trendColor,
  borderColor,
  mutedColor,
  cardColor,
}: ChartProps) {
  const { symbol } = useCurrency();
  const screenW = Dimensions.get("window").width;
  const svgW = screenW - 32;
  const svgH = CHART_H;

  const pts = [...history].reverse();
  if (pts.length === 0) return null;

  const cLeft = PAD.left;
  const cRight = svgW - PAD.right;
  const cTop = PAD.top;
  const cBottom = svgH - PAD.bottom;
  const cW = cRight - cLeft;
  const cH = cBottom - cTop;

  const priceRange = highestPrice - lowestPrice || 1;
  const paddedMin = lowestPrice - priceRange * 0.18;
  const paddedMax = highestPrice + priceRange * 0.18;
  const paddedRange = paddedMax - paddedMin;

  const toX = (i: number) =>
    pts.length === 1 ? (cLeft + cRight) / 2 : cLeft + (i / (pts.length - 1)) * cW;
  const toY = (price: number) =>
    cBottom - ((price - paddedMin) / paddedRange) * cH;

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.price).toFixed(1)}`)
    .join(" ");
  const fillPath =
    pts.length > 1
      ? `${linePath} L ${toX(pts.length - 1).toFixed(1)} ${cBottom} L ${toX(0).toFixed(1)} ${cBottom} Z`
      : "";

  const yTicks = [lowestPrice, highestPrice];
  if (priceRange > 0.02) yTicks.push((lowestPrice + highestPrice) / 2);

  const xLabels: { label: string; x: number; anchor: "start" | "end" | "middle" }[] = [
    { label: shortDate(pts[0].purchasedAt), x: toX(0), anchor: "start" },
  ];
  if (pts.length > 1) {
    xLabels.push({
      label: shortDate(pts[pts.length - 1].purchasedAt),
      x: toX(pts.length - 1),
      anchor: "end",
    });
  }
  if (pts.length >= 6) {
    const mid = Math.floor(pts.length / 2);
    xLabels.push({ label: shortDate(pts[mid].purchasedAt), x: toX(mid), anchor: "middle" });
  }

  return (
    <Svg width={svgW} height={svgH}>
      <Defs>
        <LinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={trendColor} stopOpacity="0.22" />
          <Stop offset="100%" stopColor={trendColor} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {yTicks.map((tick, i) => (
        <SvgLine
          key={i}
          x1={cLeft} y1={toY(tick)} x2={cRight} y2={toY(tick)}
          stroke={borderColor} strokeWidth={0.6} strokeDasharray="3 4"
        />
      ))}
      {yTicks.map((tick, i) => (
        <SvgText key={i} x={cLeft - 5} y={toY(tick) + 4} textAnchor="end" fontSize={9.5} fill={mutedColor}>
          {symbol}{tick.toFixed(2)}
        </SvgText>
      ))}
      {fillPath ? <Path d={fillPath} fill="url(#fillGrad)" /> : null}
      {pts.length > 1 && (
        <Path d={linePath} stroke={trendColor} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
      {pts.map((p, i) => (
        <Circle
          key={i} cx={toX(i)} cy={toY(p.price)}
          r={pts.length === 1 ? 6 : pts.length <= 8 ? 4 : 3}
          fill={trendColor} stroke={cardColor} strokeWidth={2}
        />
      ))}
      {xLabels.map((xl, i) => (
        <SvgText key={i} x={xl.x} y={svgH - 6} textAnchor={xl.anchor} fontSize={9.5} fill={mutedColor}>
          {xl.label}
        </SvgText>
      ))}
    </Svg>
  );
}

const EMOJI_CHOICES = [
  "🛒", "🍎", "🍌", "🍇", "🍓", "🍊", "🍋", "🍉", "🍐", "🍑",
  "🥑", "🍅", "🥕", "🥬", "🥦", "🌽", "🥔", "🧅", "🧄", "🍄",
  "🥖", "🍞", "🥐", "🥯", "🧇", "🥞", "🍚", "🍝", "🥫", "🥣",
  "🥩", "🍗", "🍖", "🥓", "🌭", "🍔", "🍕", "🐟", "🦐", "🥚",
  "🥛", "🧀", "🧈", "🍦", "🍫", "🍪", "🍩", "🍰", "🧁", "🍬",
  "☕", "🍵", "🧃", "🥤", "🍷", "🍺", "🧴", "🧻", "🧼", "🧽",
  "🪥", "🧂", "🍯", "🥜", "🌶️", "🫑", "🥒", "🍆", "🫒", "🥗",
];

// Mirrors the server's fixed category list (api-server lib/categories.ts).
const CATEGORY_CHOICES = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry", "Frozen",
  "Beverages", "Snacks", "Household", "Personal Care", "Baby", "Pet", "Other",
];

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function ItemHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { format } = useCurrency();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const itemId = parseInt(id ?? "0");
  const { data, isLoading, refetch, dataUpdatedAt } = useGetItemHistory(itemId);
  const { mutateAsync: markRanOut, isPending: ranOutPending } = useMarkRanOut();
  const { mutate: updateItem, isPending: iconSaving } = useUpdateItem();
  const { mutate: renameItem, isPending: renameSaving } = useUpdateItem();
  const { mutate: deleteItem, isPending: deletePending } = useDeleteItem();
  const { mutateAsync: findSimilarItem } = useFindSimilarItem();
  const { mutate: mergeItem, isPending: mergePending } = useMergeItem();
  const isOnline = useOnlineStatus();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [mergePickerOpen, setMergePickerOpen] = useState(false);
  // Only fetched once the picker actually opens — every other visit to this
  // screen has no use for the full item list.
  const { data: allItems, isLoading: allItemsLoading } = useListItems({
    query: { queryKey: getListItemsQueryKey(), enabled: mergePickerOpen },
  });

  // Editable details (category / brand / size) loaded from GET /items/:id.
  const { getToken } = useAuth();
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${getApiOrigin()}/api/items/${itemId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || !active) return;
        const item = (await res.json()) as {
          brand?: string | null;
          size?: string | null;
          category?: string | null;
        };
        if (!active) return;
        setBrand(item.brand ?? "");
        setSize(item.size ?? "");
        setCategory(item.category ?? null);
        setDetailsLoaded(true);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      active = false;
    };
    // Load once per item. getToken's identity changes every render, so including
    // it would re-fetch constantly and wipe what the user is typing (brand/size).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const saveDetails = async (patch: { brand?: string; size?: string; category?: string }) => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to edit details.");
      return;
    }
    setSavingDetails(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        notify("Couldn't save", "Please try again.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetItemHistoryQueryKey(itemId) });
      queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    } catch {
      notify("Couldn't save", "Check your connection and try again.");
    } finally {
      setSavingDetails(false);
    }
  };

  const pickCategory = (c: string) => {
    setCategory(c);
    setCatPickerOpen(false);
    void saveDetails({ category: c });
  };

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;

  const handlePickIcon = (icon: string) => {
    const trimmed = icon.trim();
    if (!trimmed) return;
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to change the icon.");
      return;
    }
    updateItem(
      { id: itemId, data: { icon: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetItemHistoryQueryKey(itemId) });
          queryClient.invalidateQueries({ queryKey: getGetItemPriceHistoryQueryKey(itemId) });
          queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
          queryClient.invalidateQueries({
            predicate: (q) =>
              typeof q.queryKey[0] === "string" &&
              (q.queryKey[0] as string).startsWith("/api/receipts"),
          });
          setPickerOpen(false);
          setCustomEmoji("");
        },
      }
    );
  };

  const handleRanOut = async () => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to update your list.");
      return;
    }
    await markRanOut({ id: itemId });
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() }),
    ]);
  };

  const handleDelete = () => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to delete this item.");
      return;
    }
    const name = data?.itemName ?? "this item";
    confirmDestructive({
      title: `Delete ${name}?`,
      message:
        "This permanently removes the item from your shopping list, price history, and every receipt it appears on. This can't be undone.",
      confirmLabel: "Delete",
      onConfirm: () => {
        deleteItem(
          { id: itemId },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
              queryClient.invalidateQueries({
                predicate: (q) =>
                  typeof q.queryKey[0] === "string" &&
                  ((q.queryKey[0] as string).startsWith("/api/receipts") ||
                    (q.queryKey[0] as string).startsWith("/api/analytics/stores")),
              });
              router.back();
            },
          }
        );
      },
    });
  };

  // A merge reassigns purchase history across receipts, same blast radius as
  // deleting the item outright, so it invalidates the same set of caches.
  const invalidateAfterMerge = () => {
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        ((q.queryKey[0] as string).startsWith("/api/receipts") ||
          (q.queryKey[0] as string).startsWith("/api/analytics/stores") ||
          (q.queryKey[0] as string).startsWith("/api/items")),
    });
  };

  const checkSimilarItem = async (name: string): Promise<SimilarMatch | null> => {
    const res = await findSimilarItem({ id: itemId, data: { name } });
    return res.match ? { id: res.match.itemId, name: res.match.name, score: res.match.score } : null;
  };

  const handleSaveName = (name: string) => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to rename this item.");
      return;
    }
    renameItem(
      { id: itemId, data: { name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetItemHistoryQueryKey(itemId) });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          setRenameOpen(false);
        },
        onError: () => notify("Couldn't rename", "Please try again."),
      },
    );
  };

  const runMerge = (targetId: number, onDone?: () => void) => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to merge items.");
      return;
    }
    mergeItem(
      { id: itemId, data: { targetId } },
      {
        onSuccess: (merged) => {
          invalidateAfterMerge();
          onDone?.();
          router.replace(`/item/${merged.id}`);
        },
        onError: () => notify("Couldn't merge", "Please try again."),
      },
    );
  };

  const handleMergeFromRename = (match: SimilarMatch) => runMerge(match.id, () => setRenameOpen(false));
  const handlePickMergeTarget = (targetId: number) => runMerge(targetId, () => setMergePickerOpen(false));

  const mergeCandidates: MergeCandidate[] = (allItems ?? [])
    .filter((i) => i.id !== itemId)
    .map((i) => ({
      id: i.id,
      title: i.name,
      subtitle: `${i.purchaseCount} purchase${i.purchaseCount === 1 ? "" : "s"}`,
    }));

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!data) return null;

  // Purchases that recorded a price. A purchase logged without one is still a
  // purchase (it stays in the history list below) but it is not a data point on
  // a price chart — plotting it as 0 dragged the axis floor down and made
  // "since first" measure against a price that was never paid. Mirrors
  // `isRealPrice` on the server; see artifacts/api-server/src/lib/prices.ts.
  const pricedHistory = data.history.filter((h) => Number(h.price) > 0);

  // Trend direction
  const chronoPts = [...pricedHistory].reverse();
  const firstPrice = chronoPts[0]?.price ?? 0;
  const lastPrice = chronoPts[chronoPts.length - 1]?.price ?? 0;
  const trendDelta = pricedHistory.length >= 2 ? lastPrice - firstPrice : 0;
  const trendColor =
    trendDelta < -0.005 ? colors.priceGood : trendDelta > 0.005 ? colors.priceBad : colors.primary;
  const trendIcon: "trending-down" | "trending-up" | "minus" =
    trendDelta < -0.005 ? "trending-down" : trendDelta > 0.005 ? "trending-up" : "minus";

  const days = data.daysSinceLastPurchase;
  const daysLabel =
    days == null ? null : days === 0 ? "Purchased today" : days === 1 ? "1 day ago" : `${days} days ago`;

  const ranOutAt = data.ranOutAt;
  const ranOutDaysAgo = ranOutAt
    ? Math.floor((Date.now() - new Date(ranOutAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerIconBadge, { backgroundColor: colors.accent }]}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.headerIconText}>{data.icon || "🛒"}</Text>
          <View style={[styles.headerIconEdit, { backgroundColor: colors.primary, borderColor: colors.background }]}>
            <Feather name="edit-2" size={9} color={colors.background} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.itemNameRow} onPress={() => setRenameOpen(true)} activeOpacity={0.7}>
          <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
            {data.itemName}
          </Text>
          <Feather name="edit-2" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <OfflineBanner lastUpdated={dataUpdatedAt} />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.priceGood }]}>{format(data.lowestPrice)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Lowest</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{format(data.averagePrice)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Average</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.priceBad }]}>{format(data.highestPrice)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Highest</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{data.purchaseCount}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Purchases</Text>
          </View>
        </View>

        {/* Details: category, brand, size */}
        <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.detailRow} onPress={() => setCatPickerOpen(true)} activeOpacity={0.7}>
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Category</Text>
            <View style={styles.detailValueRow}>
              <Text style={[styles.detailValue, { color: category ? colors.foreground : colors.mutedForeground }]}>
                {category ?? "Set category"}
              </Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          </TouchableOpacity>
          <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Brand</Text>
            <TextInput
              style={[styles.detailInput, { color: colors.foreground }]}
              value={brand}
              onChangeText={setBrand}
              onBlur={() => { if (detailsLoaded) void saveDetails({ brand }); }}
              placeholder="Optional"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
            />
          </View>
          <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Size</Text>
            <TextInput
              style={[styles.detailInput, { color: colors.foreground }]}
              value={size}
              onChangeText={setSize}
              onBlur={() => { if (detailsLoaded) void saveDetails({ size }); }}
              placeholder="e.g. 1 gallon"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
            />
          </View>
          {savingDetails ? (
            <Text style={[styles.detailSaving, { color: colors.mutedForeground }]}>Saving…</Text>
          ) : null}
        </View>

        {/* Ran-out card */}
        <View style={[styles.ranOutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Left: last purchased info */}
          <View style={styles.ranOutLeft}>
            <View style={styles.ranOutLabelRow}>
              <Feather name="clock" size={13} color={colors.mutedForeground} />
              <Text style={[styles.ranOutMetaLabel, { color: colors.mutedForeground }]}>
                Last purchased
              </Text>
            </View>
            <Text style={[styles.ranOutMetaValue, { color: colors.foreground }]}>
              {daysLabel ?? "—"}
            </Text>
            {data.lastPurchasedAt && (
              <Text style={[styles.ranOutMetaDate, { color: colors.mutedForeground }]}>
                {formatDate(data.lastPurchasedAt)}
              </Text>
            )}
          </View>

          {/* Divider */}
          <View style={[styles.ranOutDivider, { backgroundColor: colors.border }]} />

          {/* Right: ran-out status + button */}
          <View style={styles.ranOutRight}>
            {ranOutAt ? (
              <>
                <View style={styles.ranOutLabelRow}>
                  <Feather name="alert-circle" size={13} color={colors.priceBad} />
                  <Text style={[styles.ranOutMetaLabel, { color: colors.priceBad }]}>Ran out</Text>
                </View>
                <Text style={[styles.ranOutMetaValue, { color: colors.foreground }]}>
                  {ranOutDaysAgo === 0
                    ? "Today"
                    : ranOutDaysAgo === 1
                    ? "Yesterday"
                    : `${ranOutDaysAgo}d ago`}
                </Text>
                <Text style={[styles.ranOutMetaDate, { color: colors.mutedForeground }]}>
                  {formatDateTime(ranOutAt)}
                </Text>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.ranOutBtn, { backgroundColor: colors.accent, borderColor: colors.primary }]}
                onPress={handleRanOut}
                activeOpacity={0.7}
                disabled={ranOutPending}
              >
                {ranOutPending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Feather name="x-circle" size={15} color={colors.primary} />
                    <Text style={[styles.ranOutBtnText, { color: colors.primary }]}>
                      Mark Ran Out
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Price Trend Chart — only meaningful once something carried a price. */}
        {pricedHistory.length >= 1 && data.lowestPrice != null && data.highestPrice != null && (
          <>
            <View style={styles.chartSectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PRICE TREND</Text>
              {pricedHistory.length >= 2 && (
                <View style={styles.trendPill}>
                  <Feather name={trendIcon} size={12} color={trendColor} />
                  <Text style={[styles.trendText, { color: trendColor }]}>
                    {trendDelta === 0
                      ? "Stable"
                      : `${trendDelta > 0 ? "+" : ""}${format(Math.abs(trendDelta))} since first`}
                  </Text>
                </View>
              )}
            </View>
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <PriceTrendChart
                history={pricedHistory}
                lowestPrice={data.lowestPrice}
                highestPrice={data.highestPrice}
                trendColor={trendColor}
                borderColor={colors.border}
                mutedColor={colors.mutedForeground}
                cardColor={colors.card}
              />
            </View>
          </>
        )}

        {/* Purchase History */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
          PURCHASE HISTORY
        </Text>

        {data.history.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No purchase history yet</Text>
          </View>
        ) : (
          <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {data.history.map((entry, idx) => {
              const isLast = idx === data.history.length - 1;
              // A purchase logged without a price can't be the cheapest or the
              // dearest — it isn't a price at all. Without this guard, an item
              // whose purchases were all unpriced had every row badged "lowest".
              const hasPrice = Number(entry.price) > 0;
              const isLowest = hasPrice && entry.price === data.lowestPrice;
              const isHighest =
                hasPrice && entry.price === data.highestPrice && pricedHistory.length > 1;
              return (
                <TouchableOpacity
                  key={`${entry.receiptId}-${idx}`}
                  style={[
                    styles.historyRow,
                    !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  onPress={() => router.push(`/receipt/${entry.receiptId}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.historyLeft}>
                    <Text style={[styles.historyDate, { color: colors.foreground }]}>
                      {formatDate(entry.purchasedAt)}
                    </Text>
                    <View style={styles.storeRow}>
                      <Feather name="shopping-bag" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.historyStore, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {entry.storeName}
                      </Text>
                      {entry.quantity > 1 && (
                        <Text style={[styles.historyQty, { color: colors.mutedForeground }]}>×{entry.quantity}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[styles.historyPrice, {
                      color: isLowest ? colors.priceGood : isHighest ? colors.priceBad : colors.foreground,
                    }]}>
                      {hasPrice ? format(entry.price) : "—"}
                    </Text>
                    {isLowest && pricedHistory.length > 1 && (
                      <Text style={[styles.priceBadge, { color: colors.priceGood }]}>lowest</Text>
                    )}
                    {isHighest && (
                      <Text style={[styles.priceBadge, { color: colors.priceBad }]}>highest</Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.border} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={[styles.mergeBtn, { borderColor: colors.border }]}
          onPress={() => setMergePickerOpen(true)}
          activeOpacity={0.7}
        >
          <Feather name="git-merge" size={16} color={colors.foreground} />
          <Text style={[styles.mergeBtnText, { color: colors.foreground }]}>Merge With Another Item</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteBtn, { borderColor: colors.destructive }]}
          onPress={handleDelete}
          disabled={deletePending}
          activeOpacity={0.7}
        >
          {deletePending ? (
            <ActivityIndicator size="small" color={colors.destructive} />
          ) : (
            <>
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Delete Item</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <RenameMergeModal
        visible={renameOpen}
        title="Rename item"
        label="Item name"
        initialName={data.itemName}
        saving={renameSaving || mergePending}
        checkSimilar={checkSimilarItem}
        onSave={handleSaveName}
        onMerge={handleMergeFromRename}
        onClose={() => setRenameOpen(false)}
      />

      <MergePickerModal
        visible={mergePickerOpen}
        title="Merge with which item?"
        hint={`"${data.itemName}" will be folded into the item you pick, and its own row removed.`}
        candidates={mergeCandidates}
        isLoading={allItemsLoading}
        pending={mergePending}
        searchPlaceholder="Find an item…"
        emptyText="You have no other items to merge into."
        onPick={handlePickMergeTarget}
        onClose={() => setMergePickerOpen(false)}
      />

      {/* Emoji picker modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Choose an icon</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.customRow}>
              <TextInput
                style={[styles.customInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={customEmoji}
                onChangeText={setCustomEmoji}
                placeholder="Paste any emoji…"
                placeholderTextColor={colors.mutedForeground}
                maxLength={8}
              />
              <TouchableOpacity
                style={[styles.customBtn, { backgroundColor: customEmoji.trim() ? colors.primary : colors.border }]}
                onPress={() => handlePickIcon(customEmoji)}
                disabled={!customEmoji.trim() || iconSaving}
                activeOpacity={0.7}
              >
                <Text style={[styles.customBtnText, { color: colors.background }]}>Use</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.emojiGrid}>
              {EMOJI_CHOICES.map((emoji) => {
                const selected = data.icon === emoji;
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.emojiCell,
                      { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
                    ]}
                    onPress={() => handlePickIcon(emoji)}
                    disabled={iconSaving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.emojiCellText}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Category picker modal */}
      <Modal visible={catPickerOpen} animationType="slide" transparent onRequestClose={() => setCatPickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Choose a category</Text>
              <TouchableOpacity onPress={() => setCatPickerOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {CATEGORY_CHOICES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catPickRow, { borderColor: colors.border }]}
                  onPress={() => pickCategory(c)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.catPickText, { color: colors.foreground }]}>{c}</Text>
                  {category === c ? <Feather name="check" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 24,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  mergeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 24,
  },
  mergeBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4, paddingTop: 2 },
  headerIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconText: { fontSize: 24 },
  headerIconEdit: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  itemNameRow: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 6 },
  itemName: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1, lineHeight: 28 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1, borderRadius: 12, borderWidth: 1, padding: 10, gap: 2, alignItems: "center",
  },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Ran-out card
  ranOutCard: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  ranOutLeft: {
    flex: 1,
    padding: 14,
    gap: 3,
  },
  ranOutDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  ranOutRight: {
    flex: 1,
    padding: 14,
    gap: 3,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  ranOutLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  ranOutMetaLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  ranOutMetaValue: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  ranOutMetaDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  ranOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 2,
  },
  ranOutBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  // Chart
  chartSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  trendPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  trendText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  chartCard: {
    borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 20, paddingVertical: 8,
  },

  // History list
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  historyCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  historyRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  historyLeft: { flex: 1, gap: 3 },
  historyDate: { fontSize: 14, fontFamily: "Inter_500Medium" },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  historyStore: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  historyQty: { fontSize: 12, fontFamily: "Inter_400Regular" },
  historyRight: { alignItems: "flex-end", gap: 2 },
  historyPrice: { fontSize: 16, fontFamily: "Inter_700Bold" },
  priceBadge: { fontSize: 10, fontFamily: "Inter_500Medium" },

  // Emoji picker
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: "75%",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  pickerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  customRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
  },
  customBtn: {
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  customBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  emojiCell: {
    width: 52,
    height: 52,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiCellText: { fontSize: 26 },
  detailsCard: { borderRadius: 12, borderWidth: 1, marginBottom: 16, paddingHorizontal: 14 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, gap: 12 },
  detailLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  detailValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  detailDivider: { height: StyleSheet.hairlineWidth },
  detailInput: { flex: 1, textAlign: "right", fontSize: 14, fontFamily: "Inter_500Medium", paddingVertical: 0 },
  detailSaving: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right", paddingBottom: 8 },
  catPickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  catPickText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
