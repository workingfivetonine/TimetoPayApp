import { useSignUp } from "@clerk/expo";
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
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { PasswordRequirements } from "@/components/PasswordRequirements";
import { passwordMeetsPolicy } from "@/utils/passwordPolicy";

function clerkError(e: unknown): string {
  const err = e as { errors?: { longMessage?: string; message?: string }[]; message?: string } | null;
  return (
    err?.errors?.[0]?.longMessage ??
    err?.errors?.[0]?.message ??
    err?.message ??
    "Something went wrong. Please try again."
  );
}

export default function SignUpPage() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const colors = useColors();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handleSubmit = async () => {
    if (!isLoaded || busy) return;
    setError(null);
    setBusy(true);
    try {
      await signUp.create({ emailAddress, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (e) {
      setError(clerkError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/" as Href);
      } else {
        setError("Verification could not be completed. Please try again.");
      }
    } catch (e) {
      setError(clerkError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded || busy) return;
    setError(null);
    setBusy(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    } catch (e) {
      setError(clerkError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={[styles.brandIcon, { backgroundColor: colors.accent }]}>
            <Feather name="file-text" size={26} color={colors.primary} />
          </View>

          {pendingVerification ? (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>Verify your email</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Enter the code we sent to {emailAddress}
              </Text>

              <Text style={[styles.label, { color: colors.foreground }]}>Verification code</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
                value={code}
                placeholder="123456"
                placeholderTextColor={colors.mutedForeground}
                onChangeText={setCode}
                keyboardType="numeric"
                onSubmitEditing={handleVerify}
              />

              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }, (!code || busy) && styles.buttonDisabled]}
                onPress={handleVerify}
                disabled={!code || busy}
                activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={handleResendCode} disabled={busy}>
                <Text style={[styles.link, { color: colors.primary }]}>I need a new code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>Create your account</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Start tracking your receipts
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
                placeholder="Create a password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                onChangeText={setPassword}
              />

              <PasswordRequirements password={password} />

              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: colors.primary },
                  (!emailAddress || !passwordMeetsPolicy(password) || busy) && styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!emailAddress || !passwordMeetsPolicy(password) || busy}
                activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign up</Text>}
              </TouchableOpacity>

              <GoogleAuthButton label="Sign up with Google" />

              <View style={styles.linkRow}>
                <Text style={{ color: colors.mutedForeground }}>Already have an account? </Text>
                <Link href="/(auth)/sign-in" replace>
                  <Text style={[styles.link, { color: colors.primary }]}>Sign in</Text>
                </Link>
              </View>

              {/* Required for Clerk's bot sign-up protection */}
              <View nativeID="clerk-captcha" />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 20 },
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
  secondaryButton: { alignItems: "center", marginTop: 18 },
  linkRow: { flexDirection: "row", justifyContent: "center", marginTop: 22 },
  link: { fontFamily: "Inter_600SemiBold" },
});
