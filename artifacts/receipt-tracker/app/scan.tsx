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
import { fetch as expoFetch } from "expo/fetch";
import { useColors } from "@/hooks/useColors";
import { getGetShoppingListQueryKey, getListItemsQueryKey, getListReceiptsQueryKey, getGetSpendAnalyticsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
  };

  const processBase64 = async (base64: string) => {
    setScanning(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const url = `https://${domain}/api/receipts/parse-and-save`;

      const response = await expoFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      if (!response.ok) {
        throw new Error("Failed to process receipt");
      }

      const receipt = await response.json() as { id: number };
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
      router.replace(`/receipt/${receipt.id}`);
    } catch (err) {
      Alert.alert("Error", "Could not process the receipt. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || scanning) return;
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8 });
    if (photo?.base64) {
      await processBase64(photo.base64);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      await processBase64(result.assets[0].base64);
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
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + 12 }]}
          onPress={() => router.back()}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.permissionContent}>
          <View style={[styles.permissionIcon, { backgroundColor: colors.accent }]}>
            <Feather name="camera" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.permissionTitle, { color: colors.foreground }]}>Camera Access</Text>
          <Text style={[styles.permissionText, { color: colors.mutedForeground }]}>
            Allow camera access to photograph receipts for AI-powered data extraction
          </Text>
          <TouchableOpacity
            style={[styles.permissionBtn, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.permissionBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.galleryBtn, { borderColor: colors.border }]}
            onPress={handlePickImage}
          >
            <Feather name="image" size={18} color={colors.foreground} />
            <Text style={[styles.galleryBtnText, { color: colors.foreground }]}>
              Choose from Gallery
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // On web, no camera — use image picker only
  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + 12 }]}
          onPress={() => router.back()}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.permissionContent}>
          <View style={[styles.permissionIcon, { backgroundColor: colors.accent }]}>
            <Feather name="image" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.permissionTitle, { color: colors.foreground }]}>Upload Receipt</Text>
          <Text style={[styles.permissionText, { color: colors.mutedForeground }]}>
            Select a receipt photo from your device to extract items and prices with AI
          </Text>
          {scanning ? (
            <View style={styles.scanningContainer}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={[styles.scanningText, { color: colors.mutedForeground }]}>
                Analyzing receipt...
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.permissionBtn, { backgroundColor: colors.primary }]}
              onPress={handlePickImage}
            >
              <Text style={styles.permissionBtnText}>Choose Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

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

        {/* Viewfinder overlay */}
        <View style={styles.viewfinderContainer}>
          <View style={[styles.viewfinder, { borderColor: "rgba(255,255,255,0.6)" }]}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.viewfinderHint}>Align receipt within frame</Text>
        </View>

        {/* Bottom controls */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[styles.galleryCircleBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
            onPress={handlePickImage}
          >
            <Feather name="image" size={22} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureBtn, scanning && styles.captureBtnDisabled]}
            onPress={handleCapture}
            disabled={scanning}
            activeOpacity={0.8}
          >
            {scanning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.captureInner} />
            )}
          </TouchableOpacity>

          <View style={{ width: 52 }} />
        </View>
      </CameraView>

      {scanning && (
        <View style={styles.scanningOverlay}>
          <View style={styles.scanningCard}>
            <ActivityIndicator color="#0d9488" size="large" />
            <Text style={styles.scanningOverlayText}>Analyzing receipt with AI...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  backBtn: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  permissionContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  permissionIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  permissionTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  permissionText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  permissionBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 8,
  },
  permissionBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  galleryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
  },
  galleryBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
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
  viewfinderContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  viewfinder: {
    width: 280,
    height: 380,
    borderWidth: 1,
    borderRadius: 8,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#fff",
    borderWidth: 3,
  },
  cornerTL: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0, borderRadius: 4 },
  cornerTR: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0, borderRadius: 4 },
  cornerBL: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0, borderRadius: 4 },
  cornerBR: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0, borderRadius: 4 },
  viewfinderHint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingTop: 24,
  },
  galleryCircleBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  captureBtnDisabled: { opacity: 0.6 },
  captureInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#fff",
  },
  scanningContainer: { alignItems: "center", gap: 12 },
  scanningText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanningCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 16,
    minWidth: 220,
  },
  scanningOverlayText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#0f172a",
    textAlign: "center",
  },
});
