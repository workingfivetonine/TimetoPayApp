import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useWelcomeTour } from "@/hooks/useWelcomeTour";

type Step = {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: "smile",
    title: "Welcome to Receipt Tracker",
    body: "Keep every receipt in one place and turn your spending into useful insights. Here's a quick look at what you can do.",
  },
  {
    icon: "camera",
    title: "Scan in seconds",
    body: "Snap a photo or upload a PDF order confirmation. AI reads the store, items, and prices for you — no typing needed.",
  },
  {
    icon: "trending-up",
    title: "Track prices over time",
    body: "See how prices change and which store gives you the best deal on the things you buy most.",
  },
  {
    icon: "shopping-cart",
    title: "A smart shopping list",
    body: "Your regulars are added automatically, with the lowest price and best store shown next to each item.",
  },
];

/**
 * First-run feature tour. Shows once per account on a given device (tracked in
 * AsyncStorage), only after the user is loaded and onboarding (region) is done.
 * The final step prompts the user to upload their first receipt, with a manual
 * fallback. Renders nothing once seen/dismissed.
 */
export function WelcomeTour() {
  const colors = useColors();
  const router = useRouter();
  const { data: me } = useGetCurrentUser();
  const onboardingDone = !!me?.countryCode;
  const userKey = onboardingDone && me?.id != null ? String(me.id) : null;
  const { visible, dismiss } = useWelcomeTour(userKey);
  const [step, setStep] = useState(0);

  // Always start a fresh tour at the first slide. Resets if the tour re-shows
  // or a different user becomes active on the same mounted instance.
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible, userKey]);

  if (!visible) return null;

  const isLast = step >= STEPS.length;
  const totalDots = STEPS.length + 1; // feature steps + final CTA step

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const finish = (dest?: "/scan" | "/manual-entry") => {
    dismiss();
    if (dest) router.push(dest);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => finish()}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.skip}
            onPress={() => finish()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
              Skip
            </Text>
          </TouchableOpacity>

          <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
            <Feather
              name={isLast ? "upload" : STEPS[step].icon}
              size={34}
              color={colors.primary}
            />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            {isLast ? "Add your first receipt" : STEPS[step].title}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {isLast
              ? "You're all set! Upload a photo or PDF and let AI do the work — or add one by hand to start."
              : STEPS[step].body}
          </Text>

          <View style={styles.dots}>
            {Array.from({ length: totalDots }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === step ? colors.primary : colors.border,
                    width: i === step ? 18 : 6,
                  },
                ]}
              />
            ))}
          </View>

          {isLast ? (
            <View style={styles.ctaCol}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => finish("/scan")}
                activeOpacity={0.85}
              >
                <Feather name="upload" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Upload first receipt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => finish("/manual-entry")}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkBtnText, { color: colors.mutedForeground }]}>
                  Or enter one manually
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.navRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={goBack}
                disabled={step === 0}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.backBtnText,
                    { color: step === 0 ? "transparent" : colors.mutedForeground },
                  ]}
                >
                  Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={goNext}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Next</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  skip: {
    position: "absolute",
    top: 14,
    right: 16,
    padding: 4,
    zIndex: 2,
  },
  skipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 22,
    marginBottom: 22,
  },
  dot: { height: 6, borderRadius: 3 },
  ctaCol: { width: "100%", gap: 6 },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  nextBtn: { minWidth: 130 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkBtn: { alignItems: "center", paddingVertical: 12 },
  linkBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  backBtn: { paddingVertical: 15, paddingHorizontal: 8 },
  backBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
