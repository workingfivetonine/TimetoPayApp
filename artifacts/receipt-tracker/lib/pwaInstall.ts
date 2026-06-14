import { Platform } from "react-native";

// The Chrome/Edge/Android `beforeinstallprompt` event (not in lib.dom types).
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Module-level capture — this module is imported from _layout.tsx (root bundle,
// always loaded first), so the listener is registered before any route-specific
// code or lazy chunks run. InstallAppButton reads `capturedPrompt` at mount time
// and also registers its own listener for late-firing cases.
export let capturedPrompt: BeforeInstallPromptEvent | null = null;

if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (e) => {
      e.preventDefault();
      capturedPrompt = e as BeforeInstallPromptEvent;
    },
    { once: true },
  );
}

export function clearCapturedPrompt() {
  capturedPrompt = null;
}
