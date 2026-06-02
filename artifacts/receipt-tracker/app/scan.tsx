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
import { getApiOrigin } from "@/lib/apiBase";
import { usePremiumLock } from "@/hooks/usePremiumLock";
import { PremiumUpsell } from "@/components/PremiumUpsell";

interface PendingImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
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
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  // Thrown when the server returns 403 (premium feature, free web user). Lets
  // the call sites show an upsell + route to the paywall instead of a generic
  // "could not read" error.
  class PremiumRequiredError extends Error {
    constructor() {
      super("premium_required");
    }
  }

  const promptUpgrade = () => {
    Alert.alert("Subscribe for access to premium AI features", undefined, [
      { text: "Not now", style: "cancel" },
      { text: "Subscribe", onPress: () => router.push("/paywall") },
    ]);
  };

  const callApi = async (path: string, body: object) => {
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
    if (!response.ok) throw new Error(`API error ${response.status}`);
    return response.json() as Promise<{ id: number }>;
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 1.0,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingImage({
      uri: asset.uri,
      base64: asset.base64!,
      width: asset.width,
      height: asset.height,
    });
  };

  const handleEditorConfirm = async (editedBase64: string) => {
    setPendingImage(null);
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
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const parsed = (await response.json()) as ParsedReceiptData;
      setPendingReceipt(parsed, editedBase64);
      router.push("/review-receipt");
    } catch (err) {
      if (err instanceof PremiumRequiredError) promptUpgrade();
      else Alert.alert("Error", "Could not read this receipt image. Please try again.");
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

    setScanning(true);
    setScanningLabel("Extracting PDF with AI…");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const fileResponse = await expoFetch(result.assets[0].uri);
      const blob = await fileResponse.blob();

      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(",")[1];
            if (!base64) throw new Error("Empty file");
            const receipt = await callApi("parse-pdf", { pdfBase64: base64 });
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            invalidateAll();
            router.replace(`/receipt/${receipt.id}`);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      if (err instanceof PremiumRequiredError) {
        promptUpgrade();
      } else {
        Alert.alert(
          "Error",
          "Could not process this PDF. Make sure it's a text-based order confirmation."
        );
      }
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
