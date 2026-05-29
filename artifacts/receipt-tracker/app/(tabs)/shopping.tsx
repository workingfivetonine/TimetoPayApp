import React from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetShoppingList, getGetShoppingListQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { ShoppingListItemRow } from "@/components/ShoppingListItem";
import { EmptyState } from "@/components/EmptyState";
import type { ShoppingListItem } from "@workspace/api-client-react";
import { useState } from "react";

export default function ShoppingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: list, isLoading } = useGetShoppingList();

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    setRefreshing(false);
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
              <ShoppingListItemRow item={item} />
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
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
