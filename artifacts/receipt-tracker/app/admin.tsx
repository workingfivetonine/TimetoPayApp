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
import { useAdminListUsers } from "@workspace/api-client-react";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { getApiOrigin } from "@/lib/apiBase";
import { EmptyState } from "@/components/EmptyState";

function roleLabel(role: string): string {
  if (role === "master_admin") return "Master admin";
  if (role === "family") return "Family";
  return "General";
}

export default function AdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: users, isLoading, error } = useAdminListUsers();
  const { getToken } = useAuth();
  const [seeding, setSeeding] = React.useState(false);
  const [seedResult, setSeedResult] = React.useState<Record<string, string> | null>(null);
  const [seedError, setSeedError] = React.useState<string | null>(null);

  // Creates/refreshes the editable email templates in Resend and returns the
  // env-var IDs to paste into Railway. One-time setup; safe to re-run.
  const handleSeedTemplates = async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/admin/seed-resend-templates`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = (await res.json()) as { railwayEnvVars?: Record<string, string>; error?: string };
      if (!res.ok) {
        setSeedError(data.error ?? "Couldn't create templates. Check that RESEND_API_KEY is set in Railway.");
        return;
      }
      setSeedResult(data.railwayEnvVars ?? {});
    } catch {
      setSeedError("Couldn't reach the server. Try again.");
    } finally {
      setSeeding(false);
    }
  };

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>All Users</Text>
        <TouchableOpacity
          style={[styles.moderateBtn, { backgroundColor: colors.accent }]}
          onPress={() => router.push("/admin/board")}
          activeOpacity={0.7}
        >
          <Feather name="message-square" size={15} color={colors.primary} />
          <Text style={[styles.moderateBtnText, { color: colors.primary }]}>Board</Text>
        </TouchableOpacity>
      </View>

      {/* Email templates → Resend (one-time setup) */}
      <View style={styles.seedWrap}>
        <View style={[styles.seedBar, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.seedTitle, { color: colors.foreground }]}>Email templates</Text>
            <Text style={[styles.seedSub, { color: colors.mutedForeground }]}>
              Create/refresh the editable email templates in your Resend dashboard.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.seedBtn, { backgroundColor: colors.primary }]}
            onPress={handleSeedTemplates}
            disabled={seeding}
            activeOpacity={0.85}
          >
            {seeding ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.seedBtnText}>Sync to Resend</Text>
            )}
          </TouchableOpacity>
        </View>
        {seedError ? <Text style={[styles.seedError, { color: colors.destructive }]}>{seedError}</Text> : null}
        {seedResult ? (
          <View style={[styles.seedResult, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.seedTitle, { color: colors.foreground }]}>
              ✅ Done — paste these into Railway → Variables, then redeploy:
            </Text>
            {Object.entries(seedResult).map(([k, v]) => (
              <Text key={k} selectable style={[styles.seedVar, { color: colors.foreground }]}>
                {k}={v}
              </Text>
            ))}
            <Text style={[styles.seedSub, { color: colors.mutedForeground, marginTop: 6 }]}>
              After that, edit any email's wording in the Resend dashboard — no code needed.
            </Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState icon="alert-triangle" title="Unable to load users" subtitle="You may not have admin access." />
        </View>
      ) : (
        <FlatList
          data={users ?? []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="users" title="No users yet" subtitle="Users appear here once they sign up." />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/admin/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.email, { color: colors.foreground }]} numberOfLines={1}>
                  {item.email ?? "(no email)"}
                </Text>
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.badgeText, { color: colors.accentForeground }]}>{roleLabel(item.role)}</Text>
                </View>
              </View>
              <View style={styles.stats}>
                <Stat label="Receipts" value={String(item.receiptCount)} colors={colors} />
                <Stat label="Stores" value={String(item.storeCount)} colors={colors} />
                <Stat label="Items" value={String(item.itemCount)} colors={colors} />
                <Stat label="Spend" value={`$${item.totalSpend.toFixed(2)}`} colors={colors} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
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
  moderateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  moderateBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  email: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  stats: { flexDirection: "row", marginTop: 14, gap: 20 },
  stat: {},
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  seedWrap: { paddingHorizontal: 16, paddingBottom: 4, maxWidth: 720, width: "100%", alignSelf: "center", gap: 8 },
  seedBar: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  seedTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  seedSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  seedBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  seedBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  seedError: { fontSize: 13, fontFamily: "Inter_500Medium" },
  seedResult: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  seedVar: { fontSize: 12, fontFamily: Platform.OS === "web" ? "monospace" : undefined, marginTop: 2 },
});
