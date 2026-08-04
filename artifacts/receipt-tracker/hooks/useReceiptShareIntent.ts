import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useShareIntent } from "expo-share-intent";
import { setSharedFile } from "@/stores/sharedFile";

// Accepts a receipt shared into the app from another app (Photos, Files, a mail
// client) and hands it to the scan screen, which runs the same pipeline as a
// picked or captured file.
//
// Needs a native build to do anything: the share target is registered via
// Info.plist / AndroidManifest entries that the expo-share-intent config plugin
// writes at prebuild, so it is inert in Expo Go and on web.
export function useReceiptShareIntent(enabled: boolean) {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    // Web has no share target to register, and routing before sign-in would
    // bounce the user through the auth gate and lose the file.
    disabled: Platform.OS === "web" || !enabled,
  });

  useEffect(() => {
    if (!hasShareIntent) return;

    const file = shareIntent.files?.[0];
    if (!file) {
      // Shared text or a URL rather than a file — nothing to scan.
      resetShareIntent();
      return;
    }

    const isPdf =
      file.mimeType === "application/pdf" || file.fileName?.toLowerCase().endsWith(".pdf");
    const isImage = file.mimeType?.startsWith("image/");
    if (!isPdf && !isImage) {
      resetShareIntent();
      return;
    }

    setSharedFile({
      uri: file.path,
      kind: isPdf ? "pdf" : "image",
      width: file.width,
      height: file.height,
    });
    // Consume the native intent now that it's parked in the store, so
    // backgrounding the app doesn't replay it.
    resetShareIntent();
    router.push("/scan?shared=1");
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);
}
