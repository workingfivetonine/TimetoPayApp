import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { openLegalPage } from "@/lib/legal";

/**
 * The terms-of-use agreement, presented BEFORE an account is created.
 *
 * App Store Guideline 1.2 requires apps with user-generated content to have
 * users agree to terms that make the no-tolerance policy explicit, and requires
 * that agreement to be shown before registering or logging in. A passive "by
 * continuing you agree" line under the button doesn't satisfy that on sign-up,
 * so `<LegalConsent required>` renders a checkbox that gates every way into an
 * account — email and Google alike.
 *
 * On sign-in the same copy renders as a notice (`required` omitted): the person
 * already agreed when they registered, and re-gating an existing user's login
 * behind a checkbox is friction with nothing behind it.
 */
interface Props {
  /** Render the gating checkbox. Omit for the read-only sign-in notice. */
  required?: boolean;
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** Verb used in the sentence — "signing up", "signing in". */
  action?: string;
}

function LegalLinks({ color, linkColor }: { color: string; linkColor: string }) {
  return (
    <>
      <Text style={[styles.link, { color: linkColor }]} onPress={() => openLegalPage("terms")}>
        Terms of Use
      </Text>
      <Text style={{ color }}> and </Text>
      <Text style={[styles.link, { color: linkColor }]} onPress={() => openLegalPage("privacy")}>
        Privacy Policy
      </Text>
    </>
  );
}

export function LegalConsent({ required, checked = false, onChange, action = "signing up" }: Props) {
  const colors = useColors();

  if (!required) {
    return (
      <Text style={[styles.notice, { color: colors.mutedForeground }]}>
        By {action} you agree to our{" "}
        <LegalLinks color={colors.mutedForeground} linkColor={colors.primary} />, including a
        zero-tolerance policy for objectionable content and abusive behaviour on the community
        board.
      </Text>
    );
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onChange?.(!checked)}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel="I agree to the Terms of Use and Privacy Policy"
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? colors.primary : colors.input },
          checked && { backgroundColor: colors.primary },
        ]}
      >
        {checked ? <Feather name="check" size={14} color="#fff" /> : null}
      </View>
      <Text style={[styles.rowText, { color: colors.mutedForeground }]}>
        I agree to the <LegalLinks color={colors.mutedForeground} linkColor={colors.primary} />. I
        understand TimetoPay has{" "}
        <Text style={[styles.emphasis, { color: colors.foreground }]}>
          zero tolerance for objectionable content or abusive users
        </Text>{" "}
        on the community board, and that accounts posting it are removed.
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 22 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    // Nudge the box onto the first line's optical baseline.
    marginTop: 1,
  },
  rowText: { flex: 1, fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 18 },
  emphasis: { fontFamily: "Inter_600SemiBold" },
  notice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 16,
  },
  link: { fontFamily: "Inter_600SemiBold" },
});
