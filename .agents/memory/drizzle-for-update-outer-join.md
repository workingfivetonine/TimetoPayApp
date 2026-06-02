---
name: Drizzle FOR UPDATE over an outer join
description: Row-locking a query that LEFT JOINs another table errors in Postgres unless you scope the lock with `of`.
---

Postgres rejects `SELECT ... FOR UPDATE` when the statement contains an outer
(LEFT) join, with: `FOR UPDATE cannot be applied to the nullable side of an
outer join`. In Drizzle this means a bare `.for("update")` on a query that uses
`.leftJoin(...)` throws at runtime (500), even though it typechecks fine.

**Fix:** scope the lock to the non-nullable table(s):
`.for("update", { of: receiptsTable })` → emits `FOR UPDATE OF receipts`.

**Why:** locking the nullable joined side is illegal in Postgres, so any
row-locked read that also LEFT JOINs a lookup table (e.g. receipts + store name)
fails at runtime. Symptom pattern: feature works in typecheck but 500s on the
real DB round-trip — only e2e against the database catches it.

**How to apply:** any time you add `.for("update"/"share"/...)` to a Drizzle
query that has a `leftJoin`/`rightJoin`/`fullJoin`, pass `{ of: <table you
actually need locked> }`. Prefer locking only the table whose rows you mutate.
