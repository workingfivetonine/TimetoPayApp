import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface ScanProgressValue {
  done: number;
  total: number;
}

interface Props {
  label: string;
  // Omit when there is genuinely nothing to count — a single file is one opaque
  // server call, and inventing a percentage for it would be a lie that stalls at
  // 90%. That case gets a moving bar with no number instead.
  progress?: ScanProgressValue | null;
}

const TRACK_HEIGHT = 6;

export function ScanProgress({ label, progress }: Props) {
  const colors = useColors();
  const determinate = !!progress && progress.total > 1;

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Determinate: width animates to the real fraction.
  const fill = useRef(new Animated.Value(0)).current;
  const fraction = determinate ? Math.min(1, progress!.done / progress!.total) : 0;
  useEffect(() => {
    if (!determinate) return;
    Animated.timing(fill, {
      toValue: fraction,
      duration: reduceMotion ? 0 : 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [fraction, determinate, fill, reduceMotion]);

  // Indeterminate: a band slides along the track. Purely "still working" —
  // it encodes no quantity.
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (determinate || reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: 1150,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [determinate, reduceMotion, slide]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>

      <View
        style={[styles.track, { backgroundColor: colors.secondary }]}
        accessibilityRole="progressbar"
        accessibilityValue={
          determinate
            ? { min: 0, max: progress!.total, now: progress!.done }
            : { text: "Working" }
        }
      >
        {determinate ? (
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: colors.primary,
                width: fill.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        ) : reduceMotion ? (
          // No animation allowed: a static partial bar still reads as "busy"
          // without moving.
          <View style={[styles.fill, { backgroundColor: colors.primary, width: "35%" }]} />
        ) : (
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: colors.primary,
                width: "35%",
                left: slide.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-35%", "100%"],
                }),
              },
            ]}
          />
        )}
      </View>

      {determinate ? (
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {progress!.done} of {progress!.total} done
        </Text>
      ) : (
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          Long receipts can take a moment
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center", gap: 12 },
  label: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 21,
  },
  track: {
    width: "100%",
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: "hidden",
    justifyContent: "center",
  },
  fill: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, position: "absolute" },
  count: { fontSize: 12.5, fontFamily: "Inter_400Regular", fontVariant: ["tabular-nums"] },
});
