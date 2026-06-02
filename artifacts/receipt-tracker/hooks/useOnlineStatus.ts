import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * Reactive online/offline status from React Query's `onlineManager`. On web
 * (incl. the installed PWA) this tracks the browser's `online`/`offline`
 * events; on native it tracks real device connectivity via NetInfo, which is
 * wired into `onlineManager` in `lib/queryClient.ts`. So the offline UI works
 * on iOS/Android as well as web.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}
