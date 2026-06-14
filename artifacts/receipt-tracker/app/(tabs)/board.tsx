import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Modal,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { usePremiumLock } from "@/hooks/usePremiumLock";
import { PremiumUpsell } from "@/components/PremiumUpsell";
import { useDesktop } from "@/hooks/useDesktop";
import { getApiOrigin } from "@/lib/apiBase";
import { EmptyState } from "@/components/EmptyState";
import { useBoardNotification } from "@/contexts/BoardNotification";

const MAX_CHARS = 500;

const TAGS = [
  { key: "recipe", label: "Recipe", emoji: "🍽️" },
  { key: "advice", label: "Advice", emoji: "💡" },
  { key: "cool_idea", label: "Cool Idea", emoji: "✨" },
  { key: "other", label: "General", emoji: "💬" },
] as const;

type TagKey = typeof TAGS[number]["key"];

interface BoardReply {
  id: number;
  content: string;
  region: string | null;
  createdAt: string;
}

interface BoardPost {
  id: number;
  content: string;
  tag: string | null;
  region: string | null;
  agreeCount: number;
  replyCount: number;
  userAgreed: boolean;
  createdAt: string;
}

interface BoardData {
  eligible: boolean;
  missingRequirements: string[];
  posts: BoardPost[];
  newCount: number;
}

function missingLabel(req: string): string {
  if (req === "subscription") return "An active subscription";
  if (req === "account_age") return "At least 2 weeks of using TimetoPay";
  if (req === "upload_count") return "At least 2 receipt uploads";
  return req;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function tagInfo(key: string | null) {
  return TAGS.find((t) => t.key === key) ?? null;
}

export default function BoardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDesktop = useDesktop();
  const locked = usePremiumLock();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { setNewCount, clearNew } = useBoardNotification();

  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [composeTag, setComposeTag] = useState<TagKey | null>(null);
  const [searchText, setSearchText] = useState("");
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const paddingTop = isDesktop ? 32 : Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = isDesktop ? 24 : Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["board"],
    queryFn: async (): Promise<BoardData> => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load board");
      return res.json() as Promise<BoardData>;
    },
    enabled: !locked,
  });

  // Update notification context when board data loads, then clear badge
  useEffect(() => {
    if (data?.newCount !== undefined) {
      setNewCount(data.newCount);
    }
  }, [data?.newCount, setNewCount]);

  // Clear badge when this screen is focused
  useEffect(() => {
    clearNew();
  }, [clearNew]);

  const submitMutation = useMutation({
    mutationFn: async ({ content, tag }: { content: string; tag: TagKey | null }) => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content, tag }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Failed to submit");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      setComposeText("");
      setComposeTag(null);
      setShowCompose(false);
    },
  });

  const agreeMutation = useMutation({
    mutationFn: async (postId: number) => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/${postId}/agree`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ agreed: boolean; agreeCount: number }>;
    },
    onSuccess: (result, postId) => {
      queryClient.setQueryData<BoardData>(["board"], (old) => {
        if (!old) return old;
        return {
          ...old,
          posts: old.posts.map((p) =>
            p.id === postId
              ? { ...p, agreeCount: result.agreeCount, userAgreed: result.agreed }
              : p,
          ),
        };
      });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/${postId}/replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to submit reply");
      return res.json();
    },
    onSuccess: () => {
      setReplyingTo(null);
      setReplyText("");
    },
  });

  const handleSubmit = () => {
    const text = composeText.trim();
    if (!text || text.length > MAX_CHARS) return;
    submitMutation.mutate({ content: text, tag: composeTag });
  };

  const handleReplySubmit = (postId: number) => {
    const text = replyText.trim();
    if (!text || text.length > MAX_CHARS) return;
    replyMutation.mutate({ postId, content: text });
  };

  const toggleReplies = (postId: number) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  // Client-side search filter
  const filteredPosts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return data?.posts ?? [];
    return (data?.posts ?? []).filter(
      (p) =>
        p.content.toLowerCase().includes(q) ||
        tagInfo(p.tag)?.label.toLowerCase().includes(q),
    );
  }, [data?.posts, searchText]);

  if (locked) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Community</Text>
        </View>
        <PremiumUpsell
          title="Community is a premium feature"
          subtitle="Upgrade to share tips, feedback, and ideas with other shoppers."
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (data && !data.eligible) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Community</Text>
        </View>
        <View style={styles.ineligibleWrap}>
          <View style={[styles.ineligibleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="clock" size={32} color={colors.primary} style={{ marginBottom: 12 }} />
            <Text style={[styles.ineligibleTitle, { color: colors.foreground }]}>Almost there!</Text>
            <Text style={[styles.ineligibleSub, { color: colors.mutedForeground }]}>
              To join the community board, you need:
            </Text>
            {data.missingRequirements.map((r) => (
              <View key={r} style={styles.requirementRow}>
                <Feather name="x-circle" size={15} color={colors.spendHigh ?? "#EF4444"} />
                <Text style={[styles.requirementText, { color: colors.mutedForeground }]}>
                  {missingLabel(r)}
                </Text>
              </View>
            ))}
            <Text style={[styles.ineligibleNote, { color: colors.mutedForeground }]}>
              Keep using TimetoPay and check back soon.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Community</Text>
        <TouchableOpacity
          style={[styles.composeBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowCompose(true)}
          activeOpacity={0.8}
        >
          <Feather name="edit-2" size={15} color="#fff" />
          <Text style={styles.composeBtnText}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Community guidelines banner */}
      <View style={[styles.banner, { backgroundColor: colors.accent, borderColor: colors.border }]}>
        <Text style={[styles.bannerQuote, { color: colors.primary }]}>
          "If you have nothing nice to say, say nothing at all…{"\n"}unless it's about groceries."
        </Text>
        <Text style={[styles.bannerRules, { color: colors.mutedForeground }]}>
          Kind reminder: No slander, doxxing, names of specific individuals, discrimination, or politics.
          Doesn't the cost of living have enough to complain about without bringing all those factors in?
        </Text>
      </View>

      {/* Search bar */}
      <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search posts…"
          placeholderTextColor={colors.mutedForeground}
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText("")} hitSlop={8}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.boardNote, { color: colors.mutedForeground }]}>
        Anonymous · All posts are reviewed before appearing
      </Text>

      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingBottom }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          searchText ? (
            <EmptyState icon="search" title="No results" subtitle={`No posts matching "${searchText}"`} />
          ) : (
            <EmptyState icon="message-square" title="No posts yet" subtitle="Be the first to share a thought or tip with the community." />
          )
        }
        renderItem={({ item }) => {
          const tag = tagInfo(item.tag);
          const repliesExpanded = expandedReplies.has(item.id);
          const isReplying = replyingTo === item.id;
          return (
            <PostCard
              item={item}
              tag={tag}
              colors={colors}
              repliesExpanded={repliesExpanded}
              isReplying={isReplying}
              replyText={replyText}
              replyMutationPending={replyMutation.isPending && replyingTo === item.id}
              getToken={getToken}
              onAgree={() => agreeMutation.mutate(item.id)}
              onToggleReplies={() => toggleReplies(item.id)}
              onStartReply={() => { setReplyingTo(item.id); setReplyText(""); }}
              onCancelReply={() => { setReplyingTo(null); setReplyText(""); }}
              onReplyTextChange={setReplyText}
              onReplySubmit={() => handleReplySubmit(item.id)}
            />
          );
        }}
      />

      {/* Compose modal */}
      <Modal visible={showCompose} animationType="slide" transparent onRequestClose={() => setShowCompose(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.composeSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.composeHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowCompose(false)}>
                <Text style={[styles.composeCancel, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.composeTitle, { color: colors.foreground }]}>New Post</Text>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!composeText.trim() || composeText.trim().length > MAX_CHARS || submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.composeSend, { color: composeText.trim() ? colors.primary : colors.mutedForeground }]}>
                    Submit
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Tag selector */}
            <Text style={[styles.tagLabel, { color: colors.mutedForeground }]}>Tag (optional)</Text>
            <View style={styles.tagRow}>
              {TAGS.map((t) => {
                const selected = composeTag === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.tagChip,
                      { borderColor: selected ? colors.primary : colors.border },
                      selected && { backgroundColor: colors.accent },
                    ]}
                    onPress={() => setComposeTag(selected ? null : t.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.tagChipEmoji}>{t.emoji}</Text>
                    <Text style={[styles.tagChipLabel, { color: selected ? colors.primary : colors.mutedForeground }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.composeInput, { color: colors.foreground }]}
              placeholder="Share a grocery tip, store experience, or honest thought…"
              placeholderTextColor={colors.mutedForeground}
              value={composeText}
              onChangeText={setComposeText}
              multiline
              maxLength={MAX_CHARS + 10}
              autoFocus
            />

            <Text style={[styles.charCount, { color: composeText.length > MAX_CHARS ? "#EF4444" : colors.mutedForeground }]}>
              {composeText.length}/{MAX_CHARS}
            </Text>

            {submitMutation.isError && (
              <Text style={[styles.errorText, { color: "#EF4444" }]}>
                {submitMutation.error instanceof Error ? submitMutation.error.message : "Submission failed"}
              </Text>
            )}

            <Text style={[styles.composeDisclaimer, { color: colors.mutedForeground }]}>
              Posts are anonymous and require admin approval before appearing.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── PostCard sub-component ────────────────────────────────────────────────────

interface PostCardProps {
  item: BoardPost;
  tag: typeof TAGS[number] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colors: any;
  repliesExpanded: boolean;
  isReplying: boolean;
  replyText: string;
  replyMutationPending: boolean;
  getToken: () => Promise<string | null>;
  onAgree: () => void;
  onToggleReplies: () => void;
  onStartReply: () => void;
  onCancelReply: () => void;
  onReplyTextChange: (t: string) => void;
  onReplySubmit: () => void;
}

function PostCard({
  item, tag, colors, repliesExpanded, isReplying, replyText,
  replyMutationPending, getToken, onAgree, onToggleReplies,
  onStartReply, onCancelReply, onReplyTextChange, onReplySubmit,
}: PostCardProps) {
  const { data: replies, isLoading: repliesLoading } = useQuery({
    queryKey: ["board-replies", item.id],
    queryFn: async (): Promise<BoardReply[]> => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board/${item.id}/replies`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<BoardReply[]>;
    },
    enabled: repliesExpanded,
  });

  return (
    <View style={[postStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Tag chip */}
      {tag && (
        <View style={[postStyles.tagBadge, { backgroundColor: colors.accent }]}>
          <Text style={postStyles.tagBadgeEmoji}>{tag.emoji}</Text>
          <Text style={[postStyles.tagBadgeLabel, { color: colors.primary }]}>{tag.label}</Text>
        </View>
      )}

      {/* Content */}
      <Text style={[postStyles.content, { color: colors.foreground }]}>{item.content}</Text>

      {/* Meta: region + time */}
      <Text style={[postStyles.meta, { color: colors.mutedForeground }]}>
        Anonymous{item.region ? ` · ${item.region}` : ""}{"  ·  "}{timeAgo(item.createdAt)}
      </Text>

      {/* Action bar */}
      <View style={postStyles.actions}>
        <TouchableOpacity
          style={[postStyles.actionBtn, item.userAgreed && { opacity: 1 }]}
          onPress={onAgree}
          activeOpacity={0.7}
        >
          <Feather
            name="thumbs-up"
            size={14}
            color={item.userAgreed ? colors.primary : colors.mutedForeground}
          />
          <Text style={[postStyles.actionLabel, { color: item.userAgreed ? colors.primary : colors.mutedForeground }]}>
            {item.agreeCount > 0 ? `${item.agreeCount} ` : ""}Agree
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={postStyles.actionBtn} onPress={onStartReply} activeOpacity={0.7}>
          <Feather name="corner-down-right" size={14} color={colors.mutedForeground} />
          <Text style={[postStyles.actionLabel, { color: colors.mutedForeground }]}>Reply</Text>
        </TouchableOpacity>

        {item.replyCount > 0 && (
          <TouchableOpacity style={postStyles.actionBtn} onPress={onToggleReplies} activeOpacity={0.7}>
            <Feather name={repliesExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
            <Text style={[postStyles.actionLabel, { color: colors.mutedForeground }]}>
              {item.replyCount} {item.replyCount === 1 ? "reply" : "replies"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Inline reply input */}
      {isReplying && (
        <View style={[postStyles.replyBox, { borderTopColor: colors.border }]}>
          <TextInput
            style={[postStyles.replyInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            placeholder="Write a reply…"
            placeholderTextColor={colors.mutedForeground}
            value={replyText}
            onChangeText={onReplyTextChange}
            multiline
            maxLength={MAX_CHARS + 10}
            autoFocus
          />
          <View style={postStyles.replyActions}>
            <TouchableOpacity onPress={onCancelReply}>
              <Text style={[postStyles.replyCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onReplySubmit}
              disabled={!replyText.trim() || replyMutationPending}
            >
              {replyMutationPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[postStyles.replySubmit, { color: replyText.trim() ? colors.primary : colors.mutedForeground }]}>
                  Submit
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <Text style={[postStyles.replyDisclaimer, { color: colors.mutedForeground }]}>
            Replies require admin approval before appearing.
          </Text>
        </View>
      )}

      {/* Expanded replies */}
      {repliesExpanded && (
        <View style={[postStyles.repliesSection, { borderTopColor: colors.border }]}>
          {repliesLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ padding: 8 }} />
          ) : !replies?.length ? (
            <Text style={[postStyles.noReplies, { color: colors.mutedForeground }]}>No approved replies yet.</Text>
          ) : (
            replies.map((r) => (
              <View key={r.id} style={[postStyles.replyCard, { borderLeftColor: colors.border }]}>
                <Text style={[postStyles.replyContent, { color: colors.foreground }]}>{r.content}</Text>
                <Text style={[postStyles.replyMeta, { color: colors.mutedForeground }]}>
                  Anonymous{r.region ? ` · ${r.region}` : ""}{"  ·  "}{timeAgo(r.createdAt)}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  composeBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  banner: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  bannerQuote: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
    fontStyle: "italic",
  },
  bannerRules: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  boardNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  ineligibleWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  ineligibleCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  ineligibleTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  ineligibleSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 16, textAlign: "center" },
  requirementRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  requirementText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  ineligibleNote: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 12, textAlign: "center" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  composeSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  composeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  composeTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  composeCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  composeSend: { fontSize: 15, fontFamily: "Inter_700Bold" },
  tagLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagChipEmoji: { fontSize: 13 },
  tagChipLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  composeInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  charCount: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right", marginBottom: 8 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
  composeDisclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});

const postStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  tagBadgeEmoji: { fontSize: 11 },
  tagBadgeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  content: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 16, marginTop: 2 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  replyBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  replyInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
  replyActions: { flexDirection: "row", justifyContent: "flex-end", gap: 16 },
  replyCancel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  replySubmit: { fontSize: 14, fontFamily: "Inter_700Bold" },
  replyDisclaimer: { fontSize: 11, fontFamily: "Inter_400Regular" },
  repliesSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  noReplies: { fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  replyCard: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    gap: 4,
  },
  replyContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  replyMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
