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

**Why:** the receipt-merge endpoint loads + row-locks receipts while LEFT JOINing
stores (to read the store name). Locking the nullable joined side is illegal, so
every merge 500'd. Only e2e (real DB round-trip) caught it — typecheck and curl
of unrelated paths did not.

**How to apply:** any time you add `.for("update"/"share"/...)` to a Drizzle
query that has a `leftJoin`/`rightJoin`/`fullJoin`, pass `{ of: <table you
actually need locked> }`. Prefer locking only the table whose rows you mutate.
