import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { fetch as expoFetch } from "expo/fetch";
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface Props {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  onConfirm: (base64: string) => void;
  onCancel: () => void;
}

const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;
const HANDLE = 24; // touch target size
const MIN_CROP = 60;

function computeDisplay(
  imgW: number,
  imgH: number,
  availW: number,
  availH: number
) {
  const scale = Math.min(availW / imgW, availH / imgH);
  return { dW: imgW * scale, dH: imgH * scale };
}

export default function ImageEditor({
  uri,
  imageWidth,
  imageHeight,
  onConfirm,
  onCancel,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);

  // Track current image state in a ref (avoids stale closures in async handlers)
  const imgRef = useRef({ uri, w: imageWidth, h: imageHeight });

  const HEADER_H = 56 + insets.top;
  const TOOLBAR_H = 88 + insets.bottom;
  const availW = SCREEN_W;
  const availH = SCREEN_H - HEADER_H - TOOLBAR_H - 16;

  // Display dimensions
  const { dW: initDW, dH: initDH } = computeDisplay(
    imageWidth,
    imageHeight,
    availW,
    availH
  );

  // Keep display dims as shared values so gesture worklets see updates after rotation
  const sharedDW = useSharedValue(initDW);
  const sharedDH = useSharedValue(initDH);

  // Displayed image URI as state (triggers re-render on rotation)
  const [displayUri, setDisplayUri] = useState(uri);
  const [displayDims, setDisplayDims] = useState({ w: initDW, h: initDH });

  // Crop edges in display pixels
  const cropL = useSharedValue(0);
  const cropT = useSharedValue(0);
  const cropR = useSharedValue(initDW);
  const cropB = useSharedValue(initDH);

  // Per-gesture start snapshots
  const sL = useSharedValue(0);
  const sT = useSharedValue(0);
  const sR = useSharedValue(initDW);
  const sB = useSharedValue(initDH);

  // ─── Corner gesture factories ──────────────────────────────────────────────

  const tlGesture = Gesture.Pan()
    .onBegin(() => {
      sL.value = cropL.value;
      sT.value = cropT.value;
    })
    .onUpdate((e) => {
      cropL.value = Math.max(
        0,
        Math.min(sL.value + e.translationX, cropR.value - MIN_CROP)
      );
      cropT.value = Math.max(
        0,
        Math.min(sT.value + e.translationY, cropB.value - MIN_CROP)
      );
    });

  const trGesture = Gesture.Pan()
    .onBegin(() => {
      sR.value = cropR.value;
      sT.value = cropT.value;
    })
    .onUpdate((e) => {
      cropR.value = Math.max(
        cropL.value + MIN_CROP,
        Math.min(sR.value + e.translationX, sharedDW.value)
      );
      cropT.value = Math.max(
        0,
        Math.min(sT.value + e.translationY, cropB.value - MIN_CROP)
      );
    });

  const blGesture = Gesture.Pan()
    .onBegin(() => {
      sL.value = cropL.value;
      sB.value = cropB.value;
    })
    .onUpdate((e) => {
      cropL.value = Math.max(
        0,
        Math.min(sL.value + e.translationX, cropR.value - MIN_CROP)
      );
      cropB.value = Math.max(
        cropT.value + MIN_CROP,
        Math.min(sB.value + e.translationY, sharedDH.value)
      );
    });

  const brGesture = Gesture.Pan()
    .onBegin(() => {
      sR.value = cropR.value;
      sB.value = cropB.value;
    })
    .onUpdate((e) => {
      cropR.value = Math.max(
        cropL.value + MIN_CROP,
        Math.min(sR.value + e.translationX, sharedDW.value)
      );
      cropB.value = Math.max(
        cropT.value + MIN_CROP,
        Math.min(sB.value + e.translationY, sharedDH.value)
      );
    });

  // ─── Animated overlay styles ───────────────────────────────────────────────

  const overlayTop = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: cropT.value,
  }));
  const overlayBottom = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    right: 0,
    top: cropB.value,
    bottom: 0,
  }));
  const overlayLeft = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    width: cropL.value,
    top: cropT.value,
    height: cropB.value - cropT.value,
  }));
  const overlayRight = useAnimatedStyle(() => ({
    position: "absolute",
    left: cropR.value,
    right: 0,
    top: cropT.value,
    height: cropB.value - cropT.value,
  }));

  const cropBorderStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: cropL.value,
    top: cropT.value,
    width: cropR.value - cropL.value,
    height: cropB.value - cropT.value,
  }));

  // Rule-of-thirds grid lines
  const gridV1 = useAnimatedStyle(() => ({
    position: "absolute",
    left: cropL.value + (cropR.value - cropL.value) / 3,
    top: cropT.value,
    width: 1,
    height: cropB.value - cropT.value,
  }));
  const gridV2 = useAnimatedStyle(() => ({
    position: "absolute",
    left: cropL.value + ((cropR.value - cropL.value) * 2) / 3,
    top: cropT.value,
    width: 1,
    height: cropB.value - cropT.value,
  }));
  const gridH1 = useAnimatedStyle(() => ({
    position: "absolute",
    top: cropT.value + (cropB.value - cropT.value) / 3,
    left: cropL.value,
    height: 1,
    width: cropR.value - cropL.value,
  }));
  const gridH2 = useAnimatedStyle(() => ({
    position: "absolute",
    top: cropT.value + ((cropB.value - cropT.value) * 2) / 3,
    left: cropL.value,
    height: 1,
    width: cropR.value - cropL.value,
  }));

  // Corner handle positions
  const tlPos = useAnimatedStyle(() => ({
    position: "absolute",
    left: cropL.value - HANDLE / 2,
    top: cropT.value - HANDLE / 2,
    width: HANDLE,
    height: HANDLE,
  }));
  const trPos = useAnimatedStyle(() => ({
    position: "absolute",
    left: cropR.value - HANDLE / 2,
    top: cropT.value - HANDLE / 2,
    width: HANDLE,
    height: HANDLE,
  }));
  const blPos = useAnimatedStyle(() => ({
    position: "absolute",
    left: cropL.value - HANDLE / 2,
    top: cropB.value - HANDLE / 2,
    width: HANDLE,
    height: HANDLE,
  }));
  const brPos = useAnimatedStyle(() => ({
    position: "absolute",
    left: cropR.value - HANDLE / 2,
    top: cropB.value - HANDLE / 2,
    width: HANDLE,
    height: HANDLE,
  }));

  // ─── Actions ───────────────────────────────────────────────────────────────

  const resetCrop = (newDW: number, newDH: number) => {
    cropL.value = 0;
    cropT.value = 0;
    cropR.value = newDW;
    cropB.value = newDH;
    sharedDW.value = newDW;
    sharedDH.value = newDH;
  };

  const [autoFraming, setAutoFraming] = useState(false);

  const handleAutoFrame = async () => {
    setAutoFraming(true);
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const token = await getToken();
      const response = await expoFetch(
        `https://${domain}/api/receipts/detect-bounds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ imageBase64: imgRef.current.uri.startsWith("data:")
            ? imgRef.current.uri.split(",")[1]
            : await uriToBase64(imgRef.current.uri)
          }),
        }
      );
      if (!response.ok) throw new Error("detect-bounds failed");
      const bounds = (await response.json()) as {
        x: number; y: number; width: number; height: number;
      };

      const dW = sharedDW.value;
      const dH = sharedDH.value;

      // Animate crop rectangle to detected receipt bounds
      const TIMING = { duration: 350 };
      cropL.value = withTiming(bounds.x * dW, TIMING);
      cropT.value = withTiming(bounds.y * dH, TIMING);
      cropR.value = withTiming((bounds.x + bounds.width) * dW, TIMING);
      cropB.value = withTiming((bounds.y + bounds.height) * dH, TIMING);
    } catch {
      // Silently ignore — user can crop manually
    } finally {
      setAutoFraming(false);
    }
  };

  const handleRotate = async (degrees: number) => {
    setLoading(true);
    try {
      const result = await manipulateAsync(
        imgRef.current.uri,
        [{ rotate: degrees }],
        { format: SaveFormat.JPEG }
      );
      // After ±90° rotation, width and height swap
      const newW = imgRef.current.h;
      const newH = imgRef.current.w;
      imgRef.current = { uri: result.uri, w: newW, h: newH };

      const { dW, dH } = computeDisplay(newW, newH, availW, availH);
      resetCrop(dW, dH);
      setDisplayUri(result.uri);
      setDisplayDims({ w: dW, h: dH });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { w: curImgW, h: curImgH, uri: curUri } = imgRef.current;
      const { w: curDW, h: curDH } = displayDims;

      const scaleX = curImgW / curDW;
      const scaleY = curImgH / curDH;

      const originX = Math.max(0, Math.round(cropL.value * scaleX));
      const originY = Math.max(0, Math.round(cropT.value * scaleY));
      const cropWidth = Math.min(
        Math.round((cropR.value - cropL.value) * scaleX),
        curImgW - originX
      );
      const cropHeight = Math.min(
        Math.round((cropB.value - cropT.value) * scaleY),
        curImgH - originY
      );

      const isFullImage =
        originX <= 2 &&
        originY <= 2 &&
        Math.abs(cropWidth - curImgW) <= 4 &&
        Math.abs(cropHeight - curImgH) <= 4;

      const finalWidth = isFullImage ? curImgW : cropWidth;
      const finalHeight = isFullImage ? curImgH : cropHeight;
      const actions: Parameters<typeof manipulateAsync>[1] = isFullImage
        ? []
        : [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }];
      // Cap the longest edge so large HDR phone photos upload quickly while
      // keeping enough detail for OCR. Receipts are usually portrait, so resize
      // by whichever dimension is dominant rather than width alone.
      if (Math.max(finalWidth, finalHeight) > 2000) {
        actions.push(
          finalWidth >= finalHeight
            ? { resize: { width: 2000 } }
            : { resize: { height: 2000 } }
        );
      }

      const result = await manipulateAsync(curUri, actions, {
        format: SaveFormat.JPEG,
        compress: 0.7,
        base64: true,
      });

      onConfirm(result.base64!);
    } catch {
      setLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const OVERLAY_COLOR = "rgba(0,0,0,0.55)";

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, backgroundColor: "#000" },
        ]}
      >
        <TouchableOpacity
          onPress={onCancel}
          disabled={loading}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="x" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Photo</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Image + crop overlay */}
      <View style={styles.imageArea} pointerEvents={loading ? "none" : "auto"}>
        <View style={{ width: displayDims.w, height: displayDims.h }}>
          <Image
            source={{ uri: displayUri }}
            style={{ width: displayDims.w, height: displayDims.h }}
            contentFit="contain"
          />

          {/* Dark overlays */}
          <Animated.View
            style={[overlayTop, { backgroundColor: OVERLAY_COLOR }]}
            pointerEvents="none"
          />
          <Animated.View
            style={[overlayBottom, { backgroundColor: OVERLAY_COLOR }]}
            pointerEvents="none"
          />
          <Animated.View
            style={[overlayLeft, { backgroundColor: OVERLAY_COLOR }]}
            pointerEvents="none"
          />
          <Animated.View
            style={[overlayRight, { backgroundColor: OVERLAY_COLOR }]}
            pointerEvents="none"
          />

          {/* Crop border */}
          <Animated.View
            style={[
              cropBorderStyle,
              { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.9)" },
            ]}
            pointerEvents="none"
          />

          {/* Rule-of-thirds grid */}
          <Animated.View
            style={[gridV1, { backgroundColor: "rgba(255,255,255,0.25)" }]}
            pointerEvents="none"
          />
          <Animated.View
            style={[gridV2, { backgroundColor: "rgba(255,255,255,0.25)" }]}
            pointerEvents="none"
          />
          <Animated.View
            style={[gridH1, { backgroundColor: "rgba(255,255,255,0.25)" }]}
            pointerEvents="none"
          />
          <Animated.View
            style={[gridH2, { backgroundColor: "rgba(255,255,255,0.25)" }]}
            pointerEvents="none"
          />

          {/* Corner handles */}
          <GestureDetector gesture={tlGesture}>
            <Animated.View style={[styles.handle, tlPos]}>
              <CornerMark corner="tl" />
            </Animated.View>
          </GestureDetector>
          <GestureDetector gesture={trGesture}>
            <Animated.View style={[styles.handle, trPos]}>
              <CornerMark corner="tr" />
            </Animated.View>
          </GestureDetector>
          <GestureDetector gesture={blGesture}>
            <Animated.View style={[styles.handle, blPos]}>
              <CornerMark corner="bl" />
            </Animated.View>
          </GestureDetector>
          <GestureDetector gesture={brGesture}>
            <Animated.View style={[styles.handle, brPos]}>
              <CornerMark corner="br" />
            </Animated.View>
          </GestureDetector>
        </View>
      </View>

      {/* Toolbar */}
      <View
        style={[
          styles.toolbar,
          { paddingBottom: insets.bottom + 16, backgroundColor: "#000" },
        ]}
      >
        {/* Row 1: rotate + auto-frame */}
        <View style={styles.toolRow}>
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => handleRotate(-90)}
            disabled={loading || autoFraming}
          >
            <Feather name="rotate-ccw" size={22} color="#fff" />
            <Text style={styles.toolBtnLabel}>Rotate Left</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.autoFrameBtn, autoFraming && { opacity: 0.7 }]}
            onPress={handleAutoFrame}
            disabled={loading || autoFraming}
          >
            {autoFraming ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Feather name="crop" size={22} color={colors.primary} />
            )}
            <Text style={[styles.toolBtnLabel, { color: colors.primary }]}>
              {autoFraming ? "Detecting…" : "Auto Frame"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => handleRotate(90)}
            disabled={loading || autoFraming}
          >
            <Feather name="rotate-cw" size={22} color="#fff" />
            <Text style={styles.toolBtnLabel}>Rotate Right</Text>
          </TouchableOpacity>
        </View>

        {/* Row 2: confirm */}
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            { backgroundColor: colors.primary },
            (loading || autoFraming) && { opacity: 0.7 },
          ]}
          onPress={handleConfirm}
          disabled={loading || autoFraming}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="check" size={20} color="#fff" />
              <Text style={styles.confirmBtnLabel}>Use Photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Convert a file URI to a base64 string (without data URL prefix)
async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(((reader.result as string) ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

// L-shaped corner marks (3px thick, 14px arms)
function CornerMark({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  const top = corner === "tl" || corner === "tr";
  const left = corner === "tl" || corner === "bl";
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Horizontal arm */}
      <View
        style={{
          position: "absolute",
          [top ? "top" : "bottom"]: HANDLE / 2 - 1.5,
          [left ? "left" : "right"]: HANDLE / 2 - 1.5,
          width: 14,
          height: 3,
          backgroundColor: "#fff",
          borderRadius: 1.5,
        }}
      />
      {/* Vertical arm */}
      <View
        style={{
          position: "absolute",
          [top ? "top" : "bottom"]: HANDLE / 2 - 1.5,
          [left ? "left" : "right"]: HANDLE / 2 - 1.5,
          width: 3,
          height: 14,
          backgroundColor: "#fff",
          borderRadius: 1.5,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    height: undefined,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  imageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  handle: {
    // position set by animated style
  },
  toolbar: {
    flexDirection: "column",
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 10,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolBtn: {
    alignItems: "center",
    gap: 4,
    minWidth: 72,
  },
  toolBtnLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
  },
  autoFrameBtn: {
    alignItems: "center",
    gap: 4,
    minWidth: 80,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    maxWidth: 200,
  },
  confirmBtnLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
