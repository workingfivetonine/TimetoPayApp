---
name: Cache invalidation footprint for cascading mutations
description: Which React Query keys to invalidate when deleting stores/items, because DB FK cascades ripple through many derived views
---

# Cascading mutations must invalidate the full derived-data footprint

DB foreign keys cascade: deleting a **store** → its receipts → their line items; deleting an **item** → its line items. So a single delete silently changes many server-derived views, and each affected React Query cache must be invalidated or the UI shows stale data until manual refresh.

**On store OR item delete, invalidate all of:**
- shopping list (`getGetShoppingListQueryKey`)
- items list (`getListItemsQueryKey`)
- receipts list (`getListReceiptsQueryKey`) + predicate for any key starting `/api/receipts` (covers per-receipt detail queries)
- weekly spend (`getGetSpendAnalyticsQueryKey`) **and** daily/calendar spend (`getGetDailySpendQueryKey`) — easy to forget the daily one
- store analytics detail via predicate for keys starting `/api/analytics/stores` (summary + visits used by `app/store/[id].tsx`)
- stores list (`getListStoresQueryKey`) — store delete only

**Why:** A prior review failed the work for missing `getGetDailySpendQueryKey` and the `/api/analytics/stores` predicate. The non-obvious part is that analytics has *two separate* spend endpoints and per-store detail queries that don't share a parent key.

**How to apply:** Any future mutation that adds/removes receipts or line items (scan/parse-and-save already does its own; new bulk-edit or delete flows) should replicate this same invalidation set.

# Destructive confirm helper

`artifacts/receipt-tracker/lib/confirm.ts` `confirmDestructive()` — Alert.alert on native, `window.confirm` on web. **Web fallback when `globalThis.confirm` is unavailable must default to cancel (no-op), never auto-confirm** — auto-confirming a destructive action is a safety bug.
