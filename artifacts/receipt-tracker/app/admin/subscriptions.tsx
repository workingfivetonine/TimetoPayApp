import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAdminListSubscribers,
  type AdminSubscriber,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";

type Tone = "active" | "trial" | "warn" | "muted";

function statusInfo(s: AdminSubscriber["status"]): { label: string; tone: Tone } {
  switch (s) {
    case "active":
      return { label: "Active", tone: "active" };
    case "trialing":
      return { label: "Free trial", tone: "trial" };
    case "past_due":
      return { label: "Past due", tone: "warn" };
    case "canceled":
      return { label: "Canceled", tone: "warn" };
    case "comped":
      return { label: "Complimentary", tone: "active" };
    default:
      return { label: "No subscription", tone: "muted" };
  }
}

function typeLabel(sub: AdminSubscriber): string {
  if (sub.status === "comped") return "Comp";
  if (sub.provider === "stripe") return "Stripe";
  if (sub.provider === "paypal") return "PayPal";
  return "None";
}

function periodLabel(sub: AdminSubscriber): string | null {
  if (!sub.currentPeriodEnd) return null;
  const d = new Date(sub.currentPeriodEnd).toLocaleDateString();
  if (sub.status === "trialing") return `Trial ends ${d}`;
  if (sub.status === "active") return `Renews ${d}`;
  if (sub.status === "past_due" || sub.status === "canceled") return `Until ${d}`;
  return null;
}

export default function AdminSubscriptionsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: subscribers, isLoading, error } = useAdminListSubscribers();

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  const toneColor = (tone: Tone): { bg: string; fg: string } => {
    switch (tone) {
      case "active":
        return { bg: colors.primary, fg: colors.primaryForeground };
      case "trial":
        return { bg: colors.accent, fg: colors.accentForeground };
      case "warn":
        return { bg: colors.destructive, fg: "#ffffff" };
      default:
        return { bg: colors.muted, fg: colors.mutedForeground };
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Subscriptions</Text>
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState
            icon="alert-triangle"
            title="Unable to load subscribers"
            subtitle="You may not have admin access."
          />
        </View>
      ) : (
        <FlatList
          data={subscribers ?? []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="credit-card"
              title="No users yet"
              subtitle="Subscribers appear here once users sign up."
            />
          }
          renderItem={({ item }) => {
            const info = statusInfo(item.status);
            const tone = toneColor(info.tone);
            const period = periodLabel(item);
            return (
              <View
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.cardTop}>
                  <Text
                    style={[styles.email, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {item.email ?? "(no email)"}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.badgeText, { color: tone.fg }]}>{info.label}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.meta}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Type</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]}>
                      {typeLabel(item)}
                    </Text>
                  </View>
                  {period ? (
                    <View style={styles.meta}>
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>
                        Period
                      </Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]}>{period}</Text>
                    </View>
                  ) : null}
                  <View style={styles.meta}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Access</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]}>
                      {item.entitled ? "Yes" : "No"}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
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
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  email: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  metaRow: { flexDirection: "row", marginTop: 14, gap: 28 },
  meta: {},
  metaLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 2 },
});
