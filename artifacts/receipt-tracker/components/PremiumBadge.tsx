import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";

type Props = {
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Small "Premium" pill used to mark features that require a paid subscription.
 * Shown to free users on locked surfaces so it's clear what's premium-only.
 */
export function PremiumBadge({ label = "Premium", style }: Props) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.accent, borderColor: colors.primary },
        style,
      ]}
    >
      <Feather name="star" size={11} color={colors.primary} />
      <Text style={[styles.text, { color: colors.primary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
});
