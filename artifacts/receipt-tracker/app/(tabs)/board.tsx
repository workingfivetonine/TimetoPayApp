import React, { useState } from "react";
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

const MAX_CHARS = 500;

interface BoardPost {
  id: number;
  content: string;
  createdAt: string;
}

interface BoardData {
  eligible: boolean;
  missingRequirements: string[];
  posts: BoardPost[];
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

export default function BoardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDesktop = useDesktop();
  const locked = usePremiumLock();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState("");

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

  const submitMutation = useMutation({
    mutationFn: async (content: string) => {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/board`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
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
      setShowCompose(false);
    },
  });

  const handleSubmit = () => {
    const text = composeText.trim();
    if (!text || text.length > MAX_CHARS) return;
    submitMutation.mutate(text);
  };

  if (locked) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Community</Text>
        </View>
        <PremiumUpsell />
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

  // Subscribed but additional requirements not yet met
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

  const posts = data?.posts ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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

      <Text style={[styles.boardNote, { color: colors.mutedForeground }]}>
        Anonymous · All posts are reviewed before appearing
      </Text>

      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="message-square"
            title="No posts yet"
            subtitle="Be the first to share a thought or tip with the community."
          />
        }
        renderItem={({ item }) => (
          <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.postContent, { color: colors.foreground }]}>{item.content}</Text>
            <Text style={[styles.postTime, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
          </View>
        )}
      />

      {/* Compose modal */}
      <Modal
        visible={showCompose}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCompose(false)}
      >
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
                  <Text
                    style={[
                      styles.composeSend,
                      { color: composeText.trim() ? colors.primary : colors.mutedForeground },
                    ]}
                  >
                    Submit
                  </Text>
                )}
              </TouchableOpacity>
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

            <Text
              style={[
                styles.charCount,
                { color: composeText.length > MAX_CHARS ? "#EF4444" : colors.mutedForeground },
              ]}
            >
              {composeText.length}/{MAX_CHARS}
            </Text>

            {submitMutation.isError && (
              <Text style={[styles.errorText, { color: "#EF4444" }]}>
                {submitMutation.error instanceof Error
                  ? submitMutation.error.message
                  : "Submission failed"}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
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
  boardNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  postCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  postTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
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
    marginBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  composeTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  composeCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  composeSend: { fontSize: 15, fontFamily: "Inter_700Bold" },
  composeInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    minHeight: 120,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  charCount: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right", marginBottom: 8 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
  composeDisclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
