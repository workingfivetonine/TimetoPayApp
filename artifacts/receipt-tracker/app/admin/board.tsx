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

/**
 * A flag raised by a user. Also covers blocks: blocking someone files a report
 * with reason "blocked_user", because Guideline 1.2 asks that a block notify
 * the developer of the content, not only hide it for the person who blocked.
 */
interface Report {
  id: number;
  postId: number | null;
  replyId: number | null;
  reason: string;
  detail: string | null;
  createdAt: string;
  /** Null once the reported content has been deleted. */
  content: string | null;
  authorId: string | null;
  authorUsername: string | null;
  type: "report";
}

type QueueItem = PendingPost | PendingReply | Report;

interface PendingData {
  posts: PendingPost[];
  replies: PendingReply[];
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment or bullying",
  hate: "Hate speech",
  sexual: "Sexual content",
  off_topic: "Not about shopping",
  other: "Something else",
  blocked_user: "Blocked by a user",
};

function timeStr(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Whole hours since `iso`. Drives the overdue flag on the reports queue. */
function hoursSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

export default function AdminBoardScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  const authedFetch = React.useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${getApiOrigin()}/api${path}`, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [getToken],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "board", "pending"],
    queryFn: async (): Promise<PendingData> => {
      const res = await authedFetch("/board/admin/pending");
      if (!res.ok) throw new Error("Failed to load pending items");
      return res.json() as Promise<PendingData>;
    },
  });

  // Reports are a separate query from the approval queue: they are a different
  // job with a clock on it (we commit to acting within 24 hours), and one
  // failing should not blank the other.
  const { data: reports } = useQuery({
    queryKey: ["admin", "board", "reports"],
    queryFn: async (): Promise<Report[]> => {
      const res = await authedFetch("/board/admin/reports");
      if (!res.ok) throw new Error("Failed to load reports");
      const rows = (await res.json()) as Omit<Report, "type">[];
      return rows.map((r) => ({ ...r, type: "report" as const }));
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "board", "pending"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "board", "reports"] });
  };

  const moderatePost = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await authedFetch(`/board/admin/${id}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      return res.json();
    },
    onSuccess: invalidateAll,
    onError: (err) => Alert.alert("Error", err instanceof Error ? err.message : "Action failed"),
  });

  const moderateReply = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await authedFetch(`/board/admin/reply/${id}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      return res.json();
    },
    onSuccess: invalidateAll,
    onError: (err) => Alert.alert("Error", err instanceof Error ? err.message : "Action failed"),
  });

  const resolveReport = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "actioned" | "dismissed" }) => {
      const res = await authedFetch(`/board/admin/reports/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed to resolve report");
      return res.json();
    },
    onSuccess: invalidateAll,
    onError: (err) => Alert.alert("Error", err instanceof Error ? err.message : "Action failed"),
  });

  /**
   * Remove the reported content, then close the report. Two calls rather than
   * one endpoint because deleting content and resolving a report are separate
   * decisions everywhere else in the app; only the button chains them.
   */
  const removeReported = useMutation({
    mutationFn: async (report: Report) => {
      if (report.content !== null) {
        const path =
          report.postId != null ? `/board/${report.postId}` : `/board/reply/${report.replyId}`;
        const res = await authedFetch(path, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to remove the content");
      }
      const resolved = await authedFetch(`/board/admin/reports/${report.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "actioned" }),
      });
      if (!resolved.ok) throw new Error("Removed the content but couldn't close the report");
    },
    onSuccess: invalidateAll,
    onError: (err) => Alert.alert("Error", err instanceof Error ? err.message : "Action failed"),
  });

  const openReports = reports ?? [];
  const pendingPosts = data?.posts ?? [];
  const pendingReplies = data?.replies ?? [];

  const sections = [
    { title: `Reports (${openReports.length})`, data: openReports as QueueItem[] },
    { title: `Posts (${pendingPosts.length})`, data: pendingPosts as QueueItem[] },
    { title: `Replies (${pendingReplies.length})`, data: pendingReplies as QueueItem[] },
  ];

  const totalCount = openReports.length + pendingPosts.length + pendingReplies.length;

  const renderReport = (item: Report) => {
    const age = hoursSince(item.createdAt);
    const overdue = age >= 24;
    const gone = item.content === null;
    return (
      <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: overdue ? colors.destructive : colors.border }]}>
        <View style={styles.reportHead}>
          <View style={[styles.reasonChip, { backgroundColor: colors.secondary }]}>
            <Feather name="flag" size={12} color={colors.secondaryForeground} />
            <Text style={[styles.reasonChipText, { color: colors.secondaryForeground }]}>
              {REASON_LABELS[item.reason] ?? item.reason}
            </Text>
          </View>
          {overdue ? (
            <Text style={[styles.overdue, { color: colors.destructive }]}>{age}h old</Text>
          ) : null}
        </View>
        <Text style={[styles.postMeta, { color: colors.mutedForeground }]}>
          {timeStr(item.createdAt)} ·{" "}
          {item.postId != null ? `Post #${item.postId}` : `Reply #${item.replyId}`}
          {item.authorUsername ? ` · by ${item.authorUsername}` : ""}
        </Text>
        <Text
          style={[
            styles.postContent,
            { color: gone ? colors.mutedForeground : colors.foreground },
            gone && styles.deletedContent,
          ]}
        >
          {gone ? "This content has already been deleted." : item.content}
        </Text>
        {item.detail ? (
          <Text style={[styles.reportDetail, { color: colors.mutedForeground }]}>“{item.detail}”</Text>
        ) : null}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.spendHigh, borderColor: colors.destructive }]}
            onPress={() => removeReported.mutate(item)}
            disabled={removeReported.isPending || resolveReport.isPending}
            activeOpacity={0.75}
          >
            <Feather name="trash-2" size={15} color={colors.destructive} />
            <Text style={[styles.actionLabel, { color: colors.destructive }]}>
              {gone ? "Close as actioned" : "Remove content"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.border }]}
            onPress={() => resolveReport.mutate({ id: item.id, action: "dismissed" })}
            disabled={removeReported.isPending || resolveReport.isPending}
            activeOpacity={0.75}
          >
            <Feather name="check" size={15} color={colors.mutedForeground} />
            <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
        {item.authorId ? (
          <TouchableOpacity
            style={styles.ejectRow}
            onPress={() => router.push(`/admin/${item.authorId}` as never)}
            activeOpacity={0.7}
          >
            <Feather name="user-x" size={14} color={colors.primary} />
            <Text style={[styles.ejectLabel, { color: colors.primary }]}>
              Review {item.authorUsername ?? "this account"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderPending = (item: PendingPost | PendingReply) => (
    <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.postMeta, { color: colors.mutedForeground }]}>
        {timeStr(item.createdAt)} · ID {item.id}
        {item.type === "reply" ? ` · Reply to post #${item.postId}` : ""}
        {item.region ? ` · ${item.region}` : ""}
        {item.type === "post" && item.tag ? ` · ${item.tag}` : ""}
      </Text>
      <Text style={[styles.postContent, { color: colors.foreground }]}>{item.content}</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.spendLow, borderColor: colors.priceGood }]}
          onPress={() =>
            item.type === "post"
              ? moderatePost.mutate({ id: item.id, action: "approve" })
              : moderateReply.mutate({ id: item.id, action: "approve" })
          }
          disabled={moderatePost.isPending || moderateReply.isPending}
          activeOpacity={0.75}
        >
          <Feather name="check" size={15} color={colors.priceGood} />
          <Text style={[styles.actionLabel, { color: colors.priceGood }]}>Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.spendHigh, borderColor: colors.destructive }]}
          onPress={() =>
            item.type === "post"
              ? moderatePost.mutate({ id: item.id, action: "reject" })
              : moderateReply.mutate({ id: item.id, action: "reject" })
          }
          disabled={moderatePost.isPending || moderateReply.isPending}
          activeOpacity={0.75}
        >
          <Feather name="x" size={15} color={colors.destructive} />
          <Text style={[styles.actionLabel, { color: colors.destructive }]}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
          <EmptyState icon="check-circle" title="All clear" subtitle="No reports, posts or replies waiting for review." />
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
          renderItem={({ item }) =>
            item.type === "report" ? renderReport(item) : renderPending(item)
          }
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
  deletedContent: { fontStyle: "italic" },
  reportHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reasonChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  reasonChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  overdue: { fontSize: 12, fontFamily: "Inter_700Bold" },
  reportDetail: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
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
  ejectRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 },
  ejectLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
