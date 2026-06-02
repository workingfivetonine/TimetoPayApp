import { useSSO } from "@clerk/expo";
import { AntDesign } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { type Href, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

// Completes any pending web auth session (no-op on native).
WebBrowser.maybeCompleteAuthSession();

// Preloads the browser on Android to reduce OAuth load time.
function useWarmUpBrowser() {
  React.useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export function GoogleAuthButton({ label = "Continue with Google" }: { label?: string }) {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const colors = useColors();

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onPress = React.useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });

      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            const url = decorateUrl("/");
            if (url.startsWith("http")) {
              window.location.href = url;
            } else {
              router.replace(url as Href);
            }
          },
        });
      } else {
        // No session was created: the user cancelled the popup, or the flow
        // needs extra steps this instance isn't configured for. Surface a
        // message instead of silently doing nothing.
        setError("Google sign-in didn't complete. Please try again or use email.");
      }
    } catch {
      setError("Could not sign in with Google. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [router, startSSOFlow]);

  return (
    <View>
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          { borderColor: colors.input, backgroundColor: colors.card },
          busy && styles.buttonDisabled,
        ]}
        onPress={onPress}
        disabled={busy}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={colors.foreground} />
        ) : (
          <>
            <AntDesign name="google" size={18} color="#4285F4" style={styles.icon} />
            <Text style={[styles.buttonText, { color: colors.foreground }]}>{label}</Text>
          </>
        )}
      </TouchableOpacity>

      {error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 6,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  icon: { marginRight: 10 },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 12 },
});
