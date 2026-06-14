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
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { InstallAppButton } from "@/components/InstallAppButton";
import { PasswordRequirements } from "@/components/PasswordRequirements";
import { passwordMeetsPolicy } from "@/utils/passwordPolicy";

type AuthView = "signin" | "forgot";
type ForgotStep = "email" | "reset";

function clerkError(e: unknown): string {
  const err = e as { errors?: { longMessage?: string; message?: string }[]; message?: string } | null;
  return (
    err?.errors?.[0]?.longMessage ??
    err?.errors?.[0]?.message ??
    err?.message ??
    "Something went wrong. Please try again."
  );
}

export default function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const colors = useColors();

  const [view, setView] = React.useState<AuthView>("signin");
  const [forgotStep, setForgotStep] = React.useState<ForgotStep>("email");

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");

  const [resetEmail, setResetEmail] = React.useState("");
  const [resetCode, setResetCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handleSubmit = async () => {
    if (!isLoaded || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await signIn.create({ identifier: emailAddress, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/" as Href);
      } else {
        setError("Sign in could not be completed. Please try again.");
      }
    } catch (e) {
      setError(clerkError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSendResetCode = async () => {
    if (!isLoaded || busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: resetEmail,
      });
      setForgotStep("reset");
    } catch (e) {
      setError(clerkError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitNewPassword = async () => {
    if (!isLoaded || busy) return;
    setError(null);
    if (!passwordMeetsPolicy(newPassword)) {
      setError("Your new password doesn't meet the requirements below.");
      return;
    }
    setBusy(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode,
        password: newPassword,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/" as Href);
      } else {
        setError("Could not reset password. Please try again.");
      }
    } catch (e) {
      setError(clerkError(e));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: AuthView) => {
    setError(null);
    setForgotStep("email");
    setView(next);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={[styles.brandIcon, { backgroundColor: colors.accent }]}>
            <Feather name="file-text" size={26} color={colors.primary} />
          </View>

          {view === "signin" ? (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Sign in to your TimetoPay account
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

              <TouchableOpacity onPress={() => switchTo("forgot")} style={styles.forgotLink} hitSlop={8}>
                <Text style={[styles.link, { color: colors.primary }]}>Forgot password?</Text>
              </TouchableOpacity>

              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }, (!emailAddress || !password || busy) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!emailAddress || !password || busy}
                activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
              </TouchableOpacity>

              <GoogleAuthButton label="Sign in with Google" />

              <View style={styles.linkRow}>
                <Text style={{ color: colors.mutedForeground }}>Don't have an account? </Text>
                <Link href="/(auth)/sign-up" replace>
                  <Text style={[styles.link, { color: colors.primary }]}>Sign up</Text>
                </Link>
              </View>

              <InstallAppButton style={styles.install} />
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>Reset password</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {forgotStep === "email"
                  ? "Enter your email and we'll send you a reset code."
                  : "Enter the code we emailed you and choose a new password."}
              </Text>

              {forgotStep === "email" ? (
                <>
                  <Text style={[styles.label, { color: colors.foreground }]}>Email</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
                    autoCapitalize="none"
                    autoComplete="email"
                    value={resetEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.mutedForeground}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    onSubmitEditing={handleSendResetCode}
                  />

                  {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: colors.primary }, (!resetEmail || busy) && styles.buttonDisabled]}
                    onPress={handleSendResetCode}
                    disabled={!resetEmail || busy}
                    activeOpacity={0.85}
                  >
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset code</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.label, { color: colors.foreground }]}>Reset code</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
                    value={resetCode}
                    placeholder="Enter the 6-digit code"
                    placeholderTextColor={colors.mutedForeground}
                    onChangeText={setResetCode}
                    keyboardType="number-pad"
                  />

                  <Text style={[styles.label, { color: colors.foreground }]}>New password</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
                    value={newPassword}
                    placeholder="Choose a new password"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry
                    onChangeText={setNewPassword}
                    onSubmitEditing={handleSubmitNewPassword}
                  />

                  <PasswordRequirements password={newPassword} />

                  {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: colors.primary }, (!resetCode || !passwordMeetsPolicy(newPassword) || busy) && styles.buttonDisabled]}
                    onPress={handleSubmitNewPassword}
                    disabled={!resetCode || !passwordMeetsPolicy(newPassword) || busy}
                    activeOpacity={0.85}
                  >
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update password</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleSendResetCode} style={styles.forgotLink} hitSlop={8} disabled={busy}>
                    <Text style={[styles.link, { color: colors.primary }]}>Resend code</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.linkRow}>
                <TouchableOpacity onPress={() => switchTo("signin")} hitSlop={8}>
                  <Text style={[styles.link, { color: colors.primary }]}>Back to sign in</Text>
                </TouchableOpacity>
              </View>
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
  brandIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 6 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 28 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  forgotLink: { alignSelf: "flex-end", marginTop: 12 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 12 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 24 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkRow: { flexDirection: "row", justifyContent: "center", marginTop: 22 },
  link: { fontFamily: "Inter_600SemiBold" },
  install: { marginTop: 24 },
});
