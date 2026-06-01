import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface SortOption<K extends string = string> {
  key: K;
  label: string;
}

interface ListControlsProps<K extends string> {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  sortOptions: SortOption<K>[];
  sortKey: K;
  onSortKeyChange: (key: K) => void;
}

export function ListControls<K extends string>({
  query,
  onQueryChange,
  placeholder = "Search…",
  sortOptions,
  sortKey,
  onSortKeyChange,
}: ListControlsProps<K>) {
  const colors = useColors();
  return (
    <View>
      <View style={[styles.searchBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={onQueryChange}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => onQueryChange("")} hitSlop={8} accessibilityLabel="Clear search">
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Text style={[styles.sortLabel, { color: colors.mutedForeground }]}>Sort</Text>
        {sortOptions.map((opt) => {
          const isActive = sortKey === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.pill,
                { borderColor: colors.border, backgroundColor: isActive ? colors.primary : colors.card },
              ]}
              onPress={() => onSortKeyChange(opt.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: isActive ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sortLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginRight: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
