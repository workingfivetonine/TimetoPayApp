import { Linking, Platform } from "react-native";
import { Asset } from "expo-asset";
import * as Sharing from "expo-sharing";

const GUIDE_MODULE = require("@/assets/guide/Receipt-Tracker-Guide.pdf");
const ADMIN_GUIDE_MODULE = require("@/assets/guide/Receipt-Tracker-Admin-Guide.pdf");

async function openPdf(module: number, dialogTitle: string): Promise<void> {
  const asset = Asset.fromModule(module);
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
    dialogTitle,
    UTI: "com.adobe.pdf",
  });
}

export function downloadGuidePdf(): Promise<void> {
  return openPdf(GUIDE_MODULE, "TimetoPay Guide");
}

export function downloadAdminGuidePdf(): Promise<void> {
  return openPdf(ADMIN_GUIDE_MODULE, "TimetoPay Admin Guide");
}
