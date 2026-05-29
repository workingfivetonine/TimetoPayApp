import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Store } from "@workspace/api-client-react";

interface Props {
  store: Store;
  onPress: () => void;
}

export function StoreCard({ store, onPress }: Props) {
  const colors = useColors();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <View style={[styles.iconContainer, { backgroundColor: colors.accent }]}>
          <Feather name="shopping-bag" size={18} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {store.name}
          </Text>
          {store.deliveryAvailable ? (
            <View style={styles.deliveryRow}>
              <Feather name="truck" size={11} color={colors.primary} />
              <Text style={[styles.deliveryText, { color: colors.primary }]}>
                Delivery
                {store.deliveryFee != null ? ` · $${Number(store.deliveryFee).toFixed(2)}` : ""}
              </Text>
            </View>
          ) : (
            <Text style={[styles.noDelivery, { color: colors.mutedForeground }]}>In-store only</Text>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  deliveryText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  noDelivery: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
});
