import { useClerk, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetCurrentUserQueryKey,
  getGetMyNotificationPreferencesQueryKey,
  useGetCurrentUser,
  useGetMyNotificationPreferences,
  useManageBillingSubscription,
  useStartFreeTrial,
  useUpdateMyNotificationPreferences,
  type NotificationPreferences,
} from "@workspace/api-client-react";
import { countryName, usStateName } from "@workspace/geo";
import { useColors } from "@/hooks/useColors";
import { ShareInvite } from "@/components/ShareInvite";

type EntitlementStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "comped"
  | "none";

function subscriptionLabel(
  status: EntitlementStatus | undefined,
  currentPeriodEnd: string | null | undefined,
): string {
  const end = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString()
    : null;
  switch (status) {
    case "trialing":
      return end ? `Free trial · ends ${end}` : "Free trial";
    case "active":
      return end ? `Active · renews ${end}` : "Active";
    case "past_due":
      return "Payment past due";
    case "comped":
      return "Complimentary access";
    case "canceled":
      return "Canceled";
    default:
      return "No subscription";
  }
}

export default function AccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: me, isLoading } = useGetCurrentUser();
  const manage = useManageBillingSubscription();
  const startTrial = useStartFreeTrial();
  const [trialError, setTrialError] = React.useState<string | null>(null);

  const entitlement = me?.entitlement ?? null;
  // Email reminders only go to subscription-related users (entitled, or past_due),
  // so only surface the toggles to them.
  const showNotifications =
    !!entitlement && (entitlement.entitled || entitlement.status === "past_due");
  const isWeb = Platform.OS === "web";
  // Only show the billing UI to web users with a real provider subscription
  // (native is never paywalled; admins/comped users have no provider record).
  const hasProviderSub =
    entitlement?.provider === "stripe" || entitlement?.provider === "paypal";
  // Offer the Start-trial / Subscribe actions whenever the user has no
  // provider-backed subscription and isn't comped or already active (admins).
  const showSubActions =
    !!entitlement &&
    !hasProviderSub &&
    entitlement.status !== "comped" &&
    entitlement.status !== "active";

  const handleStartTrial = () => {
    setTrialError(null);
    startTrial.mutate(undefined, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      },
      onError: () => setTrialError("Couldn't start your free trial. Please try again."),
    });
  };

  const handleManage = () => {
    manage.mutate(
      undefined,
      {
        onSuccess: (res) => {
          if (res.url) {
            if (Platform.OS === "web") {
              window.location.assign(res.url);
            } else {
              void Linking.openURL(res.url);
            }
          }
        },
        onError: () => {
          Alert.alert("Error", "Couldn't open subscription management. Please try again.");
        },
      },
    );
  };

  const email =
    me?.email ?? user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? "—";

  const country = countryName(me?.countryCode);
  const state = usStateName(me?.stateCode);
  const regionLabel = country
    ? state
      ? `${state}, ${country}`
      : country
    : "Not set";

  const handleSignOut = async () => {
    const doSignOut = async () => {
      await signOut();
      queryClient.clear();
      router.replace("/(auth)/sign-in");
    };
    if (Platform.OS === "web") {
      await doSignOut();
    } else {
      Alert.alert("Sign out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: doSignOut },
      ]);
    }
  };

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Account</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Feather name="user" size={26} color={colors.primary} />
          </View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Signed in as</Text>
          <Text style={[styles.email, { color: colors.foreground }]}>{email}</Text>
          {me?.isAdmin ? (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <Feather name="shield" size={13} color={colors.accentForeground} />
              <Text style={[styles.badgeText, { color: colors.accentForeground }]}>Admin</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/region-setup")}
          activeOpacity={0.7}
        >
          <Feather name="map-pin" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowText, { color: colors.foreground }]}>Region</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              {regionLabel}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/help")}
          activeOpacity={0.7}
        >
          <Feather name="book-open" size={18} color={colors.primary} />
          <Text style={[styles.rowText, { color: colors.foreground }]}>How-to guide</Text>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {isWeb && entitlement ? (
          <View style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.subHeader}>
              <Feather name="credit-card" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.foreground }]}>Subscription</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  {subscriptionLabel(entitlement.status as EntitlementStatus, entitlement.currentPeriodEnd)}
                </Text>
              </View>
              {hasProviderSub ? (
                <TouchableOpacity
                  onPress={handleManage}
                  disabled={manage.isPending}
                  style={[styles.manageBtn, { backgroundColor: colors.accent }]}
                  activeOpacity={0.8}
                >
                  {manage.isPending ? (
                    <ActivityIndicator size="small" color={colors.accentForeground} />
                  ) : (
                    <Text style={[styles.manageBtnText, { color: colors.accentForeground }]}>
                      Manage
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            {showSubActions ? (
              <View style={styles.subActions}>
                {entitlement.canStartTrial ? (
                  <TouchableOpacity
                    onPress={handleStartTrial}
                    disabled={startTrial.isPending}
                    style={[styles.subActionBtn, { backgroundColor: colors.primary }]}
                    activeOpacity={0.85}
                  >
                    {startTrial.isPending ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text style={[styles.subActionText, { color: colors.primaryForeground }]}>
                        Start free trial
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => router.push("/paywall")}
                  style={[
                    styles.subActionBtn,
                    entitlement.canStartTrial
                      ? { borderWidth: 1.5, borderColor: colors.primary }
                      : { backgroundColor: colors.primary },
                  ]}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.subActionText,
                      { color: entitlement.canStartTrial ? colors.primary : colors.primaryForeground },
                    ]}
                  >
                    {entitlement.status === "trialing" ? "Subscribe now" : "Subscribe"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {trialError ? (
              <Text style={[styles.subError, { color: colors.destructive }]}>{trialError}</Text>
            ) : null}
          </View>
        ) : null}

        {showNotifications ? <NotificationsSection /> : null}

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : me?.isAdmin ? (
          <>
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/admin")}
              activeOpacity={0.7}
            >
              <Feather name="users" size={18} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.foreground }]}>Admin: all users</Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/admin/subscriptions")}
              activeOpacity={0.7}
            >
              <Feather name="credit-card" size={18} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.foreground }]}>Subscriptions</Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/admin/global")}
              activeOpacity={0.7}
            >
              <Feather name="tag" size={18} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.foreground }]}>Global prices</Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/admin/catalog")}
              activeOpacity={0.7}
            >
              <Feather name="layers" size={18} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.foreground }]}>Manage catalog</Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </>
        ) : null}

        <ShareInvite />

        <TouchableOpacity
          style={[styles.signOut, { borderColor: colors.destructive }]}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={18} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const NOTIFICATION_TOGGLES: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  {
    key: "notifyPaymentReminders",
    label: "Payment reminders",
    description: "Trial ending soon and payment-past-due alerts",
    icon: "credit-card",
  },
  {
    key: "notifyListExport",
    label: "Grocery list nudge",
    description: "A weekly reminder to export your shopping list",
    icon: "list",
  },
  {
    key: "notifyReceiptReminders",
    label: "Receipt reminders",
    description: "A nudge when you haven't scanned in a while",
    icon: "camera",
  },
  {
    key: "notifySpendSummary",
    label: "Spend summaries",
    description: "Weekly and monthly recaps of what you spent",
    icon: "bar-chart-2",
  },
];

function NotificationsSection() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: prefs } = useGetMyNotificationPreferences();
  const update = useUpdateMyNotificationPreferences();
  // Optimistic local copy so toggles feel instant.
  const [local, setLocal] = React.useState<NotificationPreferences | null>(null);

  React.useEffect(() => {
    if (prefs) setLocal(prefs);
  }, [prefs]);

  const current = local ?? prefs ?? null;

  const toggle = (key: keyof NotificationPreferences) => {
    if (!current) return;
    const next = { ...current, [key]: !current[key] };
    setLocal(next);
    update.mutate(
      { data: { [key]: next[key] } },
      {
        onSuccess: (saved) => {
          setLocal(saved);
          void queryClient.invalidateQueries({
            queryKey: getGetMyNotificationPreferencesQueryKey(),
          });
        },
        onError: () => {
          // Revert on failure.
          setLocal(current);
        },
      },
    );
  };

  return (
    <View style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.notifHeader}>
        <Feather name="bell" size={18} color={colors.primary} />
        <Text style={[styles.rowText, { color: colors.foreground }]}>Email reminders</Text>
      </View>
      {NOTIFICATION_TOGGLES.map((t, idx) => (
        <View
          key={t.key}
          style={[
            styles.notifRow,
            idx < NOTIFICATION_TOGGLES.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Feather name={t.icon} size={16} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.notifLabel, { color: colors.foreground }]}>{t.label}</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{t.description}</Text>
          </View>
          <Switch
            value={current ? current[t.key] : true}
            onValueChange={() => toggle(t.key)}
            disabled={!current}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#ffffff"
          />
        </View>
      ))}
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
  content: { padding: 20, gap: 14, maxWidth: 560, width: "100%", alignSelf: "center" },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  email: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 14,
  },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  manageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 76,
  },
  manageBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  subCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  subHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  notifCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  notifHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  notifLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  subActions: { gap: 10 },
  subActionBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  subActionText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  subError: { fontSize: 13, fontFamily: "Inter_500Medium" },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  signOutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
