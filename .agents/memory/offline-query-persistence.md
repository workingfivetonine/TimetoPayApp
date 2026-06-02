---
name: Offline query persistence (receipt-tracker)
description: How read-only offline data viewing is implemented via React Query persistence, and the version pin it depends on.
---

Offline viewing of the user's data (shopping list, receipts, stores) is done with
React Query cache persistence, NOT service-worker `/api` caching (the SW
deliberately bypasses `/api` because data is per-user + auth'd).

Key pieces:
- `PersistQueryClientProvider` + `createAsyncStoragePersister` (AsyncStorage works
  on web/localStorage and native). `gcTime` must be >= persist `maxAge` or queries
  get evicted from memory before they can be restored.
- Per-user scoping reuses the existing user-switch cache clear: on `userId` change
  call `persister.removeClient()` THEN `qc.clear()`, so a reload can't restore a
  previous account's data. `shouldDehydrateMutation: () => false` keeps it strictly
  read-only (no paused mutations resurrected on reconnect).
- Offline detection uses React Query's `onlineManager` (browser online/offline
  events). On native it always reports online unless NetInfo is wired in, so the
  offline banner is effectively web/PWA-only — which matches where the cached app
  shell (offline launch) applies anyway.

**Why the version pin matters:** the persist packages
(`@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`)
must be pinned to the EXACT same version as the resolved `@tanstack/react-query`
(they were pinned to `5.100.9` in the catalog). A caret range let them resolve to a
newer patch and pulled a SECOND `@tanstack/query-core`, which breaks cross-package
context/instanceof. If you bump react-query, bump these in lockstep.
