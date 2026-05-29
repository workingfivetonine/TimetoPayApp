import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Store } from "@workspace/api-client-react";

interface Props {
  store: Store;
  onPress: () => void;
  onEdit?: () => void;
}

export function StoreCard({ store, onPress, onEdit }: Props) {
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
          {store.address ? (
            <View style={styles.metaRow}>
              <Feather name="map-pin" size={11} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {store.address}
              </Text>
            </View>
          ) : store.deliveryAvailable ? (
            <View style={styles.metaRow}>
              <Feather name="truck" size={11} color={colors.primary} />
              <Text style={[styles.deliveryText, { color: colors.primary }]}>
                Delivery{store.deliveryFee != null ? ` · $${Number(store.deliveryFee).toFixed(2)}` : ""}
              </Text>
            </View>
          ) : (
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>In-store only</Text>
          )}
        </View>
      </View>

      <View style={styles.right}>
        {onEdit && (
          <TouchableOpacity
            style={[styles.editBtn, { backgroundColor: colors.secondary }]}
            onPress={onEdit}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  deliveryText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
