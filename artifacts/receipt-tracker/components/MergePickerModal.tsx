import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface MergeCandidate {
  id: number;
  title: string;
  subtitle?: string;
}

interface MergePickerModalProps {
  visible: boolean;
  title: string;
  hint?: string;
  candidates: MergeCandidate[];
  isLoading: boolean;
  pending: boolean;
  searchPlaceholder: string;
  emptyText: string;
  onPick: (id: number) => void;
  onClose: () => void;
}

// Generic "merge into which one?" picker — a searchable list where tapping a
// row IS the confirmation (no separate Alert), matching the existing
// merge-into-existing-receipt picker in batch-review.tsx. Shared by the item
// and store merge flows rather than duplicated per entity type.
export function MergePickerModal({
  visible,
  title,
  hint,
  candidates,
  isLoading,
  pending,
  searchPlaceholder,
  emptyText,
  onPick,
  onClose,
}: MergePickerModalProps) {
  const colors = useColors();
  const [query, setQuery] = useState("");

  const visibleCandidates = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.title.toLowerCase().includes(q) || (c.subtitle ?? "").toLowerCase().includes(q),
    );
  }, [candidates, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}

          <View style={[styles.search, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : visibleCandidates.length === 0 ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              {query ? "Nothing matches that search." : emptyText}
            </Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {visibleCandidates.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.row, { borderBottomColor: colors.border }]}
                  onPress={() => onPick(c.id)}
                  disabled={pending}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {c.title}
                    </Text>
                    {c.subtitle ? (
                      <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {c.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {pending ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { maxHeight: "80%", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, paddingHorizontal: 20, paddingTop: 12 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  loading: { paddingVertical: 24, alignItems: "center" },
  empty: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 32, paddingHorizontal: 20 },
  list: { marginTop: 8, paddingHorizontal: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
