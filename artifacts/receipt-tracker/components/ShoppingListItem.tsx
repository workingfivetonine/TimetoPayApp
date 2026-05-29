import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ShoppingListItem as SLItem } from "@workspace/api-client-react";

interface Props {
  item: SLItem;
  showBestStore?: boolean;
  onPress?: () => void;
}

export function ShoppingListItemRow({ item, showBestStore = true, onPress }: Props) {
  const colors = useColors();

  const savingsVsAvg = item.averagePrice - item.lowestPrice;

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
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
        {showBestStore && (
          <View style={styles.storeRow}>
            <Feather name="map-pin" size={11} color={colors.mutedForeground} />
            <Text style={[styles.storeText, { color: colors.mutedForeground }]}>
              Best: {item.lowestPriceStoreName}
            </Text>
            {savingsVsAvg > 0.01 && (
              <Text style={[styles.savings, { color: colors.priceGood }]}>
                saves ${savingsVsAvg.toFixed(2)}
              </Text>
            )}
          </View>
        )}
      </View>
      <View style={styles.right}>
        <Text style={[styles.lowestPrice, { color: colors.primary }]}>
          ${item.lowestPrice.toFixed(2)}
        </Text>
        <Text style={[styles.avgPrice, { color: colors.mutedForeground }]}>
          avg ${item.averagePrice.toFixed(2)}
        </Text>
      </View>
      {onPress && (
        <Feather name="chevron-right" size={14} color={colors.border} style={{ marginLeft: 6 }} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  storeText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  savings: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
  },
  lowestPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  avgPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  priceGood: {},
});
