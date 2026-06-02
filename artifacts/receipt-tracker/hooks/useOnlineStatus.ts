import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * Reactive online/offline status from React Query's `onlineManager`. On web
 * (incl. the installed PWA) this tracks the browser's `online`/`offline`
 * events. On native it reports online unless NetInfo is wired into the manager,
 * so the offline UI is effectively web-only — matching where offline launch
 * (the cached app shell) actually applies.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}
