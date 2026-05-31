---
name: Global catalog mapping layer
description: Why the admin cross-user price catalog must stay separate from users' private data
---

The admin "global catalog" (cross-user prices + name management) is a **mapping layer
on top of** users' private rows — it must never mutate or expose them.

**Why:** Users' stores/items/receipts are strictly private (per-user `userId`, scoped by
`requireAuth`). The catalog aggregates across everyone for admins without revealing whose
data it is. Merge/rename/split operate only on the catalog/alias mapping tables.

**How to apply:**
- Never write to user tables (`items`/`stores`/`receipts`/`line_items`) from any catalog
  operation. Only canonical + alias tables change.
- The JS normalize function and the SQL join key are a matched pair — if you change how
  names are normalized in one, change the other in lockstep, or the alias join silently
  drops rows.
- Merge suggestions use a looser key (alphanumeric-only) and must only *suggest*, never
  auto-merge — different products can collapse to the same loose key.
- "Most recent price" is a per-group latest, not a min/avg aggregate; preserve the
  sort-then-take-first semantics if you move it into SQL.
- Splitting the last remaining alias out of an entry leaves an orphan canonical; guard
  against it (reject, or delete the emptied canonical transactionally).
