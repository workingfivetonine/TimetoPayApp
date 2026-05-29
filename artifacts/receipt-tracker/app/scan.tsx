import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { fetch as expoFetch } from "expo/fetch";
import { useColors } from "@/hooks/useColors";
import {
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scanningLabel, setScanningLabel] = useState("Analyzing with AI...");
  const [facing, setFacing] = useState<"back" | "front">("back");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
  };

  const callApi = async (path: string, body: object) => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const url = `https://${domain}/api/receipts/${path}`;
    const response = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`API error ${response.status}`);
    return response.json() as Promise<{ id: number }>;
  };

  const processBase64Image = async (base64: string) => {
    setScanning(true);
    setScanningLabel("Analyzing receipt with AI...");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const receipt = await callApi("parse-and-save", { imageBase64: base64 });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
      router.replace(`/receipt/${receipt.id}`);
    } catch {
      Alert.alert("Error", "Could not process the receipt image. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const processPdf = async (base64: string) => {
    setScanning(true);
    setScanningLabel("Extracting PDF with AI...");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const receipt = await callApi("parse-pdf", { pdfBase64: base64 });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
      router.replace(`/receipt/${receipt.id}`);
    } catch {
      Alert.alert("Error", "Could not process the PDF receipt. Make sure it's an order confirmation.");
    } finally {
      setScanning(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || scanning) return;
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8 });
    if (photo?.base64) await processBase64Image(photo.base64);
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      await processBase64Image(result.assets[0].base64);
    }
  };

  const handlePickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;

      // Read the file as base64
      const response = await expoFetch(asset.uri);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        // strip "data:...;base64," prefix
        const base64 = dataUrl.split(",")[1];
        if (base64) await processPdf(base64);
      };
      reader.readAsDataURL(blob);
    } catch {
      Alert.alert("Error", "Could not open the PDF file.");
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permContainer, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <TouchableOpacity style={[styles.floatingBack, { top: insets.top + 12 }]} onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.permContent}>
          <View style={[styles.permIcon, { backgroundColor: colors.accent }]}>
            <Feather name="camera" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera Access</Text>
          <Text style={[styles.permText, { color: colors.mutedForeground }]}>
            Allow camera access to photograph receipts for AI-powered data extraction
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <View style={styles.orRow}>
            <View style={[styles.orLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.orText, { color: colors.mutedForeground }]}>or</Text>
            <View style={[styles.orLine, { backgroundColor: colors.border }]} />
          </View>
          <UploadButtons
            colors={colors}
            onImage={handlePickImage}
            onPdf={handlePickPdf}
            disabled={scanning}
          />
        </View>
        {scanning && <ScanningOverlay label={scanningLabel} />}
      </View>
    );
  }

  // Web: no camera — image picker + PDF only
  if (Platform.OS === "web") {
    return (
      <View style={[styles.permContainer, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <TouchableOpacity style={[styles.floatingBack, { top: insets.top + 12 }]} onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.permContent}>
          <View style={[styles.permIcon, { backgroundColor: colors.accent }]}>
            <Feather name="upload" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.permTitle, { color: colors.foreground }]}>Upload Receipt</Text>
          <Text style={[styles.permText, { color: colors.mutedForeground }]}>
            Upload a receipt photo or PDF order confirmation — AI extracts items and prices automatically
          </Text>
          <UploadButtons
            colors={colors}
            onImage={handlePickImage}
            onPdf={handlePickPdf}
            disabled={scanning}
          />
        </View>
        {scanning && <ScanningOverlay label={scanningLabel} />}
      </View>
    );
  }

  // Native camera
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.circleBtn} onPress={() => router.back()}>
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>Scan Receipt</Text>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={() => setFacing(facing === "back" ? "front" : "back")}
          >
            <Feather name="refresh-cw" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Viewfinder */}
        <View style={styles.viewfinderContainer}>
          <View style={[styles.viewfinder, { borderColor: "rgba(255,255,255,0.5)" }]}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.viewfinderHint}>Align receipt within frame</Text>
        </View>

        {/* Bottom controls */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
          {/* Gallery + PDF stacked */}
          <View style={styles.sideButtons}>
            <TouchableOpacity
              style={[styles.sideBtn, { backgroundColor: "rgba(0,0,0,0.4)" }]}
              onPress={handlePickImage}
              disabled={scanning}
            >
              <Feather name="image" size={18} color="#fff" />
              <Text style={styles.sideBtnLabel}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sideBtn, { backgroundColor: "rgba(0,0,0,0.4)", marginTop: 8 }]}
              onPress={handlePickPdf}
              disabled={scanning}
            >
              <Feather name="file-text" size={18} color="#fff" />
              <Text style={styles.sideBtnLabel}>PDF</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.captureBtn, scanning && styles.captureBtnDisabled]}
            onPress={handleCapture}
            disabled={scanning}
            activeOpacity={0.8}
          >
            {scanning ? <ActivityIndicator color="#0d9488" /> : <View style={styles.captureInner} />}
          </TouchableOpacity>

          <View style={{ width: 64 }} />
        </View>
      </CameraView>

      {scanning && <ScanningOverlay label={scanningLabel} />}
    </View>
  );
}

function UploadButtons({
  colors,
  onImage,
  onPdf,
  disabled,
}: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  onImage: () => void;
  onPdf: () => void;
  disabled: boolean;
}) {
  return (
    <View style={uploadStyles.row}>
      <TouchableOpacity
        style={[uploadStyles.btn, { backgroundColor: colors.primary }]}
        onPress={onImage}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Feather name="image" size={20} color="#fff" />
        <Text style={uploadStyles.btnText}>Photo</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[uploadStyles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
        onPress={onPdf}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Feather name="file-text" size={20} color={colors.foreground} />
        <Text style={[uploadStyles.btnText, { color: colors.foreground }]}>PDF</Text>
      </TouchableOpacity>
    </View>
  );
}

const uploadStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

function ScanningOverlay({ label }: { label: string }) {
  return (
    <View style={overlayStyles.container}>
      <View style={overlayStyles.card}>
        <ActivityIndicator color="#0d9488" size="large" />
        <Text style={overlayStyles.text}>{label}</Text>
      </View>
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 16,
    minWidth: 220,
  },
  text: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#0f172a", textAlign: "center" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  permContainer: { flex: 1 },
  floatingBack: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  permContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 14,
  },
  permIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  permTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  permText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  primaryBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24, marginTop: 4 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%" },
  orLine: { flex: 1, height: 1 },
  orText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  viewfinderContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  viewfinder: { width: 280, height: 380, borderWidth: 1, borderRadius: 8, position: "relative" },
  corner: { position: "absolute", width: 24, height: 24, borderColor: "#fff", borderWidth: 3 },
  cornerTL: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0, borderRadius: 4 },
  cornerTR: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0, borderRadius: 4 },
  cornerBL: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0, borderRadius: 4 },
  cornerBR: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0, borderRadius: 4 },
  viewfinderHint: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular" },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 16,
  },
  sideButtons: { alignItems: "center" },
  sideBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  sideBtnLabel: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.4)",
  },
  captureBtnDisabled: { opacity: 0.6 },
  captureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#fff" },
});
