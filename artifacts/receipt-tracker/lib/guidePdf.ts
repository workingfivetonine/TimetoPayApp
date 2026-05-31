import { Linking, Platform } from "react-native";
import { Asset } from "expo-asset";
import * as Sharing from "expo-sharing";

const GUIDE_MODULE = require("@/assets/guide/Receipt-Tracker-Guide.pdf");

export async function downloadGuidePdf(): Promise<void> {
  const asset = Asset.fromModule(GUIDE_MODULE);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.open === "function") {
      window.open(uri, "_blank");
    } else {
      await Linking.openURL(uri);
    }
    return;
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Receipt Tracker Guide",
    UTI: "com.adobe.pdf",
  });
}
