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

// Capture the event at module level so we don't miss it if it fires before the
// component mounts (React hydration can lag behind the initial page load).
let _earlyPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (e) => { e.preventDefault(); _earlyPrompt = e as BeforeInstallPromptEvent; },
    { once: true },
  );
}

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
 * - Any browser without a programmatic prompt (iOS Safari, Firefox, desktop
 *   before the heuristic fires, etc.): tapping reveals concise manual
 *   instructions tailored to the device so the button is ALWAYS actionable.
 * - Renders nothing only on the native app build or when already installed
 *   (standalone display mode).
 */
export function InstallAppButton({ style }: Props) {
  const colors = useColors();
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(_earlyPrompt);
  const [installed, setInstalled] = React.useState(false);
  const [standalone, setStandalone] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);

  const ios = React.useMemo(() => isIos(), []);
  const mobile = React.useMemo(() => isMobile(), []);

  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    setStandalone(isStandalone());

    // Pick up any late-firing prompt (e.g. after navigating within the SPA).
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

  const label = mobile ? "Add to Home Screen" : "Install App";

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
    // No programmatic prompt available — surface manual instructions.
    setShowHelp((v) => !v);
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

      {showHelp && !deferredPrompt ? (
        <View
          style={[
            styles.help,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
            {ios ? (
              <>
                Tap the{" "}
                <Text style={styles.helpStrong}>Share</Text> button in your
                browser, then choose{" "}
                <Text style={styles.helpStrong}>“Add to Home Screen.”</Text>
              </>
            ) : mobile ? (
              <>
                Open your browser menu{" "}
                <Text style={styles.helpStrong}>(⋮)</Text>, then choose{" "}
                <Text style={styles.helpStrong}>
                  “Install app”
                </Text>{" "}
                or{" "}
                <Text style={styles.helpStrong}>“Add to Home Screen.”</Text>
              </>
            ) : (
              <>
                Click the{" "}
                <Text style={styles.helpStrong}>install icon</Text> in your
                browser's address bar, or open the browser menu{" "}
                <Text style={styles.helpStrong}>(⋮)</Text> and choose{" "}
                <Text style={styles.helpStrong}>“Install TimetoPay.”</Text>
              </>
            )}
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
  helpStrong: { fontFamily: "Inter_600SemiBold" },
});
