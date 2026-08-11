import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useShareIntent } from "expo-share-intent";
import { setSharedFiles, type SharedReceiptFile } from "@/stores/sharedFile";

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

    // A share sheet can hand over several files at once. Everything that is a
    // receipt-shaped file is kept; anything else in the selection is dropped
    // rather than failing the whole share.
    const files: SharedReceiptFile[] = (shareIntent.files ?? []).flatMap((file) => {
      const isPdf =
        file.mimeType === "application/pdf" || file.fileName?.toLowerCase().endsWith(".pdf");
      const isImage = file.mimeType?.startsWith("image/");
      if (!isPdf && !isImage) return [];
      return [{
        uri: file.path,
        kind: isPdf ? ("pdf" as const) : ("image" as const),
        width: file.width,
        height: file.height,
      }];
    });

    if (files.length === 0) {
      // Shared text, a URL, or files we can't read — nothing to scan.
      resetShareIntent();
      return;
    }

    setSharedFiles(files);
    // Consume the native intent now that it's parked in the store, so
    // backgrounding the app doesn't replay it.
    resetShareIntent();
    router.push("/scan?shared=1");
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);
}
