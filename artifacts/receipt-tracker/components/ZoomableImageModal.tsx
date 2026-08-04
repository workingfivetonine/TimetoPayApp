import React from "react";
import { View, Modal, TouchableOpacity, StyleSheet, Text, Platform } from "react-native";
import { Image } from "expo-image";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

const MAX_SCALE = 6;
const MIN_SCALE = 1;

// Full-screen viewer for a receipt image, so fine print (prices, dates) can be
// checked against the parsed values. Pinch to zoom, drag to pan, double-tap to
// toggle between fit and 2.5x.
export function ZoomableImageModal({ visible, uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Snapping back to centre at fit-scale keeps the image from being left
      // stranded off-screen after a zoom-out.
      if (scale.value <= MIN_SCALE) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= MIN_SCALE) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > MIN_SCALE ? MIN_SCALE : 2.5;
      scale.value = withTiming(next);
      savedScale.value = next;
      if (next === MIN_SCALE) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible={visible && !!uri} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.imageWrap, animatedStyle]}>
            {uri ? (
              <Image source={{ uri }} style={styles.image} contentFit="contain" />
            ) : null}
          </Animated.View>
        </GestureDetector>

        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Close image"
        >
          <Feather name="x" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={[styles.hint, { bottom: insets.bottom + 20 }]}>
          {Platform.OS === "web" ? "Double-click to zoom" : "Pinch or double-tap to zoom"}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center" },
  imageWrap: { flex: 1 },
  image: { flex: 1, width: "100%" },
  closeBtn: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
