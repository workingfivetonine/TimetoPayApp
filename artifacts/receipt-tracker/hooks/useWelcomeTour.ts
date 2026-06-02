import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Per-device, per-user flag so the first-run feature tour shows once per account
// on a given device. Bump the version suffix to re-show the tour to everyone
// (e.g. after a major feature change).
const storageKey = (userId: string) => `welcomeTourSeen:v1:${userId}`;

/**
 * Tracks whether the first-run welcome tour should be shown for the given user.
 *
 * Pass `null`/`undefined` until the user is loaded AND onboarding (region/plan)
 * is complete — the hook stays hidden until a real user id arrives, then checks
 * AsyncStorage exactly once. `dismiss()` persists the seen flag and hides it.
 */
export function useWelcomeTour(userId: string | null | undefined) {
  const [status, setStatus] = useState<"loading" | "show" | "hide">("loading");

  useEffect(() => {
    let active = true;
    if (!userId) {
      setStatus("hide");
      return;
    }
    AsyncStorage.getItem(storageKey(userId))
      .then((seen) => {
        if (active) setStatus(seen ? "hide" : "show");
      })
      .catch(() => {
        // If storage is unavailable, fail closed (don't nag on every launch).
        if (active) setStatus("hide");
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const dismiss = useCallback(() => {
    setStatus("hide");
    if (userId) {
      AsyncStorage.setItem(storageKey(userId), "1").catch(() => {
        // Best-effort; worst case the tour reappears next launch.
      });
    }
  }, [userId]);

  return { visible: status === "show", dismiss };
}
