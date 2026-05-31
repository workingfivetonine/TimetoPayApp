import { useSignIn } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");

  const busy = fetchStatus === "fetching";

  const handleSubmit = async () => {
    const { error } = await signIn.password({ emailAddress, password });
    if (error) return;

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) return;
          const url = decorateUrl("/");
          if (url.startsWith("http")) {
            window.location.href = url;
          } else {
            router.replace(url as Href);
          }
        },
      });
    }
  };

  const formError =
    errors.fields.identifier?.message || errors.fields.password?.message;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={[styles.brandIcon, { backgroundColor: colors.accent }]}>
            <Feather name="file-text" size={26} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to your Receipt Tracker
          </Text>

          <Text style={[styles.label, { color: colors.foreground }]}>Email</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
            autoCapitalize="none"
            autoComplete="email"
            value={emailAddress}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setEmailAddress}
            keyboardType="email-address"
          />

          <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
            value={password}
            placeholder="Enter password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            onChangeText={setPassword}
            onSubmitEditing={handleSubmit}
          />

          {formError ? (
            <Text style={[styles.error, { color: colors.destructive }]}>{formError}</Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              (!emailAddress || !password || busy) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!emailAddress || !password || busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <View style={styles.linkRow}>
            <Text style={{ color: colors.mutedForeground }}>Don't have an account? </Text>
            <Link href="/(auth)/sign-up" replace>
              <Text style={[styles.link, { color: colors.primary }]}>Sign up</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    ...(Platform.OS === "web" ? { alignSelf: "center" } : {}),
  },
  brandIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 6 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 28 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 12 },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkRow: { flexDirection: "row", justifyContent: "center", marginTop: 22 },
  link: { fontFamily: "Inter_600SemiBold" },
});
