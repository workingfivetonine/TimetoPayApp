import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/expo";
import React from "react";
import {
  ActivityIndicator,
  Alert,
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
  useAdminListUsers,
  useAdminGetUserReceipts,
  useAdminSetUserRole,
  useAdminDeleteUser,
  useAdminForcePasswordReset,
  useAdminMergeUsers,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { getApiOrigin } from "@/lib/apiBase";
import { EmptyState } from "@/components/EmptyState";

type Role = "master_admin" | "family" | "general";

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "master_admin", label: "Master admin", hint: "Full admin access (only one allowed)" },
  { value: "family", label: "Family", hint: "Label only — data stays private" },
  { value: "general", label: "General", hint: "Standard user" },
];

function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: confirmLabel, style: "destructive", onPress: onConfirm },
    ]);
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function DetailRow({
  label,
  value,
  colors,
  mono,
}: {
  label: string;
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colors: any;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          { color: colors.foreground },
          mono && { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export default function AdminUserDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const { data: users } = useAdminListUsers();
  const { data, isLoading, error } = useAdminGetUserReceipts(userId);

  const current = users?.find((u) => u.id === userId);
  // boardAutoApprove is a drifted field not in the generated type — read via cast.
  const autoApprove = !!(current as { boardAutoApprove?: boolean } | undefined)?.boardAutoApprove;

  // Toggle the "post to community without review" trust flag (raw fetch: the
  // generated client predates this endpoint).
  const setAutoApprove = useMutation({
    mutationFn: async (enabled: boolean) => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/admin/user/${userId}/auto-approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json() as Promise<{ boardAutoApprove: boolean }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
  const otherUsers = (users ?? []).filter((u) => u.id !== userId);

  const setRole = useAdminSetUserRole();
  const deleteUser = useAdminDeleteUser();
  const mergeUsers = useAdminMergeUsers();

  const forceReset = useAdminForcePasswordReset();
  const busy =
    setRole.isPending || deleteUser.isPending || mergeUsers.isPending || forceReset.isPending;

  const refreshAdminData = () => {
    queryClient.invalidateQueries();
  };

  const handleSetRole = (role: Role) => {
    if (!current || current.role === role || busy) return;
    const apply = () =>
      setRole.mutate(
        { userId, data: { role } },
        { onSuccess: refreshAdminData },
      );
    if (role === "master_admin") {
      confirmAction(
        "Transfer master admin",
        "This user will become the master admin and the current master admin will be demoted to General. Continue?",
        "Transfer",
        apply,
      );
    } else {
      apply();
    }
  };

  const handleDelete = () => {
    if (busy) return;
    confirmAction(
      "Delete user",
      `Permanently delete ${current?.email ?? "this user"} and all of their receipts, stores, and items? This can't be undone.`,
      "Delete",
      () =>
        deleteUser.mutate(
          { userId },
          {
            onSuccess: () => {
              refreshAdminData();
              router.back();
            },
          },
        ),
    );
  };

  const handleForcePasswordReset = () => {
    if (busy) return;
    confirmAction(
      "Require password reset",
      `${current?.username ?? current?.email ?? "This user"} will be signed out everywhere and must set a new password before signing in again. No email is sent — Clerk has no admin reset-email API, so tell them yourself. Has no effect if they sign in with Google.`,
      "Require reset",
      () => forceReset.mutate({ userId }),
    );
  };

  const handleMerge = (targetId: string, targetEmail: string | null | undefined) => {
    if (busy) return;
    confirmAction(
      "Merge user",
      `Move all of ${current?.email ?? "this user"}'s data into ${targetEmail ?? "the selected user"}, then delete ${current?.email ?? "this user"}? Duplicate stores and items are combined. This can't be undone.`,
      "Merge",
      () =>
        mergeUsers.mutate(
          { data: { sourceUserId: userId, targetUserId: targetId } },
          {
            onSuccess: () => {
              refreshAdminData();
              router.back();
            },
          },
        ),
    );
  };

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;
  const isMaster = current?.isAdmin ?? false;
  const actionError = setRole.error || deleteUser.error || mergeUsers.error;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {current?.email ?? data?.email ?? "User"}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Account details */}
        {current ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Account</Text>
            <DetailRow label="Username" value={current.username ?? "— not set yet"} colors={colors} />
            <DetailRow label="Email" value={current.email ?? "— none"} colors={colors} />
            <DetailRow label="Joined" value={formatDate(current.createdAt)} colors={colors} />
            <DetailRow
              label="Region"
              value={
                current.countryCode
                  ? [current.countryCode, current.stateCode].filter(Boolean).join(" / ")
                  : "— not set"
              }
              colors={colors}
            />
            <DetailRow
              label="Profile setup"
              value={current.username ? "Completed" : "No username chosen yet"}
              colors={colors}
            />
            <DetailRow
              label="Posts without review"
              value={current.boardAutoApprove ? "Yes" : "No"}
              colors={colors}
            />
            <DetailRow label="User ID" value={current.id} colors={colors} mono />
          </View>
        ) : null}

        {/* User type */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>User type</Text>
          {!current ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
          ) : (
            ROLE_OPTIONS.map((opt) => {
              const selected = current.role === opt.value;
              const lockMaster = isMaster && opt.value !== "master_admin";
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.roleRow,
                    { borderColor: selected ? colors.primary : colors.border },
                    selected && { backgroundColor: colors.accent },
                    (lockMaster || busy) && { opacity: 0.5 },
                  ]}
                  onPress={() => handleSetRole(opt.value)}
                  disabled={selected || lockMaster || busy}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleLabel, { color: colors.foreground }]}>{opt.label}</Text>
                    <Text style={[styles.roleHint, { color: colors.mutedForeground }]}>{opt.hint}</Text>
                  </View>
                  {selected ? <Feather name="check-circle" size={20} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })
          )}
          {isMaster ? (
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              To change the master admin, assign Master admin to another user. That transfers admin rights.
            </Text>
          ) : null}
        </View>

        {/* Community trust */}
        {current ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Community board</Text>
            <View style={styles.trustRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleLabel, { color: colors.foreground }]}>Post without review</Text>
                <Text style={[styles.roleHint, { color: colors.mutedForeground }]}>
                  {isMaster
                    ? "Admins always post without review."
                    : "When on, this user's posts and replies go live immediately, skipping the approval queue."}
                </Text>
              </View>
              <Switch
                value={isMaster || autoApprove}
                onValueChange={(v) => setAutoApprove.mutate(v)}
                disabled={isMaster || setAutoApprove.isPending}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </View>
        ) : null}

        {/* Merge */}
        {!isMaster && otherUsers.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Merge into another user</Text>
            <Text style={[styles.note, { color: colors.mutedForeground, marginTop: 4, marginBottom: 8 }]}>
              Moves this user's data into the selected user, then deletes this account.
            </Text>
            {otherUsers.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={[styles.mergeRow, { borderColor: colors.border }, busy && { opacity: 0.5 }]}
                onPress={() => handleMerge(u.id, u.email)}
                disabled={busy}
                activeOpacity={0.7}
              >
                <Feather name="git-merge" size={16} color={colors.primary} />
                <Text style={[styles.mergeText, { color: colors.foreground }]} numberOfLines={1}>
                  {u.email ?? "(no email)"}
                </Text>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Danger zone. Refused for your own account server-side, so it's hidden
            here too — locking yourself out isn't recoverable in-app. */}
        {!isMaster ? (
          <>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }, busy && { opacity: 0.5 }]}
              onPress={handleForcePasswordReset}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Feather name="key" size={18} color={colors.foreground} />
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                Require password reset
              </Text>
            </TouchableOpacity>
            {forceReset.isSuccess ? (
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                Done — they must set a new password next sign-in. Let them know directly; no
                email was sent.
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.deleteBtn, { borderColor: colors.destructive }, busy && { opacity: 0.5 }]}
              onPress={handleDelete}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Feather name="trash-2" size={18} color={colors.destructive} />
              <Text style={[styles.deleteText, { color: colors.destructive }]}>Delete user</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {actionError ? (
          <Text style={[styles.errorText, { color: colors.destructive }]}>
            Action failed. The user may be protected (master admin) or already changed.
          </Text>
        ) : null}

        {/* Receipts */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 8 }]}>Receipts</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : error ? (
          <EmptyState icon="alert-triangle" title="Unable to load receipts" subtitle="You may not have admin access." />
        ) : (data?.receipts ?? []).length === 0 ? (
          <EmptyState icon="file-text" title="No receipts" subtitle="This user hasn't scanned any receipts yet." />
        ) : (
          (data?.receipts ?? []).map((item) => (
            <View
              key={item.id}
              style={[styles.receiptCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.store, { color: colors.foreground }]} numberOfLines={1}>
                  {item.storeName}
                </Text>
                <Text style={[styles.total, { color: colors.primary }]}>${item.total.toFixed(2)}</Text>
              </View>
              <Text style={[styles.date, { color: colors.mutedForeground }]}>
                {new Date(item.purchasedAt).toLocaleDateString()}
              </Text>
              {item.notes ? (
                <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
            </View>
          ))
        )}
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
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 14, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  roleLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  roleHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  note: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 12, lineHeight: 17 },
  mergeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 8,
  },
  mergeText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  deleteText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  hintText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 10,
  },
  detailLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  detailValue: { flexShrink: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  receiptCard: { borderWidth: 1, borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  store: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  total: { fontSize: 16, fontFamily: "Inter_700Bold" },
  date: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  notes: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
});
