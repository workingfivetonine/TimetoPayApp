import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useColors } from "@/hooks/useColors";

type Props = {
  label?: string;
  style?: StyleProp<ViewStyle>;
  // "locked" = free user, paywalled. "trial" = entitled via the free trial
  // (feature only temporarily available).
  variant?: "locked" | "trial";
  // Tappable (opens the paywall) + web hover tooltip. Default true.
  interactive?: boolean;
};

/**
 * Small "Premium" pill marking features that require a paid subscription.
 * - locked: star + "Premium", tooltip "Sign up for full access".
 * - trial:  star + "Premium · trial", tooltip "Premium — free during your trial".
 * Tapping opens the paywall.
 */
export function PremiumBadge({ label, style, variant = "locked", interactive = true }: Props) {
  const colors = useColors();
  const router = useRouter();
  const isTrial = variant === "trial";
  const text = label ?? (isTrial ? "Premium · trial" : "Premium");
  const tooltip = isTrial
    ? "Premium feature — temporarily available during your free trial"
    : "Sign up for full access";
  const bg = isTrial ? colors.secondary : colors.accent;
  const fg = isTrial ? colors.foreground : colors.primary;

  const content = (
    <>
      <Feather name="star" size={11} color={fg} />
      <Text style={[styles.text, { color: fg }]}>{text}</Text>
    </>
  );
  const boxStyle = [styles.badge, { backgroundColor: bg, borderColor: colors.primary }, style];

  if (!interactive) {
    return <View style={boxStyle}>{content}</View>;
  }
  return (
    <TouchableOpacity
      style={boxStyle}
      onPress={() => router.push("/paywall")}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={tooltip}
      // Native HTML hover tooltip on web (react-native-web forwards `title`).
      {...(Platform.OS === "web" ? ({ title: tooltip } as object) : {})}
    >
      {content}
    </TouchableOpacity>
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
