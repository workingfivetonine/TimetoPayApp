# Follow-ups

Deferred technical work. Nothing here blocks a release; each was consciously
postponed with a reason.

---

## Android: enable R8 minification

**Why deferred:** the failure mode is bad — builds fine, passes review, then
crashes for real users on a specific screen.

Play Console reports **App optimization: Low** (obfuscation 4%, shrinking and R8
config blank). No ProGuard/R8 settings exist, so the build uses Expo's defaults
with minification off.

Two lines in the `expo-build-properties` block already in
[app.json](../artifacts/receipt-tracker/app.json):

```json
"android": {
  "enableProguardInReleaseBuilds": true,
  "enableShrinkResourcesInReleaseBuilds": true
}
```

**Payoff:** roughly 10–20% off the Android download. Nothing off the JS bundle,
which is most of the app.

**Risk:** R8 strips code it believes unused, and anything reached by reflection —
which native modules do — can disappear silently. Before shipping a minified
build, exercise on a real device: scan, camera, PDF import, share-to-app, auth,
and the Loops email triggers.

**Note the score is misleading.** Play measures Java/Kotlin bytecode. Almost all
of this app is JavaScript compiled to Hermes, which Play cannot see. "4%
obfuscation" describes the slice it can measure, which is mostly library code.

Play's *"Upgrade to AGP version 9.0"* suggestion is **not actionable** — Expo SDK
54 pins the Android Gradle Plugin. It comes with a future SDK bump.

> `Memory page size: Supports 16 KB` already **passes**. That is the only item
> here with a real Google deadline.

---

## Restore the personalised trip-receipt copy

`trip_receipt_missing` currently reads *"you finished a shop recently"*. It used
to name the item count and days elapsed, but Loops rejects `{event.x}` for
properties it has never observed, and that event had never fired because its Loop
trigger was misspelled `Trip_receipt_inactivity`.

The trigger is fixed now. Once real trips have fired it a few times, Loops will
recognise `itemsPicked` and `daysSince`, and the specific line can come back. The
exact line to restore is kept in a comment beside it in
[build.mjs](../email-templates/build.mjs).

---

## Decide what to do with the orphaned unsubscribe code

[`lib/email/unsubscribe.ts`](../artifacts/api-server/src/lib/email/unsubscribe.ts)
implements HMAC-signed one-click unsubscribe (RFC 8058) and
[`routes/emailPrefs.ts`](../artifacts/api-server/src/routes/emailPrefs.ts) serves
it. It works, and **`buildUnsubscribeUrl` has zero call sites** — it was stranded
when the move to Loops made `{unsubscribe_link}` take over.

Either wire it back up or delete it. Leaving working-but-unreachable auth code
around invites someone to assume it's live.

Related: a user unsubscribing via Loops does **not** flip their in-app toggle, so
the two can diverge.

---

## Optional: drop the retired billing columns

[`docs/drop-legacy-billing-columns.sql`](drop-legacy-billing-columns.sql) drops
the 14 dead billing columns and `free_scan_events`. Every statement is
`IF EXISTS`, so it is safe to re-run. Pure housekeeping — nothing reads them.

---

## Maskable Android icon is a rounded square

`public/icon-maskable-512.png` was regenerated from the master and is now legible
(it previously had a near-invisible glyph). But Android crops maskable icons to a
circle, so ideal artwork is **full-bleed** rather than a rounded square with
corners that get clipped.

Fix properly by compositing the glyph onto a full-bleed teal field at ~66% scale,
rather than scaling the existing rounded-square icon.

---

## Cosmetic: `--purple` variables now hold teal

`public/help.html` still names its CSS variables `--purple`, `--purple-dark`,
`--purple-light` while holding teal values. Zero visual effect; a mechanical
rename when someone is next in that file.

---

## Watch: Expo Go warning on production builds

EAS prints:

> Detected that your app uses Expo Go for development, this is not recommended
> when building production apps.

Not blocking, and it did not affect the 2.0.0 build. Worth revisiting because it
can cause subtle native-module differences between what gets tested and what
ships. See https://expo.fyi/why-not-build-expo-go-for-production
