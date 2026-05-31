---
name: Shopping-list membership & dismissal
description: The active-list-membership rule is duplicated across two API routes and must stay in sync.
---

# Shopping-list membership / dismissal

An item is "active" on a user's shopping list when:
- it has purchase history (`lineItems` -> `receipts`, latest `purchasedAt`) OR it was
  explicitly added (`itemsTable.addedToListAt` is set), AND
- it is NOT dismissed at/after its most recent event:
  `dismissedAt >= max(lastPurchased, ranOutAt, addedToListAt)`.

**Why:** This rule lives in BOTH `routes/shoppingList.ts` (what the list shows) and
`routes/catalog.ts` browse (the per-item `inList` flag). They were already out of sync
once — browse originally treated `inList` as just `addedToListAt != null`, which broke
both "already on list" detection and re-adding dismissed items. The architect flagged it.

**How to apply:** If you change the membership or dismissal semantics in one route,
change the other in lockstep (or extract a shared helper). Re-adding a dismissed item
via `POST /catalog/add-to-list` must refresh `addedToListAt` AND clear `dismissedAt`,
otherwise it stays hidden. `add-to-list` dedupes against the user's existing item by ANY
normalized alias of the canonical catalog item (not just the canonical name).
