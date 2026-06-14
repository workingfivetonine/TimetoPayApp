import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
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
import { getApiOrigin } from "@/lib/apiBase";
import { ShareInvite } from "@/components/ShareInvite";
import { InstallAppButton } from "@/components/InstallAppButton";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { notify, confirmAction } from "@/lib/confirm";
import { showSuccessToast } from "@/lib/toast";

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
  const { getToken } = useAuth();
  const { data: me, isLoading, dataUpdatedAt } = useGetCurrentUser();
  const isOnline = useOnlineStatus();
  const manage = useManageBillingSubscription();
  const startTrial = useStartFreeTrial();
  const [trialError, setTrialError] = React.useState<string | null>(null);
  const [showSupport, setShowSupport] = React.useState(false);

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
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to start your trial.");
      return;
    }
    confirmAction({
      title: "Start your 30-day free trial?",
      message:
        "You'll get full premium access for 30 days. No charge now, and you can subscribe anytime. This one-time trial can't be restarted later.",
      confirmLabel: "Start free trial",
      onConfirm: () => {
        setTrialError(null);
        startTrial.mutate(undefined, {
          onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
            showSuccessToast("Welcome to your free trial!", "30 days of full premium access");
          },
          onError: () => setTrialError("Couldn't start your free trial. Please try again."),
        });
      },
    });
  };

  const handleManage = () => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to manage your subscription.");
      return;
    }
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

  const handleSubscribe = () => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to subscribe.");
      return;
    }
    router.push("/paywall");
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

      <OfflineBanner lastUpdated={dataUpdatedAt} />

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
                  onPress={handleSubscribe}
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
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/admin/board")}
              activeOpacity={0.7}
            >
              <Feather name="message-square" size={18} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.foreground }]}>Board moderation</Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowSupport(true)}
          activeOpacity={0.7}
        >
          <Feather name="mail" size={18} color={colors.primary} />
          <Text style={[styles.rowText, { color: colors.foreground }]}>Contact Support</Text>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        <SupportModal
          visible={showSupport}
          onClose={() => setShowSupport(false)}
          getToken={getToken}
          colors={colors}
        />

        <InstallAppButton />

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
  frequencyKey?: string;
}[] = [
  {
    key: "notifyPaymentReminders",
    label: "Payment reminders",
    description: "Trial ending soon and payment-past-due alerts",
    icon: "credit-card",
    // No frequency setting — billing alerts fire on events, not a schedule
  },
  {
    key: "notifyListExport",
    label: "Grocery list nudge",
    description: "Reminder to export your shopping list",
    icon: "list",
    frequencyKey: "notifyListExportFrequency",
  },
  {
    key: "notifyReceiptReminders",
    label: "Receipt reminders",
    description: "A nudge when you haven't scanned in a while",
    icon: "camera",
    frequencyKey: "notifyReceiptRemindersFrequency",
  },
  {
    key: "notifySpendSummary",
    label: "Spend summaries",
    description: "Recaps of what you spent",
    icon: "bar-chart-2",
    frequencyKey: "notifySpendSummaryFrequency",
  },
];

function NotificationsSection() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
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
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to change your reminder settings.");
      return;
    }
    const next = { ...current, [key]: !current[key] };
    setLocal(next);
    update.mutate(
      { data: { [key]: next[key] as boolean } },
      {
        onSuccess: (saved) => {
          setLocal(saved);
          void queryClient.invalidateQueries({
            queryKey: getGetMyNotificationPreferencesQueryKey(),
          });
        },
        onError: () => {
          setLocal(current);
        },
      },
    );
  };

  const setFrequency = (frequencyKey: string, value: "weekly" | "monthly") => {
    if (!current) return;
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to change your reminder settings.");
      return;
    }
    const next = { ...current, [frequencyKey]: value };
    setLocal(next);
    update.mutate(
      { data: { [frequencyKey]: value } as Parameters<typeof update.mutate>[0]["data"] },
      {
        onSuccess: (saved) => {
          setLocal(saved);
          void queryClient.invalidateQueries({ queryKey: getGetMyNotificationPreferencesQueryKey() });
        },
        onError: () => setLocal(current),
      },
    );
  };

  return (
    <View style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.notifHeader}>
        <Feather name="bell" size={18} color={colors.primary} />
        <Text style={[styles.rowText, { color: colors.foreground }]}>Email reminders</Text>
      </View>
      {NOTIFICATION_TOGGLES.map((t, idx) => {
        const isEnabled = current ? (current[t.key] as boolean) : true;
        const freq = t.frequencyKey ? ((current as unknown as Record<string, unknown> | null)?.[t.frequencyKey] as string | undefined ?? "weekly") : null;
        return (
          <View key={t.key as string}>
            <View
              style={[
                styles.notifRow,
                !t.frequencyKey && idx < NOTIFICATION_TOGGLES.length - 1 && {
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
                value={isEnabled}
                onValueChange={() => toggle(t.key)}
                disabled={!current}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#ffffff"
              />
            </View>
            {t.frequencyKey && isEnabled && (
              <View
                style={[
                  styles.freqRow,
                  idx < NOTIFICATION_TOGGLES.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.freqLabel, { color: colors.mutedForeground }]}>Send:</Text>
                <View style={styles.freqBtns}>
                  {(["weekly", "monthly"] as const).map((option) => {
                    const active = freq === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.freqBtn,
                          {
                            backgroundColor: active ? colors.primary : colors.secondary,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => setFrequency(t.frequencyKey!, option)}
                        activeOpacity={0.7}
                        disabled={!current}
                      >
                        <Text
                          style={[
                            styles.freqBtnText,
                            { color: active ? colors.primaryForeground : colors.mutedForeground },
                          ]}
                        >
                          {option === "weekly" ? "Weekly" : "Monthly"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        );
      })}
      <Text style={[styles.notifNote, { color: colors.mutedForeground }]}>
        At minimum, you'll receive one email per month per active type.
      </Text>
    </View>
  );
}

// ── Support Modal ─────────────────────────────────────────────────────────────

const SUPPORT_TYPES = [
  { key: "suggestion", label: "Suggestion", emoji: "💡" },
  { key: "complaint", label: "Complaint", emoji: "😤" },
  { key: "comment", label: "Comment", emoji: "💬" },
] as const;
type SupportType = typeof SUPPORT_TYPES[number]["key"];

interface SupportModalProps {
  visible: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colors: any;
}

function SupportModal({ visible, onClose, getToken, colors }: SupportModalProps) {
  const [type, setType] = React.useState<SupportType>("suggestion");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleClose = () => {
    setMessage("");
    setType("suggestion");
    setSent(false);
    setError(null);
    onClose();
  };

  const handleSend = async () => {
    if (!message.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/support`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ type, message: message.trim() }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSent(true);
    } catch {
      setError("Couldn't send your message. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={supportStyles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[supportStyles.sheet, { backgroundColor: colors.background }]}>
          <View style={[supportStyles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={[supportStyles.cancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[supportStyles.title, { color: colors.foreground }]}>Contact Support</Text>
            <View style={{ width: 56 }} />
          </View>

          {sent ? (
            <View style={supportStyles.sentWrap}>
              <Feather name="check-circle" size={40} color={colors.primary} />
              <Text style={[supportStyles.sentTitle, { color: colors.foreground }]}>Message sent!</Text>
              <Text style={[supportStyles.sentSub, { color: colors.mutedForeground }]}>
                We'll get back to you at your account email.
              </Text>
              <TouchableOpacity
                style={[supportStyles.doneBtn, { backgroundColor: colors.primary }]}
                onPress={handleClose}
                activeOpacity={0.85}
              >
                <Text style={supportStyles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[supportStyles.label, { color: colors.mutedForeground }]}>Type</Text>
              <View style={supportStyles.typeRow}>
                {SUPPORT_TYPES.map((t) => {
                  const active = type === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[
                        supportStyles.typePill,
                        { borderColor: active ? colors.primary : colors.border },
                        active && { backgroundColor: colors.accent },
                      ]}
                      onPress={() => setType(t.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={supportStyles.typePillEmoji}>{t.emoji}</Text>
                      <Text style={[supportStyles.typePillLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[supportStyles.label, { color: colors.mutedForeground }]}>Message</Text>
              <TextInput
                style={[supportStyles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="Tell us what's on your mind…"
                placeholderTextColor={colors.mutedForeground}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={2010}
                textAlignVertical="top"
              />
              <Text style={[supportStyles.charCount, { color: message.length > 2000 ? "#EF4444" : colors.mutedForeground }]}>
                {message.length}/2000
              </Text>

              {error ? <Text style={[supportStyles.error, { color: "#EF4444" }]}>{error}</Text> : null}

              <TouchableOpacity
                style={[
                  supportStyles.sendBtn,
                  { backgroundColor: colors.primary },
                  (!message.trim() || message.length > 2000 || busy) && supportStyles.sendBtnDisabled,
                ]}
                onPress={handleSend}
                disabled={!message.trim() || message.length > 2000 || busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={supportStyles.sendBtnText}>Send to Support</Text>
                )}
              </TouchableOpacity>

              <Text style={[supportStyles.note, { color: colors.mutedForeground }]}>
                Your message goes to support@fivetoninesolutions.com
              </Text>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const supportStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  cancel: { fontSize: 15, fontFamily: "Inter_400Regular", width: 56 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  typePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  typePillEmoji: { fontSize: 14 },
  typePillLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 100,
    marginBottom: 6,
  },
  charCount: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right", marginBottom: 12 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 10 },
  sendBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  note: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 10 },
  sentWrap: { alignItems: "center", gap: 12, paddingVertical: 24 },
  sentTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sentSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  doneBtn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 40, marginTop: 8 },
  doneBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

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
  freqRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 28,
    paddingBottom: 12,
    gap: 10,
  },
  freqLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  freqBtns: { flexDirection: "row", gap: 6 },
  freqBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  freqBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  notifNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 14,
    lineHeight: 16,
  },
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
