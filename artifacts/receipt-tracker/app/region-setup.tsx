import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useUpdateMyRegion,
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { isStateScoped } from "@workspace/geo";
import { RegionPicker } from "@/components/RegionPicker";
import { useColors } from "@/hooks/useColors";

export default function RegionSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: me } = useGetCurrentUser();
  const isEditing = me != null && !!me.countryCode;
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const { mutate, isPending } = useUpdateMyRegion();

  // Pre-fill from the user's current region when editing from settings.
  useEffect(() => {
    if (me && !seeded) {
      setCountryCode(me.countryCode ?? null);
      setStateCode(me.stateCode ?? null);
      setSeeded(true);
    }
  }, [me, seeded]);

  const valid = countryCode != null && (!isStateScoped(countryCode) || stateCode != null);

  const handleSave = () => {
    if (!valid || !countryCode) return;
    mutate(
      { data: { countryCode, stateCode: isStateScoped(countryCode) ? stateCode : null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          router.replace("/");
        },
      },
    );
  };

  const paddingTop = Platform.OS === "web" ? 48 : insets.top + 24;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.foreground }]}>
          {isEditing ? "Your region" : "Where do you shop?"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Pick your region to see items and prices uploaded by other shoppers near
          you. You only see stores and price trends from your own country (and US
          shoppers, your own state). You can change this anytime in your account.
        </Text>

        <RegionPicker
          countryCode={countryCode}
          stateCode={stateCode}
          onChange={(c, s) => {
            setCountryCode(c);
            setStateCode(s);
          }}
        />

        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: valid ? colors.primary : colors.border },
          ]}
          onPress={handleSave}
          disabled={!valid || isPending}
          activeOpacity={0.85}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{isEditing ? "Save" : "Continue"}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 4, maxWidth: 480, width: "100%", alignSelf: "center" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 8, marginBottom: 8 },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
