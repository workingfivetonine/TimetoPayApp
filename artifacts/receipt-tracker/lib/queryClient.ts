import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

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
