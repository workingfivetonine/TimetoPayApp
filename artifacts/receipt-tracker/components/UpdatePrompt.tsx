import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

// How often (web, tab open) we ask the browser to re-check sw.js for a new
// build. The check is a cheap conditional GET (sw.js is served no-cache), so a
// user who keeps the app open during a republish is told within ~a minute
// instead of waiting for the browser's own ~24h update cadence.
const UPDATE_POLL_MS = 60_000;

/**
 * Web-only "a new version is available" prompt.
 *
 * The service worker (server/serve.js) uses skipWaiting/clients.claim, so a new
 * build auto-applies on the NEXT launch — but a user with the tab already open
 * keeps running the old shell until they fully close and reopen. This surfaces a
 * non-intrusive banner the moment a new worker finishes installing, with a
 * Reload action that swaps in the fresh shell. Dismissing keeps the current
 * session untouched (the update still applies on the next natural launch).
 */
export function UpdatePrompt() {
  const colors = useColors();
  const [available, setAvailable] = useState(false);

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
          setAvailable(true);
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

  const reload = useCallback(() => {
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  if (Platform.OS !== "web" || !available) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
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
          onPress={reload}
          style={[styles.reloadBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Reload to update"
        >
          <Text style={[styles.reloadText, { color: colors.primaryForeground }]}>
            Reload
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setAvailable(false)}
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
