import React, { useCallback, useEffect, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Updates from "expo-updates";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { tabBarClearance } from "@/lib/tabBar";

// How often (web, tab open) we ask the browser to re-check sw.js for a new
// build. The check is a cheap conditional GET (sw.js is served no-cache), so a
// user who keeps the app open during a republish is told within ~a minute
// instead of waiting for the browser's own ~24h update cadence.
const UPDATE_POLL_MS = 60_000;

/**
 * "A new version is available" prompt, for both delivery mechanisms.
 *
 * On web the service worker (server/serve.js) uses skipWaiting/clients.claim, so
 * a new build auto-applies on the NEXT launch — but a user with the tab already
 * open keeps running the old shell until they fully close and reopen.
 *
 * On native the equivalent is expo-updates: it checks on launch and downloads in
 * the background, but only swaps the new bundle in on the launch AFTER that. So
 * a fix a user already has sitting on disk goes unused until they happen to cold
 * start twice — which, for an app people open once a shop, can be days.
 *
 * Both cases get the same treatment: a non-intrusive banner the moment the new
 * version is ready to run, with an action that applies it now. Dismissing leaves
 * the current session untouched (the update still applies on the next launch).
 */
export function UpdatePrompt() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [webAvailable, setWebAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Native only in practice — on web this reports nothing, since expo-updates
  // resolves to a stub there.
  const { isUpdatePending } = Updates.useUpdates();

  // expo-updates checks once at launch. A session left open for days would never
  // check again, so re-check on every return to the foreground. No-ops in dev
  // builds and Expo Go, where `isEnabled` is false.
  useEffect(() => {
    if (Platform.OS === "web" || !Updates.isEnabled) return;
    const check = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline, or the update server is unreachable. Nothing to recover — the
        // next foreground (or launch) tries again.
      }
    };
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;
    let pollId: ReturnType<typeof setInterval> | undefined;

    // A newly-installed worker only means an UPDATE (not first-ever install)
    // when a controller already exists for this page.
    const markUpdated = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          setWebAvailable(true);
        }
      };
      check();
      worker.addEventListener("statechange", check);
    };

    const onUpdateFound = () => {
      markUpdated(registration?.installing ?? null);
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      registration = reg;
      // A worker may already be waiting/installing before this listener attaches.
      markUpdated(reg.waiting);
      markUpdated(reg.installing);
      reg.addEventListener("updatefound", onUpdateFound);
      pollId = setInterval(() => {
        reg.update().catch(() => {});
      }, UPDATE_POLL_MS);
    });

    return () => {
      if (pollId) clearInterval(pollId);
      registration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  const isWeb = Platform.OS === "web";

  const apply = useCallback(() => {
    if (isWeb) {
      if (typeof window !== "undefined") window.location.reload();
      return;
    }
    // Swaps in the already-downloaded bundle. Failure is not worth surfacing —
    // the update still applies on the next launch either way.
    void Updates.reloadAsync().catch(() => {});
  }, [isWeb]);

  const available = isWeb ? webAvailable : isUpdatePending;
  if (!available || dismissed) return null;

  // "Reload" is the web verb for it; on a phone the app restarts.
  const actionLabel = isWeb ? "Reload" : "Restart";

  return (
    // Floats above the tab bar rather than behind it. The banner is mounted at
    // the root, so it can appear over a tab screen or a plain one; sitting a
    // little high on the latter is the better trade.
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: tabBarClearance(insets.bottom, 16) }]}
    >
      <View
        style={[
          styles.banner,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Feather name="download" size={16} color={colors.primary} />
        <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={2}>
          A new version is available.
        </Text>
        <Pressable
          onPress={apply}
          style={[styles.reloadBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} to update`}
        >
          <Text style={[styles.reloadText, { color: colors.primaryForeground }]}>
            {actionLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setDismissed(true)}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notice"
          hitSlop={8}
        >
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    padding: 16,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    maxWidth: 440,
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  reloadBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  reloadText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dismissBtn: { padding: 2 },
});
