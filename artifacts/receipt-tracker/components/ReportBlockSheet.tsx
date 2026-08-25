import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

/**
 * The two moderation actions Apple requires for any app with user-generated
 * content (Guideline 1.2): reporting something to a moderator, and blocking a
 * person for yourself. They're deliberately one sheet — both start from the
 * same "⋯" on a post or reply — but they do different jobs: a report is a
 * request that a moderator acts on later, a block is the user's own decision
 * and takes effect immediately.
 */

const REASONS: { key: string; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "hate", label: "Hate speech" },
  { key: "sexual", label: "Sexual content" },
  { key: "off_topic", label: "Not about shopping" },
  { key: "other", label: "Something else" },
];

type Stage = "menu" | "reasons" | "block-confirm";

interface Props {
  visible: boolean;
  onClose: () => void;
  onReport: (reason: string) => void;
  onBlock: () => void;
  reportPending?: boolean;
  blockPending?: boolean;
}

export function ReportBlockSheet({ visible, onClose, onReport, onBlock, reportPending, blockPending }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // An absolute cap, not "85%": the sheet's parent is auto-height, and a
  // percentage against an indefinite parent is ignored by the layout engine.
  const { height: windowHeight } = useWindowDimensions();
  const [stage, setStage] = useState<Stage>("menu");

  const close = () => {
    setStage("menu");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          {/* Height-capped and scrollable. The reasons stage is the tallest of
              the three, and in a short window (landscape, or the app in a small
              window on iPad) an uncapped sheet puts the last reasons and Cancel
              below the bottom edge with no way to reach them — on the exact
              screen App Review asks to see demonstrated. */}
          <ScrollView
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border, maxHeight: windowHeight * 0.85 },
            ]}
            contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 30 }]}
            bounces={false}
          >
            {stage === "menu" && (
              <>
                <Text style={[styles.title, { color: colors.foreground }]}>More options</Text>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setStage("reasons")}
                  activeOpacity={0.7}
                  accessibilityLabel="Report this content"
                >
                  <Feather name="flag" size={18} color={colors.foreground} />
                  <Text style={[styles.rowLabel, { color: colors.foreground }]}>Report</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setStage("block-confirm")}
                  activeOpacity={0.7}
                  accessibilityLabel="Block this person"
                >
                  <Feather name="slash" size={18} color={colors.destructive} />
                  <Text style={[styles.rowLabel, { color: colors.destructive }]}>Block this person</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.row, styles.cancelRow]} onPress={close} activeOpacity={0.7}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {stage === "reasons" && (
              <>
                <Text style={[styles.title, { color: colors.foreground }]}>Why are you reporting this?</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Sent to a moderator for review. This does not notify the person who posted it.
                </Text>
                {REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={styles.row}
                    disabled={reportPending}
                    onPress={() => onReport(r.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rowLabel, { color: colors.foreground }]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.row, styles.cancelRow]} onPress={close} activeOpacity={0.7}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {stage === "block-confirm" && (
              <>
                <Text style={[styles.title, { color: colors.foreground }]}>Block this person?</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  You'll stop seeing their posts and replies right away, past and future. They won't be told.
                  You can undo this from Account → Blocked accounts.
                </Text>
                <TouchableOpacity
                  style={styles.row}
                  disabled={blockPending}
                  onPress={onBlock}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rowLabel, { color: colors.destructive, fontFamily: "Inter_600SemiBold" }]}>
                    {blockPending ? "Blocking…" : "Block"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.row, styles.cancelRow]} onPress={close} activeOpacity={0.7}>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  // Padding lives on the content container so it scrolls with the rows rather
  // than eating into the capped height.
  sheetContent: {
    padding: 18,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  cancelRow: {
    justifyContent: "center",
    marginTop: 4,
  },
  rowLabel: {
    fontSize: 15,
  },
});
