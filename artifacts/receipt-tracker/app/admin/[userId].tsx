import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
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
  useAdminMergeUsers,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
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

export default function AdminUserDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const { data: users } = useAdminListUsers();
  const { data, isLoading, error } = useAdminGetUserReceipts(userId);

  const current = users?.find((u) => u.id === userId);
  const otherUsers = (users ?? []).filter((u) => u.id !== userId);

  const setRole = useAdminSetUserRole();
  const deleteUser = useAdminDeleteUser();
  const mergeUsers = useAdminMergeUsers();

  const busy = setRole.isPending || deleteUser.isPending || mergeUsers.isPending;

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

        {/* Danger zone */}
        {!isMaster ? (
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: colors.destructive }, busy && { opacity: 0.5 }]}
            onPress={handleDelete}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Feather name="trash-2" size={18} color={colors.destructive} />
            <Text style={[styles.deleteText, { color: colors.destructive }]}>Delete user</Text>
          </TouchableOpacity>
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
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  receiptCard: { borderWidth: 1, borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  store: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  total: { fontSize: 16, fontFamily: "Inter_700Bold" },
  date: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  notes: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
});
