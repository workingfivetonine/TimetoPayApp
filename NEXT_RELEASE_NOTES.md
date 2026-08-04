# Next Release — Notes & Requests (opened 2026-07-26)

Internal punch list for the next TimetoPay release. Not yet implemented — this is a planning doc only.

---

## 1. Community board: message delete/edit permissions

**Ask:** Admins should be able to delete any message. Members should be able to edit and delete their own messages.

**Current state (confirmed in code):** No live post can be edited or deleted at all today — by anyone.
- `artifacts/receipt-tracker/app/(tabs)/board.tsx` — member board UI, `PostCard` (~lines 698-866). Action bar (~767-807) has Agree / Thanks / Reply / reply-count toggle, but no Edit or Delete, even for the author's own posts (`item.isOwn` is only used for the "My Posts" filter and the "You" label, not for authorization).
- `artifacts/receipt-tracker/app/admin/board.tsx` — admin moderation screen only handles the **pending** queue (Approve/Reject, ~lines 155-180 → `POST /api/board/admin/:id/approve|reject`). No action exists for already-approved/live posts.
- `artifacts/api-server/src/routes/board.ts` — confirms no delete/edit endpoints exist server-side at all: only `POST /` (create), `POST /:id/agree`, `POST /:id/thanks`, `POST /:id/replies`, and the admin approve/reject routes (~400-454, including replies).

**To build:**
- API: `DELETE /api/board/:id` (admin: any post; author: own post only) and similarly for replies; `PATCH /api/board/:id` for author-only edits.
- UI: Delete button on every post for admins (`admin/board.tsx` and/or inline in `board.tsx` when viewing as admin); Edit + Delete buttons on `PostCard`'s action bar when `item.isOwn`.
- Decide: should an edited post re-enter the moderation queue, or edit-in-place? Should delete be soft (hidden/audit trail) or hard?

---

## 2. Filter bar gets clipped/hidden — needs to be lengthened

**Ask:** The filter line becomes hidden and needs more room.

**Current state:** No single confirmed culprit yet, but these are the filter-pill rows in the app, and the community board one is missing an explicit height on its scroll row — a common cause of collapsed/clipped rows on web (react-native-web):
- `artifacts/receipt-tracker/app/(tabs)/board.tsx` — horizontal filter-pill row, `filterScroll`/`filterRow` styles (~975-993, rendered ~481-548), no explicit height on the `ScrollView`.
- `artifacts/receipt-tracker/components/ListControls.tsx` — shared sort/filter row (`controls` style, ~91-99), reused by Shopping List (`app/(tabs)/shopping.tsx:253`), Catalog (`app/catalog.tsx:223`), and Admin Global Prices (`app/admin/global.tsx:104`).
- `artifacts/receipt-tracker/components/ShoppingListPdfModal.tsx` — filter bar + category/store chip scrollers (`filterBar`/`filterRow` ~526-570; `chipScroll` at 836 has `flexGrow: 0`, no height).

**Next step:** Get a screenshot/repro of which screen it happens on (board vs. shopping list vs. PDF export modal vs. admin) so we fix the right component — likely just needs a min-height or to drop a `flexGrow: 0` / `overflow: hidden` that's clipping on web.

---

## 3. Admin new-user notifications: show usernames + much more user info (incl. password reset)

**Ask:** Admin notifications about new users should list usernames. Generally want a lot more info on users, including password reset.

**Current state:**
- Admin digest email — `artifacts/api-server/src/lib/adminDigest.ts`, `computeAdminDigest()` (~75-146): reports new users/catalog items/stores since last send, but user rows are just `email ?? id` (line 135) — **no username**. Sent via Loops (`LOOPS_TRANSACTIONAL_ADMIN_DIGEST_ID`) to the single admin (`resolveAdminRecipient()`, ~65-71). Schedule/cursor logic in `adminDigestScheduler.ts` + `lib/db/src/schema/adminNotifications.ts`.
- Admin user list — `artifacts/receipt-tracker/app/admin.tsx` (~69-82): shows email, role badge, receipt/store/item counts, total spend. No username.
- Admin user detail — `artifacts/receipt-tracker/app/admin/[userId].tsx`: shows email (title, line 163), role selector, "post without review" toggle, merge-into-user, delete-user, receipt list. No username field, no password-reset action.

**Constraint to flag:** Auth is Clerk-based (`@clerk/expo`) — per `replit.md`, "self-service password reset is user-initiated on the sign-in screen (Clerk has no admin 'send reset email' API)." So an admin-triggered password reset would need to either (a) call Clerk's backend API to force a reset / send a reset link server-side (needs checking what Clerk's backend SDK actually exposes), or (b) just be a documented instruction to tell the user to use the self-service flow. Need to confirm which is feasible before committing to "password reset" as a real admin button.

**To build:**
- Add `username` to the digest email row and to both admin user list/detail screens.
- Scope out "a lot more info" — candidates: signup date, last login/active date, subscription/trial status, verified email status, country, number of devices, referral/promo code used.
- Decide password-reset approach per the constraint above before promising it in the UI.

---

*Doc created for planning purposes; update/checkbox items as they ship.*
