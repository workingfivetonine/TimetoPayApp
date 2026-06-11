import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { fetch as expoFetch } from "expo/fetch";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import {
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import ImageEditor from "@/components/ImageEditor";
import { setPendingReceipt, type ParsedReceiptData } from "@/stores/pendingReceipt";
import { setBatchReceipts, type BatchReceiptSummary } from "@/stores/batchReceipts";
import { getApiOrigin } from "@/lib/apiBase";
import { usePremiumLock } from "@/hooks/usePremiumLock";
import { PremiumUpsell } from "@/components/PremiumUpsell";
import { PremiumBadge } from "@/components/PremiumBadge";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";

interface PendingImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
}

// Minimal shape we need from a saved-receipt response (parse-and-save / each
// parse-pdf page) to build a batch-review summary.
interface SavedReceipt {
  id: number;
  storeName?: string | null;
  total?: number | null;
  purchasedAt?: string | null;
  lineItems?: unknown[];
}

function toSummary(saved: SavedReceipt): BatchReceiptSummary {
  return {
    id: saved.id,
    storeName: saved.storeName ?? "Unknown Store",
    total: saved.total ?? 0,
    itemCount: saved.lineItems?.length ?? 0,
    purchasedAt: saved.purchasedAt ?? new Date().toISOString(),
  };
}

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const locked = usePremiumLock();
  const [scanning, setScanning] = useState(false);
  const [scanningLabel, setScanningLabel] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);

  const invalidateAll = () => {
    // Only invalidate receipts - the main data that changed
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    // Let other queries refresh naturally when needed
  };

  // Thrown when the server returns 403 (premium feature, free web user). Lets
  // the call sites show an upsell + route to the paywall instead of a generic
  // "could not read" error.
  class PremiumRequiredError extends Error {
    constructor() {
      super("premium_required");
    }
  }

  // Carries the HTTP status (and any server message) so we can show the user a
  // specific reason for an upload failure + the right recommendation.
  class UploadError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message ?? `API error ${status}`);
      this.status = status;
    }
  }

  const promptUpgrade = () => {
    Alert.alert("Subscribe for access to premium AI features", undefined, [
      { text: "Not now", style: "cancel" },
      { text: "Subscribe", onPress: () => router.push("/paywall") },
    ]);
  };

  // Turn an upload failure into a plain-language reason + recommendation. Always
  // ends by pointing the user at the manual entry fallback.
  const failureReason = (err: unknown, kind: "image" | "pdf"): string => {
    if (err instanceof UploadError) {
      switch (err.status) {
        case 413:
          return kind === "pdf"
            ? "This PDF is too large to process. Try a smaller file (fewer pages), or add the details manually."
            : "This image is too large to process. Try a smaller or lower-resolution photo, or add the details manually.";
        case 429:
          return "You've reached the limit for AI scans right now. Please wait a few minutes and try again, or add the details manually.";
        case 422:
          return kind === "pdf"
            ? "We couldn't read this PDF — it may be a scanned image, password-protected, or corrupted. Try a text-based order confirmation, or add the details manually."
            : "We couldn't read this photo clearly. Try a sharper, well-lit picture with the whole receipt in frame, or add the details manually.";
        case 400:
          return "That file didn't look like a receipt we could read. Try a different file, or add the details manually.";
        default:
          if (err.status >= 500)
            return "Our scanner had a temporary problem. Please try again in a moment, or add the details manually.";
          return "Something went wrong reading this receipt. Please try again, or add the details manually.";
      }
    }
    // No HTTP status — almost always a network/connectivity problem.
    return "We couldn't reach the scanner. Check your internet connection and try again, or add the details manually.";
  };

  // Show the failure with a reason and clear next steps: retry the same upload,
  // or switch to manual entry.
  const showUploadFailure = (
    err: unknown,
    kind: "image" | "pdf",
    retry: () => void,
  ) => {
    Alert.alert("Couldn't read this receipt", failureReason(err, kind), [
      { text: "Add manually", onPress: () => router.push("/manual-entry") },
      { text: "Try again", onPress: retry },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const callApi = async <T,>(path: string, body: object): Promise<T> => {
    const url = `${getApiOrigin()}/api/receipts/${path}`;
    const token = await getToken();
    const response = await expoFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-platform": Platform.OS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (response.status === 403) throw new PremiumRequiredError();
    if (!response.ok) throw new UploadError(response.status);
    return response.json() as Promise<T>;
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 1.0,
      allowsMultipleSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    const assets = result.assets.filter((a) => a.base64);
    if (assets.length === 0) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Single photo → the existing crop-and-review flow. Multiple photos →
    // each becomes its own receipt, then the batch-review screen lets the user
    // merge any that belong together.
    if (assets.length === 1) {
      const asset = assets[0];
      setPendingImage({
        uri: asset.uri,
        base64: asset.base64!,
        width: asset.width,
        height: asset.height,
      });
    } else {
      await parseMultipleImages(assets.map((a) => a.base64!));
    }
  };

  // Parse several photos at once, saving each as its own receipt. Failures on
  // individual photos are collected and reported without aborting the rest.
  const parseMultipleImages = async (imagesBase64: string[]) => {
    setScanning(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const summaries: BatchReceiptSummary[] = [];
    let premiumBlocked = false;
    let failures = 0;
    try {
      const results = await batchProcess(
        imagesBase64,
        async (base64, index) => {
          setScanningLabel(`Analyzing photo ${index + 1} of ${imagesBase64.length}…`);
          return callApi<SavedReceipt>("parse-and-save", {
            imageBase64: base64,
          });
        },
        { concurrency: 3 }
      );

      summaries.push(...results.map(toSummary));
    } catch (err) {
      if (err instanceof PremiumRequiredError) {
        premiumBlocked = true;
      } else {
        failures++;
      }
    } finally {
      setScanning(false);
    }

    if (premiumBlocked && summaries.length === 0) {
      promptUpgrade();
      return;
    }

    if (summaries.length === 0) {
      showUploadFailure(new UploadError(422), "image", () =>
        parseMultipleImages(imagesBase64),
      );
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidateAll();

    if (failures > 0) {
      Alert.alert(
        "Some photos couldn't be read",
        `We saved ${summaries.length} of ${imagesBase64.length} photos. The rest couldn't be read — you can add those manually.`,
      );
    }

    if (summaries.length === 1) {
      router.replace(`/receipt/${summaries[0].id}`);
    } else {
      setBatchReceipts(summaries);
      router.replace("/batch-review");
    }
  };

  const handleEditorConfirm = async (editedBase64: string) => {
    setPendingImage(null);
    await parseImage(editedBase64);
  };

  const parseImage = async (editedBase64: string) => {
    setScanning(true);
    setScanningLabel("Analyzing receipt with AI…");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const url = `${getApiOrigin()}/api/receipts/parse`;
      const token = await getToken();
      const response = await expoFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-platform": Platform.OS,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageBase64: editedBase64 }),
      });
      if (response.status === 403) throw new PremiumRequiredError();
      if (!response.ok) throw new UploadError(response.status);
      const parsed = (await response.json()) as ParsedReceiptData;
      setPendingReceipt(parsed, editedBase64);
      router.push("/review-receipt");
    } catch (err) {
      if (err instanceof PremiumRequiredError) promptUpgrade();
      else showUploadFailure(err, "image", () => parseImage(editedBase64));
    } finally {
      setScanning(false);
    }
  };

  const handleEditorCancel = () => setPendingImage(null);

  const handlePickPdf = async () => {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
    } catch {
      Alert.alert("Error", "Could not open the file picker.");
      return;
    }

    if (result.canceled || !result.assets[0]?.uri) return;

    // Read the picked file into base64 first, then hand off to parsePdf so a
    // failed parse can be retried without re-picking the file.
    let base64: string;
    try {
      const fileResponse = await expoFetch(result.assets[0].uri);
      const blob = await fileResponse.blob();
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const b64 = dataUrl.split(",")[1];
          if (!b64) reject(new Error("Empty file"));
          else resolve(b64);
        };
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(blob);
      });
    } catch {
      Alert.alert(
        "Couldn't open this file",
        "We couldn't read the selected PDF. Try choosing it again, or add the details manually.",
        [
          { text: "Add manually", onPress: () => router.push("/manual-entry") },
          { text: "OK", style: "cancel" },
        ],
      );
      return;
    }

    await parsePdf(base64);
  };

  const parsePdf = async (base64: string) => {
    setScanning(true);
    setScanningLabel("Extracting PDF with AI…");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { receipts } = await callApi<{ receipts: SavedReceipt[] }>("parse-pdf", {
        pdfBase64: base64,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
      // One page → straight to that receipt. Multiple pages each became their
      // own receipt → batch-review so the user can merge any that belong
      // together.
      if (receipts.length === 1) {
        router.replace(`/receipt/${receipts[0].id}`);
      } else {
        setBatchReceipts(receipts.map(toSummary));
        router.replace("/batch-review");
      }
    } catch (err) {
      if (err instanceof PremiumRequiredError) promptUpgrade();
      else showUploadFailure(err, "pdf", () => parsePdf(base64));
    } finally {
      setScanning(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Add Receipt</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.accent }]}>
          <Feather name="upload" size={36} color={colors.primary} />
        </View>

        {locked ? <PremiumBadge style={styles.premiumBadge} /> : null}
        <Text style={[styles.headline, { color: colors.foreground }]}>
          {locked ? "AI receipt scanning" : "Upload a receipt"}
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground }]}>
          {locked
            ? "Subscribe to scan photos and PDFs — AI extracts the store, items, and prices for you. You can still add receipts manually below for free."
            : "AI extracts the store, items, and prices automatically"}
        </Text>

        {locked ? (
          <TouchableOpacity
            style={[styles.primaryBtn, styles.upgradeBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/paywall")}
            activeOpacity={0.85}
          >
            <Feather name="zap" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Subscribe to unlock</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Upload buttons */}
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handlePickImage}
                disabled={scanning}
                activeOpacity={0.8}
              >
                <Feather name="image" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Choose Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handlePickPdf}
                disabled={scanning}
                activeOpacity={0.8}
              >
                <Feather name="file-text" size={20} color={colors.foreground} />
                <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                  Upload PDF
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              PDFs work best for online order confirmations
            </Text>
          </>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.manualRow}>
          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => router.push("/manual-entry")}
            disabled={scanning}
            activeOpacity={0.7}
          >
            <Feather name="edit-3" size={15} color={colors.mutedForeground} />
            <Text style={[styles.manualBtnText, { color: colors.mutedForeground }]}>
              Enter Manually
            </Text>
          </TouchableOpacity>

          <View style={[styles.manualDot, { backgroundColor: colors.border }]} />

          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => router.push("/quick-add")}
            disabled={scanning}
            activeOpacity={0.7}
          >
            <Feather name="list" size={15} color={colors.mutedForeground} />
            <Text style={[styles.manualBtnText, { color: colors.mutedForeground }]}>
              Log Items
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scanning overlay */}
      {scanning && (
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.overlayText, { color: colors.foreground }]}>
              {scanningLabel}
            </Text>
          </View>
        </View>
      )}

      {/* Image editor — shown after picking a photo, before sending to AI */}
      {pendingImage && (
        <ImageEditor
          uri={pendingImage.uri}
          imageWidth={pendingImage.width}
          imageHeight={pendingImage.height}
          onConfirm={handleEditorConfirm}
          onCancel={handleEditorCancel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  premiumBadge: {
    marginBottom: 10,
  },
  headline: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  buttons: {
    width: "100%",
    gap: 12,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  upgradeBtn: {
    width: "100%",
    marginTop: 8,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
  divider: {
    height: 1,
    width: "100%",
    marginTop: 12,
    marginBottom: 4,
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  manualBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  manualBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  manualDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 14,
    minWidth: 200,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  overlayText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
