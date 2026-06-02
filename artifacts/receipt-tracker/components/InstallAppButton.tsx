import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useColors } from "@/hooks/useColors";

type Props = {
  style?: StyleProp<ViewStyle>;
};

// The Chrome/Edge/Android `beforeinstallprompt` event (not in lib.dom types).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  const iosStandalone = (window.navigator as { standalone?: boolean })
    .standalone;
  return Boolean(mql?.matches || iosStandalone);
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ masquerades as desktop Safari but has touch points.
  const iPadOS =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
  return iOSDevice || iPadOS;
}

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPad|iPhone|iPod/i.test(navigator.userAgent || "");
}

/**
 * Web-only "install this app" control (Add to Home Screen / Add to Desktop).
 *
 * - Chrome/Edge/Android: captures `beforeinstallprompt` and triggers the
 *   browser's native install prompt on tap.
 * - iOS Safari (no programmatic prompt): shows brief Share → Add to Home Screen
 *   instructions instead.
 * - Renders nothing on the native app build, when already installed
 *   (standalone display mode), or when no install path is available.
 */
export function InstallAppButton({ style }: Props) {
  const colors = useColors();
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(false);
  const [standalone, setStandalone] = React.useState(false);
  const [showIosHelp, setShowIosHelp] = React.useState(false);

  const ios = React.useMemo(() => isIos(), []);
  const mobile = React.useMemo(() => isMobile(), []);

  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    setStandalone(isStandalone());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Hidden on native, when already installed/standalone.
  if (Platform.OS !== "web" || installed || standalone) return null;

  // No native prompt and not iOS → nothing actionable to show.
  if (!deferredPrompt && !ios) return null;

  const label = mobile ? "Add to Home Screen" : "Add to Desktop";

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
      } catch {
        // ignore — user dismissed
      }
      setDeferredPrompt(null);
      return;
    }
    // iOS Safari: no programmatic prompt, surface manual instructions.
    setShowIosHelp((v) => !v);
  };

  return (
    <View style={style}>
      <TouchableOpacity
        style={[styles.button, { borderColor: colors.primary }]}
        onPress={handleInstall}
        activeOpacity={0.8}
      >
        <Feather name="download" size={16} color={colors.primary} />
        <Text style={[styles.buttonText, { color: colors.primary }]}>
          {label}
        </Text>
      </TouchableOpacity>

      {showIosHelp && !deferredPrompt ? (
        <View
          style={[
            styles.help,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
            Tap the{" "}
            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
              Share
            </Text>{" "}
            button in your browser, then choose{" "}
            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
              “Add to Home Screen.”
            </Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
  },
  buttonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  help: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  helpText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});
