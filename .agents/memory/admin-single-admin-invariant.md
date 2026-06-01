---
name: Single-admin invariant
description: How Receipt Tracker guarantees exactly one master admin and never reaches a zero-admin state
---

# Single-admin invariant

The app must always have exactly one `isAdmin=true` user (enforced by a unique
partial index) whose `role` mirrors it (`master_admin` <=> `isAdmin`).
`family`/`general` roles are **labels only** — they grant nothing and share no data.

**Rule:** any admin mutation that could remove the last admin must be guarded or
must roll back, and the system must be able to self-heal on restart.

**Why:** role transfer demotes the current master before promoting the target. A
concurrent delete of the target (or any partial failure) could otherwise commit
the demotion while the promote hits 0 rows, leaving the app permanently
admin-less — and election only runs for brand-new signups, so existing users
can't recover it.

**How to apply:**
- Role transfer (`PATCH /admin/users/:id/role` to master_admin) runs in a txn:
  lock the target row `FOR UPDATE`, demote, then promote and assert the promote
  returned exactly 1 row (throw to roll back otherwise; 404 if target gone).
- Never demote/delete/merge the current master directly — must transfer
  master_admin first (guards live in `admin.ts`).
- **Every user-removal path needs the guard, not just transfer.** A plain
  `if (target.isAdmin) 400` check followed by an unconditional delete is racy: a
  concurrent transfer can promote that user between check and delete, leaving
  zero admins. Both `DELETE /admin/users/:id` and `POST /admin/users/merge` must
  delete conditionally — `where id=:id AND isAdmin=false` and assert the affected
  row count (merge also locks the source `FOR UPDATE` inside its txn). Any future
  bulk/cascade user-deletion must do the same.
- Startup safety net `ensureAdminExists()` in `bootstrap.ts`: if users exist but
  none is admin, promote the earliest-created user to master_admin. Idempotent.
