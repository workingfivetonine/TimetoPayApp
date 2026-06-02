import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { evaluatePassword } from "@/utils/passwordPolicy";

/**
 * Live password-requirements checklist shown beneath a "create password" field.
 * Each rule turns green with a check once satisfied. Renders nothing until the
 * user starts typing so the empty form stays clean.
 */
export function PasswordRequirements({ password }: { password: string }) {
  const colors = useColors();
  if (!password) return null;

  const rules = evaluatePassword(password);

  return (
    <View style={styles.container}>
      {rules.map((rule) => (
        <View key={rule.label} style={styles.row}>
          <Feather
            name={rule.met ? "check-circle" : "circle"}
            size={14}
            color={rule.met ? colors.primary : colors.mutedForeground}
          />
          <Text
            style={[
              styles.text,
              { color: rule.met ? colors.foreground : colors.mutedForeground },
            ]}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  text: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
