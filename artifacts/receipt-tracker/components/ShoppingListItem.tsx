import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import type { ShoppingListItem as SLItem } from "@workspace/api-client-react";

interface Props {
  item: SLItem;
  showBestStore?: boolean;
  onPress?: () => void;
  onRanOut?: () => void;
  ranOutLoading?: boolean;
  /** Un-marks a ran-out item, restoring it to the active list. */
  onRestore?: () => void;
  onDismiss?: () => void;
  dismissLoading?: boolean;
}

export function ShoppingListItemRow({
  item,
  showBestStore = true,
  onPress,
  onRanOut,
  ranOutLoading,
  onRestore,
  onDismiss,
  dismissLoading,
}: Props) {
  const colors = useColors();
  const { format } = useCurrency();

  const recommendedPrice = item.recommendedPrice ?? null;
  const recommendedStoreName = item.recommendedStoreName ?? null;
  const fromGlobal = item.priceSource === "global";
  const savingsVsAvg =
    item.averagePrice != null && item.lowestPrice != null
      ? item.averagePrice - item.lowestPrice
      : 0;
  const days = item.daysSinceLastPurchase;
  const hasRanOut = item.ranOutAt != null;

  // Days label — "today", "yesterday", "X days ago"
  const daysLabel =
    days == null
      ? null
      : days === 0
      ? "bought today"
      : days === 1
      ? "1 day ago"
      : `${days} days ago`;

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={styles.mainArea}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
          <Text style={styles.iconText}>{item.icon || "🛒"}</Text>
        </View>
        <View style={styles.left}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {item.itemName}
          </Text>
          {item.notes ? (
            <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.notes}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            {showBestStore && recommendedStoreName && (
              <View style={styles.storeRow}>
                <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                <Text style={[styles.storeText, { color: colors.mutedForeground }]}>
                  {recommendedStoreName}
                </Text>
                {savingsVsAvg > 0.01 && (
                  <Text style={[styles.savings, { color: colors.priceGood }]}>
                    saves {format(savingsVsAvg)}
                  </Text>
                )}
              </View>
            )}
            {fromGlobal && (
              <View style={styles.storeRow}>
                <Feather name="globe" size={11} color={colors.mutedForeground} />
                <Text style={[styles.storeText, { color: colors.mutedForeground }]}>
                  from catalog
                </Text>
              </View>
            )}
            {daysLabel && (
              <View style={styles.daysRow}>
                <Feather name="clock" size={10} color={colors.mutedForeground} />
                <Text style={[styles.daysText, { color: colors.mutedForeground }]}>
                  {daysLabel}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.priceCol}>
          {recommendedPrice != null ? (
            <Text style={[styles.lowestPrice, { color: colors.primary }]}>
              {format(recommendedPrice)}
            </Text>
          ) : (
            <Text style={[styles.avgPrice, { color: colors.mutedForeground }]}>
              no price yet
            </Text>
          )}
          {item.averagePrice != null && (
            <Text style={[styles.avgPrice, { color: colors.mutedForeground }]}>
              avg {format(item.averagePrice)}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* "Ran Out" toggle. Green while the item is still stocked (the action is
          available), grey once it has been marked — tapping again un-marks it. */}
      <TouchableOpacity
        style={[
          styles.ranOutBtn,
          {
            backgroundColor: hasRanOut ? colors.muted : colors.accent,
            borderColor: hasRanOut ? colors.border : colors.priceGood,
          },
        ]}
        onPress={hasRanOut ? onRestore : onRanOut}
        activeOpacity={0.7}
        disabled={ranOutLoading}
        accessibilityRole="button"
        accessibilityState={{ selected: hasRanOut }}
        accessibilityLabel={hasRanOut ? "Undo ran out" : "Mark as ran out"}
      >
        {ranOutLoading ? (
          <Feather name="loader" size={13} color={colors.mutedForeground} />
        ) : (
          <>
            <Feather
              name="x-circle"
              size={12}
              color={hasRanOut ? colors.mutedForeground : colors.priceGood}
            />
            <Text
              style={[
                styles.ranOutBtnLabel,
                { color: hasRanOut ? colors.mutedForeground : colors.priceGood },
              ]}
            >
              Ran{"\n"}Out
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Dismiss (remove from list) button */}
      {onDismiss && (
        <TouchableOpacity
          style={[
            styles.dismissBtn,
            { backgroundColor: colors.secondary, borderColor: colors.border },
          ]}
          onPress={onDismiss}
          activeOpacity={0.7}
          disabled={dismissLoading}
          accessibilityLabel="Remove from list"
        >
          {dismissLoading ? (
            <Feather name="loader" size={13} color={colors.mutedForeground} />
          ) : (
            <Feather name="trash-2" size={13} color={colors.mutedForeground} />
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: 10,
  },
  mainArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconText: {
    fontSize: 19,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  notes: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 3,
    flexWrap: "wrap",
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  storeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  savings: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  daysRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  daysText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  priceCol: {
    alignItems: "flex-end",
    gap: 2,
    marginLeft: 8,
  },
  lowestPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  avgPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  ranOutBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 46,
    gap: 2,
  },
  ranOutBtnLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 12,
  },
  dismissBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
    minWidth: 36,
  },
});
