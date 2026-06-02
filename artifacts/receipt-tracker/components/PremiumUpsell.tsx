import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { PremiumBadge } from "@/components/PremiumBadge";

// Shared upsell card shown to free (unpaid/lapsed) web users where a premium
// feature would otherwise be. Routes to the paywall to subscribe.
export function PremiumUpsell({
  icon = "lock",
  title,
  subtitle,
  cta = "Subscribe",
  compact = false,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  cta?: string;
  compact?: boolean;
}) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
        <Feather name={icon} size={24} color={colors.primary} />
      </View>
      <PremiumBadge />
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/paywall")}
        activeOpacity={0.85}
      >
        <Feather name="zap" size={16} color={colors.primaryForeground} />
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
  },
  cardCompact: {
    padding: 20,
    gap: 8,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 6,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
