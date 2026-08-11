import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export interface SimilarMatch {
  id: number;
  name: string;
  score: number;
}

interface RenameMergeModalProps {
  visible: boolean;
  title: string;
  label: string;
  initialName: string;
  saving: boolean;
  // Debounced as the user types. Returning null clears any suggestion banner.
  checkSimilar: (name: string) => Promise<SimilarMatch | null>;
  onSave: (name: string) => void;
  onMerge: (match: SimilarMatch) => void;
  onClose: () => void;
}

// Rename screen for an item or a store, with an inline "this looks like one
// you already have — merge instead?" suggestion. Renaming has no separate
// auto-merge step of its own (unlike scan-time matching), so without this a
// typo-free rename to a name you already use elsewhere just mints a second,
// identically-named row rather than combining them.
export function RenameMergeModal({
  visible,
  title,
  label,
  initialName,
  saving,
  checkSimilar,
  onSave,
  onMerge,
  onClose,
}: RenameMergeModalProps) {
  const colors = useColors();
  const [name, setName] = useState(initialName);
  const [suggestion, setSuggestion] = useState<SimilarMatch | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset to the current name each time the modal opens for a (possibly
  // different) entity, rather than carrying over stale text from last time.
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setSuggestion(null);
      setDismissed(false);
    }
  }, [visible, initialName]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = name.trim();
    // Unchanged from the current name — nothing to check, nothing to suggest.
    if (!trimmed || trimmed.toLowerCase() === initialName.trim().toLowerCase()) {
      setSuggestion(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const match = await checkSimilar(trimmed);
          if (!cancelled) {
            setSuggestion(match);
            setDismissed(false);
          }
        } catch {
          if (!cancelled) setSuggestion(null);
        } finally {
          if (!cancelled) setChecking(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, visible, initialName]);

  const trimmedName = name.trim();
  const showSuggestion = suggestion && !dismissed && !saving;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
              value={name}
              onChangeText={setName}
              autoFocus
              autoCorrect={false}
              returnKeyType="done"
            />
            {checking ? <ActivityIndicator size="small" color={colors.mutedForeground} style={styles.checkingSpinner} /> : null}
          </View>

          {showSuggestion ? (
            <View style={[styles.suggestBanner, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Feather name="link-2" size={13} color={colors.primary} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.suggestText, { color: colors.foreground }]}>
                  You already have{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>{suggestion!.name}</Text> — merge into
                  it instead of creating a second one?
                </Text>
                <View style={styles.suggestActions}>
                  <TouchableOpacity onPress={() => onMerge(suggestion!)} disabled={saving}>
                    <Text style={[styles.suggestMerge, { color: colors.primary }]}>Merge</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDismissed(true)} disabled={saving}>
                    <Text style={[styles.suggestDismiss, { color: colors.mutedForeground }]}>Keep separate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: trimmedName ? colors.primary : colors.border }]}
              onPress={() => onSave(trimmedName)}
              disabled={!trimmedName || saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420, borderRadius: 16, padding: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  checkingSpinner: { marginLeft: -32 },
  suggestBanner: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  suggestText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  suggestActions: { flexDirection: "row", gap: 16, marginTop: 8 },
  suggestMerge: { fontSize: 13, fontFamily: "Inter_700Bold" },
  suggestDismiss: { fontSize: 13, fontFamily: "Inter_500Medium" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 20 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 4 },
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  saveBtn: { borderRadius: 10, paddingHorizontal: 22, paddingVertical: 11, minWidth: 84, alignItems: "center" },
  saveText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
