import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
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
import {
  canWebShare,
  copyAppLink,
  facebookUrl,
  nativeShare,
  openExternal,
  smsUrl,
  twitterUrl,
  webShare,
  whatsappUrl,
} from "@/lib/share";

type Props = {
  title?: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
};

function Chip({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Feather name={icon} size={15} color={colors.primary} />
      <Text style={[styles.chipText, { color: colors.foreground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Reusable "invite friends" card. On native it opens the OS share sheet; on web
// it offers the Web Share API (when available) plus explicit text / social /
// copy-link options.
export function ShareInvite({
  title = "Spread the word",
  subtitle = "Share TimetoPay with friends & family",
  style,
}: Props) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const isWeb = Platform.OS === "web";

  const handleCopy = async () => {
    const ok = await copyAppLink();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}
    >
      <View style={styles.header}>
        <Feather name="share-2" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        </View>
      </View>

      {!isWeb ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={nativeShare}
          activeOpacity={0.85}
        >
          <Feather name="share" size={16} color={colors.primaryForeground} />
          <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>
            Share the app
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          {canWebShare() ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={webShare}
              activeOpacity={0.85}
            >
              <Feather name="share" size={16} color={colors.primaryForeground} />
              <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>
                Share…
              </Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.chips}>
            <Chip icon="message-square" label="Text" onPress={() => openExternal(smsUrl())} />
            <Chip
              icon="message-circle"
              label="WhatsApp"
              onPress={() => openExternal(whatsappUrl())}
            />
            <Chip icon="twitter" label="X" onPress={() => openExternal(twitterUrl())} />
            <Chip
              icon="facebook"
              label="Facebook"
              onPress={() => openExternal(facebookUrl())}
            />
            <Chip
              icon={copied ? "check" : "link"}
              label={copied ? "Copied!" : "Copy link"}
              onPress={handleCopy}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
