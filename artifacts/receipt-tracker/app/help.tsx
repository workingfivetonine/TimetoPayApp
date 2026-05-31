import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GUIDE_SECTIONS,
  GUIDE_ADMIN_SECTIONS,
  type GuideSectionContent,
} from "@workspace/guide-content";
import { useColors } from "@/hooks/useColors";
import { downloadGuidePdf } from "@/lib/guidePdf";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

interface GuideSection {
  icon: FeatherName;
  title: string;
  intro: string;
  steps: string[];
  image: ImageSourcePropType;
}

const SHOT_ASPECT = 402 / 860;

// Screenshots must be referenced with static `require()` literals so Metro can
// bundle them. The map keys mirror `imageFile` in `@workspace/guide-content`.
const GUIDE_IMAGES: Record<string, ImageSourcePropType> = {
  "sign-in.jpg": require("@/assets/images/guide/sign-in.jpg"),
  "receipts.jpg": require("@/assets/images/guide/receipts.jpg"),
  "receipt-detail.jpg": require("@/assets/images/guide/receipt-detail.jpg"),
  "scan.jpg": require("@/assets/images/guide/scan.jpg"),
  "review-receipt.jpg": require("@/assets/images/guide/review-receipt.jpg"),
  "manual-entry.jpg": require("@/assets/images/guide/manual-entry.jpg"),
  "quick-add.jpg": require("@/assets/images/guide/quick-add.jpg"),
  "stores.jpg": require("@/assets/images/guide/stores.jpg"),
  "store-detail.jpg": require("@/assets/images/guide/store-detail.jpg"),
  "item-detail.jpg": require("@/assets/images/guide/item-detail.jpg"),
  "shopping.jpg": require("@/assets/images/guide/shopping.jpg"),
  "analytics.jpg": require("@/assets/images/guide/analytics.jpg"),
  "catalog.jpg": require("@/assets/images/guide/catalog.jpg"),
  "account.jpg": require("@/assets/images/guide/account.jpg"),
  "admin-global.jpg": require("@/assets/images/guide/admin-global.jpg"),
  "admin-catalog.jpg": require("@/assets/images/guide/admin-catalog.jpg"),
};

function toSection(content: GuideSectionContent): GuideSection {
  return {
    icon: content.icon as FeatherName,
    title: content.title,
    intro: content.intro,
    steps: content.steps,
    image: GUIDE_IMAGES[content.imageFile],
  };
}

const SECTIONS: GuideSection[] = GUIDE_SECTIONS.map(toSection);

const ADMIN_SECTIONS: GuideSection[] = GUIDE_ADMIN_SECTIONS.map(toSection);

function GuideCard({ section, index }: { section: GuideSection; index: number }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
          <Feather name={section.icon} size={18} color={colors.primary} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{section.title}</Text>
      </View>

      <Text style={[styles.cardIntro, { color: colors.mutedForeground }]}>{section.intro}</Text>

      <View style={[styles.shotFrame, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Image source={section.image} style={styles.shot} resizeMode="contain" />
      </View>

      <View style={styles.steps}>
        {section.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.stepDot, { backgroundColor: colors.accent }]}>
              <Text style={[styles.stepNum, { color: colors.accentForeground }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: colors.foreground }]}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function HelpScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;
  const [downloading, setDownloading] = React.useState(false);

  const handleDownload = React.useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadGuidePdf();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not open the guide PDF. Please try again.";
      Alert.alert("Download failed", message);
    } finally {
      setDownloading(false);
    }
  }, [downloading]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>How-to Guide</Text>
        <TouchableOpacity
          onPress={handleDownload}
          style={styles.backBtn}
          hitSlop={8}
          disabled={downloading}
          accessibilityRole="button"
          accessibilityLabel="Download guide as PDF"
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <Feather name="download" size={22} color={colors.foreground} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.accent }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.card }]}>
            <Feather name="book-open" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.accentForeground }]}>
            Welcome to Receipt Tracker
          </Text>
          <Text style={[styles.heroSub, { color: colors.accentForeground }]}>
            Scan receipts, track prices over time, and let your shopping list build itself. Here's
            how every part works.
          </Text>
          <TouchableOpacity
            onPress={handleDownload}
            style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
            disabled={downloading}
            accessibilityRole="button"
            accessibilityLabel="Download guide as PDF"
          >
            {downloading ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="download" size={16} color={colors.primaryForeground} />
            )}
            <Text style={[styles.downloadBtnText, { color: colors.primaryForeground }]}>
              {downloading ? "Preparing PDF…" : "Download PDF"}
            </Text>
          </TouchableOpacity>
        </View>

        {SECTIONS.map((section, i) => (
          <GuideCard key={section.title} section={section} index={i} />
        ))}

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <View style={[styles.dividerBadge, { backgroundColor: colors.primary }]}>
            <Feather name="shield" size={13} color={colors.primaryForeground} />
            <Text style={[styles.dividerText, { color: colors.primaryForeground }]}>
              Admin only
            </Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <Text style={[styles.adminNote, { color: colors.mutedForeground }]}>
          These tools appear only for the account designated as admin.
        </Text>

        {ADMIN_SECTIONS.map((section, i) => (
          <GuideCard key={section.title} section={section} index={i} />
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 16, maxWidth: 620, width: "100%", alignSelf: "center" },
  hero: {
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: { fontSize: 19, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
    minWidth: 170,
  },
  downloadBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
  cardIntro: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 14 },
  shotFrame: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
    alignItems: "center",
    marginBottom: 14,
  },
  shot: {
    width: "100%",
    aspectRatio: SHOT_ASPECT,
    maxWidth: 300,
    borderRadius: 8,
  },
  steps: { gap: 10 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNum: { fontSize: 12, fontFamily: "Inter_700Bold" },
  stepText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dividerText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  adminNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: -4,
  },
});
