import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Receipt } from "@workspace/api-client-react";

interface Props {
  receipt: Receipt;
  onPress: () => void;
  onDelete: () => void;
}

export function ReceiptCard({ receipt, onPress, onDelete }: Props) {
  const colors = useColors();

  const date = new Date(receipt.purchasedAt);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <View style={[styles.iconContainer, { backgroundColor: colors.accent }]}>
          <Feather name="file-text" size={18} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.storeName, { color: colors.foreground }]} numberOfLines={1}>
            {receipt.storeName}
          </Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{dateStr}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={[styles.total, { color: colors.foreground }]}>
          ${Number(receipt.total).toFixed(2)}
        </Text>
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.deleteBtn}
        >
          <Feather name="trash-2" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
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
  storeName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  date: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  right: {
    alignItems: "flex-end",
    gap: 6,
  },
  total: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  deleteBtn: {
    padding: 2,
  },
});
