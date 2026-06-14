import React from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { getApiOrigin } from "@/lib/apiBase";
import { EmptyState } from "@/components/EmptyState";

interface PendingPost {
  id: number;
  content: string;
  tag: string | null;
  region: string | null;
  createdAt: string;
  type: "post";
}

interface PendingReply {
  id: number;
  postId: number;
  content: string;
  region: string | null;
  createdAt: string;
  type: "reply";
}

type PendingItem = PendingPost | PendingReply;

interface PendingData {
  posts: PendingPost[];
  replies: PendingReply[];
}

function timeStr(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminBoardScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "board", "pending"],
    queryFn: async (): Promise<PendingData> => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/admin/pending`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load pending items");
      return res.json() as Promise<PendingData>;
    },
  });

  const moderatePost = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/admin/${id}/${action}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "board", "pending"] }),
    onError: (err) => Alert.alert("Error", err instanceof Error ? err.message : "Action failed"),
  });

  const moderateReply = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/admin/reply/${id}/${action}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "board", "pending"] }),
    onError: (err) => Alert.alert("Error", err instanceof Error ? err.message : "Action failed"),
  });

  const sections = [
    { title: `Posts (${data?.posts.length ?? 0})`, data: data?.posts ?? [] as PendingItem[] },
    { title: `Replies (${data?.replies.length ?? 0})`, data: data?.replies ?? [] as PendingItem[] },
  ];

  const totalCount = (data?.posts.length ?? 0) + (data?.replies.length ?? 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Board Moderation</Text>
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState icon="alert-triangle" title="Unable to load" subtitle="You may not have admin access." />
        </View>
      ) : totalCount === 0 ? (
        <View style={styles.center}>
          <EmptyState icon="check-circle" title="All clear" subtitle="No posts or replies waiting for review." />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          renderSectionHeader={({ section }) =>
            section.data.length === 0 ? null : (
              <Text style={[styles.sectionHeader, { color: colors.mutedForeground, backgroundColor: colors.background }]}>
                {section.title}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.postMeta, { color: colors.mutedForeground }]}>
                {timeStr(item.createdAt)} · ID {item.id}
                {item.type === "reply" ? ` · Reply to post #${(item as PendingReply).postId}` : ""}
                {item.region ? ` · ${item.region}` : ""}
                {item.type === "post" && (item as PendingPost).tag ? ` · ${(item as PendingPost).tag}` : ""}
              </Text>
              <Text style={[styles.postContent, { color: colors.foreground }]}>{item.content}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#DCFCE7", borderColor: "#16A34A" }]}
                  onPress={() =>
                    item.type === "post"
                      ? moderatePost.mutate({ id: item.id, action: "approve" })
                      : moderateReply.mutate({ id: item.id, action: "approve" })
                  }
                  disabled={moderatePost.isPending || moderateReply.isPending}
                  activeOpacity={0.75}
                >
                  <Feather name="check" size={15} color="#16A34A" />
                  <Text style={[styles.actionLabel, { color: "#16A34A" }]}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#FEE2E2", borderColor: "#DC2626" }]}
                  onPress={() =>
                    item.type === "post"
                      ? moderatePost.mutate({ id: item.id, action: "reject" })
                      : moderateReply.mutate({ id: item.id, action: "reject" })
                  }
                  disabled={moderatePost.isPending || moderateReply.isPending}
                  activeOpacity={0.75}
                >
                  <Feather name="x" size={15} color="#DC2626" />
                  <Text style={[styles.actionLabel, { color: "#DC2626" }]}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: { width: 32 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sectionHeader: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  list: { paddingTop: 8 },
  postCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    marginHorizontal: 16,
    gap: 10,
  },
  postMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
