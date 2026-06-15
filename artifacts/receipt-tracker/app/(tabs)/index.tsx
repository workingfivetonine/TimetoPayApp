import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  useListReceipts,
  useDeleteReceipt,
  getListReceiptsQueryKey,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useDesktop } from "@/hooks/useDesktop";
import { ReceiptCard } from "@/components/ReceiptCard";
import { EmptyState } from "@/components/EmptyState";
import { ListControls, type SortOption } from "@/components/ListControls";
import { ShareInvite } from "@/components/ShareInvite";
import { OfflineBanner } from "@/components/OfflineBanner";
import { WelcomeTour } from "@/components/WelcomeTour";

type ReceiptSort = "recent" | "price" | "store";
const RECEIPT_SORT: SortOption<ReceiptSort>[] = [
  { key: "recent", label: "Recent" },
  { key: "price", label: "Price" },
  { key: "store", label: "Store" },
];

export default function ReceiptsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ReceiptSort>("recent");
  const [showCelebrate, setShowCelebrate] = useState(false);

  // After a successful subscription checkout the user is returned to
  // `/?checkout=success` (Stripe success_url + the PayPal finalize redirect).
  // Show a one-time celebration + share prompt, then strip the query param so a
  // refresh doesn't re-trigger it. Web-only (native is never paywalled).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    setShowCelebrate(true);
    params.delete("checkout");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    );

    // The subscription is activated by the Stripe webhook, which can arrive a
    // moment AFTER Stripe redirects the user back here. Poll the current-user
    // query a few times so entitlement flips to active on its own — without this
    // the app keeps showing the pre-payment (locked) state until a manual reload.
    let cancelled = false;
    let attempts = 0;
    const key = getGetCurrentUserQueryKey();
    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      await queryClient.invalidateQueries({ queryKey: key });
      const fresh = queryClient.getQueryData<{ entitlement?: { entitled?: boolean } }>(key);
      if (fresh?.entitlement?.entitled || attempts >= 6) return;
      setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const { data: receipts, isLoading, dataUpdatedAt } = useListReceipts();
  const deleteMutation = useDeleteReceipt();
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasReceipts = (receipts?.length ?? 0) > 0;
  const visibleReceipts = useMemo(() => {
    const all = (receipts ?? []).filter((r) => r.id !== pendingDeleteId);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (r) =>
            r.storeName.toLowerCase().includes(q) ||
            (r.notes ?? "").toLowerCase().includes(q),
        )
      : [...all];
    filtered.sort((a, b) => {
      if (sortKey === "price") return b.total - a.total;
      if (sortKey === "store") return a.storeName.localeCompare(b.storeName);
      return new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime();
    });
    return filtered;
  }, [receipts, query, sortKey, pendingDeleteId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    setRefreshing(false);
  };

  const commitDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() }) },
    );
  };

  const handleDelete = async (id: number) => {
    // If another receipt is pending deletion, commit it immediately.
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
      if (pendingDeleteId !== null && pendingDeleteId !== id) {
        commitDelete(pendingDeleteId);
      }
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingDeleteId(id);
    undoTimerRef.current = setTimeout(() => {
      setPendingDeleteId(null);
      undoTimerRef.current = null;
      commitDelete(id);
    }, 4000);
  };

  const handleUndoDelete = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingDeleteId(null);
  };

  const isDesktop = useDesktop();
  const paddingTop = isDesktop ? 32 : Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = isDesktop ? 24 : Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Receipts</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.scanBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/scan")}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={18} color="#fff" />
            <Text style={styles.scanBtnText}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.accountBtn, { backgroundColor: colors.secondary }]}
            onPress={() => router.push("/account")}
            activeOpacity={0.8}
            accessibilityLabel="Account"
          >
            <Feather name="user" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <OfflineBanner lastUpdated={dataUpdatedAt} />

      {hasReceipts ? (
        <ListControls
          query={query}
          onQueryChange={setQuery}
          placeholder="Search receipts…"
          sortOptions={RECEIPT_SORT}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
        />
      ) : null}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleReceipts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom },
            visibleReceipts.length === 0 && styles.emptyList,
          ]}
          scrollEnabled={visibleReceipts.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="file-text"
              title={query ? "No matching receipts" : "No receipts yet"}
              subtitle={
                query
                  ? "Try a different search."
                  : "Tap Scan to photograph a receipt and track your spending"
              }
            />
          }
          renderItem={({ item }) => (
            <ReceiptCard
              receipt={item}
              onPress={() => router.push(`/receipt/${item.id}`)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
        />
      )}

      <Modal
        visible={showCelebrate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCelebrate(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalIcon, { backgroundColor: colors.accent }]}>
              <Feather name="check-circle" size={30} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              You're all set!
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              Thanks for subscribing. Know someone who'd love TimetoPay? Share it
              with them.
            </Text>
            <ShareInvite
              style={styles.modalShare}
              title="Love it? Share it"
              subtitle="Tell friends & family about TimetoPay"
            />
            <TouchableOpacity
              style={[styles.modalDone, { backgroundColor: colors.primary }]}
              onPress={() => setShowCelebrate(false)}
              activeOpacity={0.85}
            >
              <Text style={[styles.modalDoneText, { color: colors.primaryForeground }]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <WelcomeTour />

      {/* Undo-delete banner — floats at the bottom for 4 seconds after a receipt is deleted */}
      {pendingDeleteId !== null && (
        <View style={[styles.undoBanner, { backgroundColor: colors.foreground }]}>
          <Text style={[styles.undoText, { color: colors.background }]}>Receipt deleted</Text>
          <TouchableOpacity onPress={handleUndoDelete} activeOpacity={0.7}>
            <Text style={[styles.undoAction, { color: colors.primary }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
  },
  accountBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyList: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalSheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  modalTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  modalShare: { alignSelf: "stretch", marginTop: 6 },
  modalDone: {
    alignSelf: "stretch",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  modalDoneText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  undoBanner: {
    position: "absolute",
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  undoText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  undoAction: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
