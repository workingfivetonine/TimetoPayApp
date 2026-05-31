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
import { confirmDestructive } from "@/lib/confirm";
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
          ${tick.toFixed(2)}
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

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function ItemHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const itemId = parseInt(id ?? "0");
  const { data, isLoading, refetch } = useGetItemHistory(itemId);
  const { mutateAsync: markRanOut, isPending: ranOutPending } = useMarkRanOut();
  const { mutate: updateItem, isPending: iconSaving } = useUpdateItem();
  const { mutate: deleteItem, isPending: deletePending } = useDeleteItem();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;

  const handlePickIcon = (icon: string) => {
    const trimmed = icon.trim();
    if (!trimmed) return;
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
    await markRanOut({ id: itemId });
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() }),
    ]);
  };

  const handleDelete = () => {
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

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!data) return null;

  // Trend direction
  const chronoPts = [...data.history].reverse();
  const firstPrice = chronoPts[0]?.price ?? 0;
  const lastPrice = chronoPts[chronoPts.length - 1]?.price ?? 0;
  const trendDelta = data.history.length >= 2 ? lastPrice - firstPrice : 0;
  const trendColor =
    trendDelta < -0.005 ? "#16a34a" : trendDelta > 0.005 ? "#dc2626" : colors.primary;
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
        <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
          {data.itemName}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: "#16a34a" }]}>${data.lowestPrice.toFixed(2)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Lowest</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>${data.averagePrice.toFixed(2)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Average</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: "#dc2626" }]}>${data.highestPrice.toFixed(2)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Highest</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{data.purchaseCount}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Purchases</Text>
          </View>
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
                  <Feather name="alert-circle" size={13} color="#dc2626" />
                  <Text style={[styles.ranOutMetaLabel, { color: "#dc2626" }]}>Ran out</Text>
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

        {/* Price Trend Chart */}
        {data.history.length >= 1 && (
          <>
            <View style={styles.chartSectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PRICE TREND</Text>
              {data.history.length >= 2 && (
                <View style={styles.trendPill}>
                  <Feather name={trendIcon} size={12} color={trendColor} />
                  <Text style={[styles.trendText, { color: trendColor }]}>
                    {trendDelta === 0
                      ? "Stable"
                      : `${trendDelta > 0 ? "+" : ""}$${Math.abs(trendDelta).toFixed(2)} since first`}
                  </Text>
                </View>
              )}
            </View>
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <PriceTrendChart
                history={data.history}
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
              const isLowest = entry.price === data.lowestPrice;
              const isHighest = entry.price === data.highestPrice && data.history.length > 1;
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
                      color: isLowest ? "#16a34a" : isHighest ? "#dc2626" : colors.foreground,
                    }]}>
                      ${entry.price.toFixed(2)}
                    </Text>
                    {isLowest && data.history.length > 1 && (
                      <Text style={[styles.priceBadge, { color: "#16a34a" }]}>lowest</Text>
                    )}
                    {isHighest && (
                      <Text style={[styles.priceBadge, { color: "#dc2626" }]}>highest</Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.border} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

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
});
