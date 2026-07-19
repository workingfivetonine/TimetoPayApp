import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/hooks/useCurrency";
import { storeLogoUrl } from "@/lib/storeLogo";
import type { Store } from "@workspace/api-client-react";

interface Props {
  store: Store;
  onPress: () => void;
  onEdit?: () => void;
  // "mi" or "km" — chosen by the viewer's country. Distance itself comes from the
  // API (store.distanceKm) once both the user's and the store's address are geocoded.
  distanceUnit?: "mi" | "km";
}

// Format a kilometre distance into the viewer's preferred unit, e.g. "1.2 mi".
function formatDistance(km: number, unit: "mi" | "km"): string {
  const value = unit === "mi" ? km * 0.621371 : km;
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${unit}`;
}

export function StoreCard({ store, onPress, onEdit, distanceUnit = "km" }: Props) {
  const colors = useColors();
  const { format } = useCurrency();
  // distanceKm is a drifted field not in the generated Store type — read via cast.
  const distanceKm = (store as { distanceKm?: number | null }).distanceKm ?? null;
  // Try the stored logo first, then a name-derived favicon (so a dead stored URL
  // — e.g. an old Clearbit link — falls through to the working favicon instead of
  // jumping straight to the placeholder), then the placeholder icon.
  const logoSources = [...new Set([store.logoUrl, storeLogoUrl(store.name)].filter(Boolean) as string[])];
  const [srcIndex, setSrcIndex] = useState(0);
  const logoUri = logoSources[srcIndex];

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <View style={[styles.iconContainer, { backgroundColor: colors.accent }]}>
          {logoUri ? (
            <Image
              key={logoUri}
              source={{ uri: logoUri }}
              style={styles.logo}
              contentFit="contain"
              onError={() => setSrcIndex((i) => i + 1)}
            />
          ) : (
            <Feather name="shopping-bag" size={18} color={colors.primary} />
          )}
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
                Delivery{store.deliveryFee != null ? ` · ${format(Number(store.deliveryFee))}` : ""}
              </Text>
            </View>
          ) : (
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>In-store only</Text>
          )}
          {distanceKm != null ? (
            <View style={styles.metaRow}>
              <Feather name="navigation" size={11} color={colors.primary} />
              <Text style={[styles.deliveryText, { color: colors.primary }]}>
                {formatDistance(distanceKm, distanceUnit)} away
              </Text>
            </View>
          ) : null}
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
    overflow: "hidden",
  },
  logo: {
    width: 28,
    height: 28,
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
