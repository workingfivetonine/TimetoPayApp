import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
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
import { useColors } from "@/hooks/useColors";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

interface GuideSection {
  icon: FeatherName;
  title: string;
  intro: string;
  steps: string[];
  image: ImageSourcePropType;
}

const SHOT_ASPECT = 402 / 860;

const SECTIONS: GuideSection[] = [
  {
    icon: "log-in",
    title: "Signing in",
    intro:
      "Receipt Tracker keeps each person's data private, so you start by signing in. Your receipts, stores, and prices are only ever visible to your own account.",
    steps: [
      "Enter your email and password, then tap Sign in.",
      "New here? Tap Sign up to create an account in a few seconds.",
      "You can sign out any time from the Account screen to switch accounts.",
    ],
    image: require("@/assets/images/guide/sign-in.jpg"),
  },
  {
    icon: "file-text",
    title: "Your receipts",
    intro:
      "The Receipts tab is your home base — every receipt you scan or enter shows up here, newest first, with the store and total.",
    steps: [
      "Tap any receipt to open it and see the individual line items.",
      "The total on the right is calculated from the items on that receipt.",
      "Use the trash icon to remove a receipt you no longer need.",
    ],
    image: require("@/assets/images/guide/receipts.jpg"),
  },
  {
    icon: "list",
    title: "Receipt details",
    intro:
      "Open a receipt to review what was bought. This is where you fix anything the scanner misread.",
    steps: [
      "Tap the pencil on a line to edit its name or price.",
      "Tap the × to delete a single item from the receipt.",
      "Each item carries an emoji and feeds your price history automatically.",
    ],
    image: require("@/assets/images/guide/receipt-detail.jpg"),
  },
  {
    icon: "camera",
    title: "Adding a receipt",
    intro:
      "Tap Scan (or Add Receipt) to capture a new purchase. AI reads the store, items, and prices for you.",
    steps: [
      "Choose Photo to snap or upload a paper receipt — the AI extracts everything.",
      "Upload PDF works best for online order confirmations.",
      "Prefer to type? Use Enter Manually for a full receipt or Log Items for a quick list.",
    ],
    image: require("@/assets/images/guide/scan.jpg"),
  },
  {
    icon: "check-circle",
    title: "Review & save a scan",
    intro:
      "After the AI reads a photo or PDF, you land on the Review screen to confirm everything before it's saved. Anything the AI wasn't sure about is highlighted in amber.",
    steps: [
      "Check the store, date, and total at the top, then fix any highlighted fields.",
      "Edit item names, prices, and quantities; remove a line with the trash icon or add one with Add Item.",
      "Tap Confirm & Save to file the receipt and update your prices and shopping list.",
    ],
    image: require("@/assets/images/guide/review-receipt.jpg"),
  },
  {
    icon: "edit-3",
    title: "Enter a receipt manually",
    intro:
      "No photo? Choose Enter Manually to type a full receipt yourself — handy for cash purchases or older receipts.",
    steps: [
      "Fill in the store details and the receipt date, time, and totals.",
      "Add each item with its name, price, and quantity using Add Item.",
      "Tap Save to file it just like a scanned receipt.",
    ],
    image: require("@/assets/images/guide/manual-entry.jpg"),
  },
  {
    icon: "plus-square",
    title: "Quickly log items",
    intro:
      "Log Items is the fastest way to jot down a few things — just a store, a date, and a short list. The total adds itself up as you go.",
    steps: [
      "Start typing a store name and pick from the suggestions, or enter a new one.",
      "Add each item with its price and quantity; the running total updates live.",
      "Tap Save to turn the list into a receipt.",
    ],
    image: require("@/assets/images/guide/quick-add.jpg"),
  },
  {
    icon: "shopping-bag",
    title: "Stores",
    intro:
      "The Stores tab keeps the places you shop, along with delivery fees and minimum-order details.",
    steps: [
      "Tap + to add a store, or the pencil to edit one.",
      "Record delivery fee and minimum order to power the cost-benefit analysis.",
      "Tap a store card to open its detail screen.",
    ],
    image: require("@/assets/images/guide/stores.jpg"),
  },
  {
    icon: "truck",
    title: "Store cost-benefit",
    intro:
      "Each store's detail screen shows how much you spend there and whether delivery is worth it.",
    steps: [
      "See total spent, average receipt, and number of visits at a glance.",
      "The delivery box tells you what percentage the fee adds to a typical order.",
      "Browse every item you've ever bought at that store.",
    ],
    image: require("@/assets/images/guide/store-detail.jpg"),
  },
  {
    icon: "trending-up",
    title: "Item price history",
    intro:
      "Tap any item to track its price over time and see which store gave you the best deal.",
    steps: [
      "Lowest, average, and highest prices are summarized up top.",
      "The price trend chart plots every purchase you've logged.",
      "Tap the emoji to change it, or use Delete Item to remove it everywhere.",
    ],
    image: require("@/assets/images/guide/item-detail.jpg"),
  },
  {
    icon: "check-square",
    title: "Shopping list",
    intro:
      "Your list builds itself from what you buy. Regulars are things you've purchased 2+ times; One-offs are the rest.",
    steps: [
      "Each item shows its lowest price, the best store, and how much you save.",
      "Mark something Ran Out to bump it back to the top of your list.",
      "Use the download button in the header to export a printable PDF grouped by store.",
    ],
    image: require("@/assets/images/guide/shopping.jpg"),
  },
  {
    icon: "bar-chart-2",
    title: "Spending analytics",
    intro:
      "The Analytics tab turns your receipts into spending insights so you can spot trends.",
    steps: [
      "The calendar heatmap shades each day by how much you spent.",
      "Switch to Weekly to see spend per week with high/low flags.",
      "The Items view breaks down price history item by item.",
    ],
    image: require("@/assets/images/guide/analytics.jpg"),
  },
  {
    icon: "grid",
    title: "Browse catalog",
    intro:
      "Open Browse Catalog from the Shopping List header to see prices seen across everyone's receipts, grouped by category.",
    steps: [
      "Tap the + (check) button to add any item to your own shopping list.",
      "Items already on your list appear checked.",
      "Prices reflect the most recent sighting across all shoppers — no names attached.",
    ],
    image: require("@/assets/images/guide/catalog.jpg"),
  },
  {
    icon: "user",
    title: "Your account",
    intro:
      "The Account screen shows who you're signed in as and lets you sign out. Admins see extra tools here.",
    steps: [
      "Confirm the email tied to your data.",
      "Sign out to switch accounts — your data stays private to you.",
      "Admin tools, when available, appear as rows above Sign out.",
    ],
    image: require("@/assets/images/guide/account.jpg"),
  },
];

const ADMIN_SECTIONS: GuideSection[] = [
  {
    icon: "tag",
    title: "Global prices",
    intro:
      "Admins get a read-only, cross-user view of the most recent price for every item — overall and per store.",
    steps: [
      "Tap a card to expand per-store prices, with the lowest highlighted.",
      "Data is aggregated across all users without exposing who bought what.",
      "Use it to keep the shared catalog's prices realistic.",
    ],
    image: require("@/assets/images/guide/admin-global.jpg"),
  },
  {
    icon: "layers",
    title: "Manage catalog",
    intro:
      "The catalog tool lets admins tidy up spelling variants of item and store names into clean, canonical entries.",
    steps: [
      "Merge, rename, or split entries from the Items and Stores tabs.",
      "Auto-suggested merges surface near-duplicate names for one-tap cleanup.",
      "This only touches the shared catalog — it never edits anyone's private rows.",
    ],
    image: require("@/assets/images/guide/admin-catalog.jpg"),
  },
];

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>How-to Guide</Text>
        <View style={styles.backBtn} />
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
