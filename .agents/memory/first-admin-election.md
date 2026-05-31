---
name: First-admin election
description: How to safely elect exactly one admin as "the first account ever created" under concurrency.
---

# First-admin election must be DB-atomic

When a feature says "the first account ever created becomes admin," do NOT derive
admin from a pre-insert `SELECT count(*) == 0` and then insert with that boolean.
Two concurrent first sign-ins both read count=0 and both become admin (separate
PKs, no conflict) — a real privilege-escalation race.

**Why:** Read-then-write across separate statements is not atomic under READ
COMMITTED; the gap between the count and the insert lets both racers win.

**How to apply:**
- Enforce the invariant at the DB level with a partial unique index so at most one
  row can hold the flag: `uniqueIndex(...).on(table.isAdmin).where(sql\`${table.isAdmin}\`)`
  (Postgres: `UNIQUE ... WHERE is_admin`).
- Provision the user as a non-admin first (idempotent `onConflictDoNothing`), then
  attempt to claim admin with a single guarded UPDATE:
  `SET is_admin=true WHERE id=$me AND NOT EXISTS (SELECT 1 FROM users u WHERE u.is_admin=true)`.
  The NOT EXISTS guard avoids contention in steady state; the partial unique index
  makes the loser's UPDATE raise a unique violation, which you swallow so they stay
  a normal user.
- Run any one-time side effect (e.g. backfilling legacy ownerless rows to the admin)
  only when that guarded UPDATE actually returned a row, so exactly one account runs it.
