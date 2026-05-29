import React from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useGetShoppingList,
  getGetShoppingListQueryKey,
  useMarkRanOut,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useDesktop } from "@/hooks/useDesktop";
import { ShoppingListItemRow } from "@/components/ShoppingListItem";
import { EmptyState } from "@/components/EmptyState";
import { downloadShoppingListPdf } from "@/lib/shoppingListPdf";
import type { ShoppingListItem } from "@workspace/api-client-react";
import { useState } from "react";
import { useRouter } from "expo-router";

export default function ShoppingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: list, isLoading } = useGetShoppingList();
  const { mutateAsync: markRanOut } = useMarkRanOut();

  const isDesktop = useDesktop();
  const paddingTop = isDesktop ? 32 : Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = isDesktop ? 24 : Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    setRefreshing(false);
  };

  const handleRanOut = async (itemId: number) => {
    setLoadingItemId(itemId);
    try {
      await markRanOut({ id: itemId });
      await queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadShoppingListPdf(list?.recurring ?? [], list?.oneOff ?? []);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not generate the PDF. Please try again.";
      Alert.alert("Download failed", message);
    } finally {
      setDownloading(false);
    }
  };

  const sections: { title: string; subtitle: string; data: ShoppingListItem[] }[] = [
    {
      title: "Regulars",
      subtitle: "Bought 2+ times",
      data: list?.recurring ?? [],
    },
    {
      title: "One-offs",
      subtitle: "Bought once",
      data: list?.oneOff ?? [],
    },
  ];

  const hasItems = (list?.recurring?.length ?? 0) + (list?.oneOff?.length ?? 0) > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Shopping List</Text>
        {hasItems && (
          <TouchableOpacity
            style={[styles.downloadButton, { backgroundColor: colors.accent }]}
            onPress={handleDownload}
            disabled={downloading}
            accessibilityLabel="Download shopping list as PDF"
          >
            {downloading ? (
              <ActivityIndicator size="small" color={colors.accentForeground} />
            ) : (
              <Feather name="download" size={18} color={colors.accentForeground} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !hasItems ? (
        <EmptyState
          icon="check-square"
          title="No items yet"
          subtitle="Scan receipts to auto-build your shopping list with prices"
        />
      ) : (
        <SectionList
          sections={sections.filter((s) => s.data.length > 0)}
          keyExtractor={(item) => String(item.itemId)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={{ paddingBottom }}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                {section.subtitle} · {section.data.length} item{section.data.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.card }}>
              <ShoppingListItemRow
                item={item}
                onPress={() => router.push(`/item/${item.itemId}`)}
                onRanOut={() => handleRanOut(item.itemId)}
                ranOutLoading={loadingItemId === item.itemId}
              />
            </View>
          )}
          SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
          stickySectionHeadersEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  downloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
