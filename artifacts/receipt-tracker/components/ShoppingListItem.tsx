import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ShoppingListItem as SLItem } from "@workspace/api-client-react";

interface Props {
  item: SLItem;
  showBestStore?: boolean;
  onPress?: () => void;
  onRanOut?: () => void;
  ranOutLoading?: boolean;
}

export function ShoppingListItemRow({
  item,
  showBestStore = true,
  onPress,
  onRanOut,
  ranOutLoading,
}: Props) {
  const colors = useColors();

  const savingsVsAvg = item.averagePrice - item.lowestPrice;
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
            {showBestStore && (
              <View style={styles.storeRow}>
                <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                <Text style={[styles.storeText, { color: colors.mutedForeground }]}>
                  {item.lowestPriceStoreName}
                </Text>
                {savingsVsAvg > 0.01 && (
                  <Text style={[styles.savings, { color: colors.priceGood }]}>
                    saves ${savingsVsAvg.toFixed(2)}
                  </Text>
                )}
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
          <Text style={[styles.lowestPrice, { color: colors.primary }]}>
            ${item.lowestPrice.toFixed(2)}
          </Text>
          <Text style={[styles.avgPrice, { color: colors.mutedForeground }]}>
            avg ${item.averagePrice.toFixed(2)}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Ran-out button */}
      <TouchableOpacity
        style={[
          styles.ranOutBtn,
          {
            backgroundColor: hasRanOut ? colors.secondary : colors.accent,
            borderColor: hasRanOut ? colors.border : colors.primary,
          },
        ]}
        onPress={onRanOut}
        activeOpacity={0.7}
        disabled={ranOutLoading}
      >
        {ranOutLoading ? (
          <Feather name="loader" size={13} color={colors.mutedForeground} />
        ) : hasRanOut ? (
          <>
            <Feather name="alert-circle" size={12} color={colors.mutedForeground} />
            <Text style={[styles.ranOutBtnLabel, { color: colors.mutedForeground }]}>
              Out
            </Text>
          </>
        ) : (
          <>
            <Feather name="x-circle" size={12} color={colors.primary} />
            <Text style={[styles.ranOutBtnLabel, { color: colors.primary }]}>
              Ran{"\n"}Out
            </Text>
          </>
        )}
      </TouchableOpacity>
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
  priceGood: {},
});
