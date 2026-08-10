import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { notify } from "@/lib/confirm";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

// Optional donation link (a Stripe Payment Link) for the "Support us" button.
// Defaults to the live donation page; override with EXPO_PUBLIC_DONATE_URL if it
// ever changes. Works on web and native (opens in the browser).
const DONATE_URL =
  process.env.EXPO_PUBLIC_DONATE_URL ?? "https://donate.stripe.com/9B6eVed6D3DUh19e2TdfG00";

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
  const [showSupport, setShowSupport] = React.useState(false);

  // Optional home address → geocoded server-side so Stores can show distance.
  // address/hasLocation are drifted fields not in the generated type (read via cast).
  const savedAddress = (me as { address?: string | null } | undefined)?.address ?? "";
  const hasLocation = !!(me as { hasLocation?: boolean } | undefined)?.hasLocation;
  const [addressDraft, setAddressDraft] = React.useState<string | null>(null);
  const addressValue = addressDraft ?? savedAddress;
  const [savingAddress, setSavingAddress] = React.useState(false);
  const addressDirty = addressDraft !== null && addressDraft.trim() !== savedAddress.trim();

  const handleSaveAddress = async () => {
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to save your address.");
      return;
    }
    setSavingAddress(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/me/address`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ address: addressValue.trim() }),
      });
      if (!res.ok) throw new Error("save failed");
      const body = (await res.json()) as { addressGeocoded?: boolean };
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      setAddressDraft(null);
      if (!addressValue.trim()) {
        showSuccessToast("Address cleared", "Distances are turned off.");
      } else if (body.addressGeocoded === false) {
        notify("Address saved", "We couldn't locate it on the map, so distances may not show. Try adding city and ZIP.");
      } else {
        showSuccessToast("Address saved", "You'll now see distance to each store.");
      }
    } catch {
      notify("Couldn't save address", "Please try again.");
    } finally {
      setSavingAddress(false);
    }
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

  const openLegalPage = (page: "privacy" | "terms" | "support") => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.location.href = `/${page}`;
    } else {
      const domain = process.env.EXPO_PUBLIC_DOMAIN || "www.5to9shopping.com";
      void Linking.openURL(`https://${domain}/${page}`);
    }
  };

  const handleDeleteAccount = async () => {
    const msg =
      "This permanently deletes your account and all your data — receipts, items, stores, and community posts. This cannot be undone.";
    const proceed =
      Platform.OS === "web"
        ? typeof window !== "undefined" && window.confirm(msg)
        : await new Promise<boolean>((resolve) => {
            Alert.alert("Delete account", msg, [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Delete", style: "destructive", onPress: () => resolve(true) },
            ]);
          });
    if (!proceed) return;
    try {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/me`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        notify("Couldn't delete account", data.error ?? "Please try again.");
        return;
      }
      await signOut();
      queryClient.clear();
      router.replace("/(auth)/sign-in");
    } catch {
      notify("Couldn't delete account", "Check your connection and try again.");
    }
  };

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/"); }} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Account</Text>
        <View style={styles.backBtn} />
      </View>

      <OfflineBanner lastUpdated={dataUpdatedAt} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            {(me as { avatar?: string | null })?.avatar ? (
              <Image source={{ uri: (me as { avatar?: string | null }).avatar! }} style={styles.avatarImg} />
            ) : (
              <Feather name="user" size={26} color={colors.primary} />
            )}
          </View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Signed in as</Text>
          <Text style={[styles.email, { color: colors.foreground }]}>
            {(me as { username?: string | null })?.username || email}
          </Text>
          {(me as { username?: string | null })?.username ? (
            <Text style={[styles.emailSub, { color: colors.mutedForeground }]}>{email}</Text>
          ) : null}
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

        {/* Optional home address → store "distance from" */}
        <View style={[styles.addressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.addressHeader}>
            <Feather name="home" size={18} color={colors.primary} />
            <Text style={[styles.rowText, { color: colors.foreground }]}>Home address</Text>
            <Text style={[styles.optionalTag, { color: colors.mutedForeground }]}>optional</Text>
          </View>
          <Text style={[styles.rowSub, { color: colors.mutedForeground, marginBottom: 8 }]}>
            {hasLocation
              ? "Distance to each store is shown on the Stores tab."
              : "Add your address to see how far each store is."}
          </Text>
          <TextInput
            style={[styles.addressInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={addressValue}
            onChangeText={setAddressDraft}
            placeholder="Street, city, ZIP/postcode"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
          />
          {addressDirty ? (
            <TouchableOpacity
              onPress={handleSaveAddress}
              disabled={savingAddress}
              style={[styles.addressSaveBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              {savingAddress ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.addressSaveText, { color: colors.primaryForeground }]}>
                  {addressValue.trim() ? "Save address" : "Clear address"}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/help")}
          activeOpacity={0.7}
        >
          <Feather name="book-open" size={18} color={colors.primary} />
          <Text style={[styles.rowText, { color: colors.foreground }]}>How-to guide</Text>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Support TimetoPay — an optional donation, and the only place money is
            ever mentioned. Every feature is free; nothing here unlocks anything.

            Hidden on iOS. App Review requires donation mentions to be removed
            entirely: linking out to an external payment page for a for-profit
            developer breaches Guideline 3.1.1, and donations would have to go
            through in-app purchase instead. Stays available on Android and web,
            same approach as the Google sign-in button. */}
        {Platform.OS !== "ios" ? (
          <View style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.subHeader}>
              <Feather name="heart" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.foreground }]}>Support TimetoPay</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  TimetoPay is free — every feature, always. If it helps you save, a small
                  donation keeps it running. Totally optional.
                </Text>
              </View>
            </View>

            {DONATE_URL ? (
              <TouchableOpacity
                onPress={() => void Linking.openURL(DONATE_URL)}
                style={[styles.subActionBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.subActionText, { color: colors.primaryForeground }]}>Support us 💛</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <NotificationsSection />

        <BlockedAccountsSection />

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

        <TouchableOpacity
          style={styles.deleteAccount}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
        >
          <Text style={[styles.deleteAccountText, { color: colors.mutedForeground }]}>
            Delete my account
          </Text>
        </TouchableOpacity>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => openLegalPage("privacy")} accessibilityRole="link">
            <Text style={[styles.legalLink, { color: colors.mutedForeground }]}>Privacy</Text>
          </TouchableOpacity>
          <Text style={[styles.legalDot, { color: colors.mutedForeground }]}>·</Text>
          <TouchableOpacity onPress={() => openLegalPage("terms")} accessibilityRole="link">
            <Text style={[styles.legalLink, { color: colors.mutedForeground }]}>Terms</Text>
          </TouchableOpacity>
          <Text style={[styles.legalDot, { color: colors.mutedForeground }]}>·</Text>
          <TouchableOpacity onPress={() => openLegalPage("support")} accessibilityRole="link">
            <Text style={[styles.legalLink, { color: colors.mutedForeground }]}>Support</Text>
          </TouchableOpacity>
        </View>
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
          showSuccessToast(
            next[key] ? "Reminder turned on" : "Reminder turned off",
            "Your email preferences were saved.",
          );
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
          showSuccessToast("Frequency updated", `Now sending ${value}.`);
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

// ── Blocked accounts (Community Board moderation) ──────────────────────────────
//
// Board block/report satisfies App Store Guideline 1.2 (user-generated content
// needs report + block). Blocking happens from a post/reply's "⋯" menu; this
// is the other half — seeing and undoing it. Hidden entirely when the list is
// empty, so most accounts never see an empty settings section.

interface BlockedAccount {
  userId: string;
  username: string;
  avatar: string | null;
  blockedAt: string;
}

function BlockedAccountsSection() {
  const colors = useColors();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: blocked } = useQuery({
    queryKey: ["board-blocked"],
    queryFn: async (): Promise<BlockedAccount[]> => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/blocked`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<BlockedAccount[]>;
    },
  });

  const unblock = useMutation({
    mutationFn: async (userId: string) => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/blocked/${userId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: (_result, userId) => {
      queryClient.setQueryData<BlockedAccount[]>(["board-blocked"], (old) =>
        old ? old.filter((b) => b.userId !== userId) : old,
      );
      showSuccessToast("Unblocked", "You'll see their posts and replies again.");
    },
    onError: () => showErrorToast("Couldn't unblock", "Please try again."),
  });

  if (!blocked?.length) return null;

  return (
    <View style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.notifHeader}>
        <Feather name="slash" size={18} color={colors.primary} />
        <Text style={[styles.rowText, { color: colors.foreground }]}>Blocked accounts</Text>
      </View>
      {blocked.map((b, idx) => (
        <View
          key={b.userId}
          style={[
            styles.notifRow,
            idx < blocked.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.notifLabel, { color: colors.foreground, flex: 1 }]}>{b.username}</Text>
          <TouchableOpacity
            onPress={() => unblock.mutate(b.userId)}
            disabled={unblock.isPending}
            activeOpacity={0.7}
          >
            <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 14 }}>Unblock</Text>
          </TouchableOpacity>
        </View>
      ))}
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
              <Text style={[supportStyles.charCount, { color: message.length > 2000 ? colors.destructive : colors.mutedForeground }]}>
                {message.length}/2000
              </Text>

              {error ? <Text style={[supportStyles.error, { color: colors.destructive }]}>{error}</Text> : null}

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
  emailSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  avatarImg: { width: 64, height: 64, borderRadius: 32 },
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
  addressCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16 },
  addressHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  optionalTag: { fontSize: 12, fontFamily: "Inter_400Regular" },
  addressInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  addressSaveBtn: { marginTop: 10, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  addressSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
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
  deleteAccount: { alignItems: "center", marginTop: 16, paddingVertical: 8 },
  deleteAccountText: { fontSize: 14, fontFamily: "Inter_500Medium", textDecorationLine: "underline" },
  legalLinks: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 18 },
  legalLink: { fontSize: 13, fontFamily: "Inter_500Medium" },
  legalDot: { fontSize: 13 },
});
