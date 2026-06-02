import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { Platform } from "react-native";

// Wire the device's real connectivity into React Query's onlineManager. On web
// the default listener already tracks the browser's online/offline events, but
// on native React Query assumes "always online" unless NetInfo is plugged in —
// so without this the offline banner never shows and queries never pause when a
// device loses signal (the spotty-grocery-store case). We only override the
// listener on native to leave the proven web behavior untouched.
if (Platform.OS !== "web") {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null until the first probe resolves; treat null
      // as reachable and fall back to `isConnected` so we don't flash "offline"
      // on launch before the reachability check completes.
      const reachable =
        state.isInternetReachable ?? state.isConnected ?? true;
      setOnline(!!reachable);
    }),
  );
}

// How long a persisted/cached query is considered usable for offline viewing.
// The offline banner surfaces the actual "last updated" time so stale data is
// never silently trusted; a week keeps an occasional shopper's list readable.
export const OFFLINE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

// gcTime must be >= the persist maxAge so React Query doesn't evict an inactive
// query from memory before it can be persisted / restored for offline use.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: OFFLINE_CACHE_MAX_AGE,
    },
  },
});

// AsyncStorage is backed by localStorage on web and native storage on device,
// so a single persister works for the PWA and Expo Go builds alike.
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "rt-rq-cache",
});
