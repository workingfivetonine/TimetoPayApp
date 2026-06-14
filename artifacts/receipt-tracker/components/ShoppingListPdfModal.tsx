import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { downloadShoppingListPdf } from "@/lib/shoppingListPdf";
import type { ShoppingListItem } from "@workspace/api-client-react";

interface Props {
  visible: boolean;
  onClose: () => void;
  recurring: ShoppingListItem[];
  oneOff: ShoppingListItem[];
  preparedFor: string;
}

function formatRanOut(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ShoppingListPdfModal({
  visible,
  onClose,
  recurring,
  oneOff,
  preparedFor,
}: Props) {
  const colors = useColors();
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [generating, setGenerating] = useState(false);

  // Reset curation state each time the modal opens (all items checked).
  useEffect(() => {
    if (visible) {
      setExcluded(new Set());
      setCustomItems([]);
      setCustomInput("");
      setGenerating(false);
    }
  }, [visible]);

  const allItems = useMemo(
    () => [...recurring, ...oneOff],
    [recurring, oneOff],
  );

  const sections = useMemo(
    () => [
      { title: "Regulars", data: recurring },
      { title: "One-offs", data: oneOff },
    ],
    [recurring, oneOff],
  );

  const toggle = (id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    setCustomItems((prev) => [...prev, trimmed]);
    setCustomInput("");
  };

  const removeCustom = (index: number) => {
    setCustomItems((prev) => prev.filter((_, i) => i !== index));
  };

  const selectedCount =
    allItems.filter((it) => !excluded.has(it.itemId)).length +
    customItems.length;

  const buildTextList = () => {
    const lines: string[] = [];
    lines.push(`🛒 Shopping List${preparedFor ? ` · ${preparedFor}` : ""}`);
    lines.push("");
    const visibleRecurring = recurring.filter((it) => !excluded.has(it.itemId));
    const visibleOneOff = oneOff.filter((it) => !excluded.has(it.itemId));
    if (visibleRecurring.length > 0) {
      lines.push("Regulars");
      for (const item of visibleRecurring) {
        lines.push(`☐ ${item.icon || "•"} ${item.itemName}`);
      }
      lines.push("");
    }
    if (visibleOneOff.length > 0) {
      lines.push("One-offs");
      for (const item of visibleOneOff) {
        lines.push(`☐ ${item.icon || "•"} ${item.itemName}`);
      }
      lines.push("");
    }
    if (customItems.length > 0) {
      for (const name of customItems) {
        lines.push(`☐ ${name}`);
      }
    }
    return lines.join("\n");
  };

  const handleGenerate = async () => {
    if (generating) return;
    const items = allItems.filter((it) => !excluded.has(it.itemId));
    if (items.length === 0 && customItems.length === 0) {
      Alert.alert("Nothing selected", "Select at least one item to print.");
      return;
    }
    setGenerating(true);
    try {
      await downloadShoppingListPdf({ items, customItems, preparedFor });
      onClose();
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not generate the PDF. Please try again.";
      Alert.alert("Download failed", message);
    } finally {
      setGenerating(false);
    }
  };

  const handleShareText = async () => {
    const items = allItems.filter((it) => !excluded.has(it.itemId));
    if (items.length === 0 && customItems.length === 0) {
      Alert.alert("Nothing selected", "Select at least one item to share.");
      return;
    }
    const text = buildTextList();
    try {
      await Share.share({ message: text, title: "Shopping List" });
    } catch {
      // User cancelled share sheet — no-op
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Review & Print
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Pick what prints · {selectedCount} item
                {selectedCount !== 1 ? "s" : ""}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {sections
              .filter((s) => s.data.length > 0)
              .map((section) => (
                <View key={section.title} style={styles.section}>
                  <Text
                    style={[styles.sectionTitle, { color: colors.mutedForeground }]}
                  >
                    {section.title}
                  </Text>
                  {section.data.map((item) => {
                    const checked = !excluded.has(item.itemId);
                    const ranOut = item.ranOutAt != null;
                    return (
                      <TouchableOpacity
                        key={item.itemId}
                        style={[styles.row, { borderBottomColor: colors.border }]}
                        onPress={() => toggle(item.itemId)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: checked ? colors.primary : colors.border,
                              backgroundColor: checked
                                ? colors.primary
                                : "transparent",
                            },
                          ]}
                        >
                          {checked && (
                            <Feather
                              name="check"
                              size={14}
                              color={colors.primaryForeground}
                            />
                          )}
                        </View>
                        <Text style={styles.rowIcon}>{item.icon || "🛒"}</Text>
                        <View style={styles.rowMain}>
                          <Text
                            style={[
                              styles.rowName,
                              {
                                color: ranOut
                                  ? colors.mutedForeground
                                  : colors.foreground,
                                fontStyle: ranOut ? "italic" : "normal",
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {item.itemName}
                          </Text>
                          {ranOut && (
                            <View style={styles.ranOutRow}>
                              <View
                                style={[
                                  styles.ranOutTag,
                                  { backgroundColor: colors.spendHigh },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.ranOutText,
                                    { color: colors.spendHighText },
                                  ]}
                                >
                                  RAN OUT
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.ranOutDate,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                {formatRanOut(item.ranOutAt as string)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                Add a custom item
              </Text>
              <View style={styles.customInputRow}>
                <TextInput
                  style={[
                    styles.customInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="e.g. Birthday candles"
                  placeholderTextColor={colors.mutedForeground}
                  value={customInput}
                  onChangeText={setCustomInput}
                  onSubmitEditing={addCustom}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.accent }]}
                  onPress={addCustom}
                  accessibilityLabel="Add custom item"
                >
                  <Feather name="plus" size={20} color={colors.accentForeground} />
                </TouchableOpacity>
              </View>

              {customItems.map((name, index) => (
                <View
                  key={`${name}-${index}`}
                  style={[styles.row, { borderBottomColor: colors.border }]}
                >
                  <Text style={styles.rowIcon}>📝</Text>
                  <Text
                    style={[styles.rowName, { color: colors.foreground, flex: 1 }]}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeCustom(index)}
                    accessibilityLabel="Remove custom item"
                    style={styles.removeBtn}
                  >
                    <Feather name="x" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                borderTopColor: colors.border,
                paddingBottom: Platform.OS === "ios" ? 28 : 16,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
              disabled={generating}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={handleShareText}
              disabled={generating}
              activeOpacity={0.8}
            >
              <Feather name="share-2" size={16} color={colors.foreground} />
              <Text style={[styles.shareBtnText, { color: colors.foreground }]}>Share text</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.generateBtn, { backgroundColor: colors.primary }]}
              onPress={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather
                    name="file-text"
                    size={16}
                    color={colors.primaryForeground}
                  />
                  <Text
                    style={[styles.generateText, { color: colors.primaryForeground }]}
                  >
                    PDF
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { padding: 4, marginLeft: 8 },
  body: { paddingHorizontal: 20 },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowIcon: { fontSize: 18, marginRight: 10 },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  ranOutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  ranOutTag: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ranOutText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  ranOutDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  customInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  customInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: { padding: 4 },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  shareBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  shareBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  generateBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  generateText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
