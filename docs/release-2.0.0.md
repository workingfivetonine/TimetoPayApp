# TimetoPay 2.0.0 — store release copy

Copy-paste blocks for App Store Connect and Google Play Console.

- **Version:** 2.0.0 (build number is auto-incremented by EAS — `appVersionSource: "remote"`)
- **iOS bundle ID:** `com.fivetonine.timetopay`
- **Android package:** `com.fivetonine.timetopay`
- **Headline change:** TimetoPay is now free. All subscription, trial and paywall
  surfaces were removed, so everything that used to be premium is open to everyone.

> **The two stores have very different limits on this field.** Apple's "What's New"
> allows 4000 characters; Google Play's release notes cap at **500**. They are not
> interchangeable — use the matching block below.

---

## iOS — "What's New in This Version"

*App Store Connect → your version → What's New in This Version (max 4000)*

```
TimetoPay is now completely free — and this is our biggest update yet.

EVERYTHING IS FREE
Subscriptions and scan limits are gone. Unlimited AI receipt scanning, multi-page PDF imports, full price history and every analytics view are now open to everyone. No trial, no tiers, no card required.

A BRAND-NEW LOOK
The whole app has been redesigned around a deep teal palette, with a proper dark mode that follows your system setting — including a dark launch screen instead of a white flash.

SHOPPING MODE
The shopping tab is now three sub-tabs, with a dedicated Shopping Mode for while you're actually in the store: tick items off as you go, and your progress sticks around.

FASTER RECEIPT CAPTURE
• Snap receipts with the in-app camera — no more switching to Photos first
• Share a receipt straight into TimetoPay from Photos or Files
• Pinch to zoom the full receipt image while you check the details
• "Save & Next" moves you straight to the next receipt when you're working through a stack

SMARTER SCANNING
• Tax and discounts are captured as proper receipt-level adjustments instead of being thrown away
• Multi-page PDF receipts now scan up to 10 pages, and tell you if any were skipped
• Scanned items are matched against what you've bought at that store before, so names stay consistent
• Fix a saved receipt's store afterwards, with suggestions from stores you already use
• Batch review can correct store names and line items in place

COMMUNITY BOARD
Posts and replies can now be removed, and moderation is quicker.

Thanks for using TimetoPay. Questions or ideas? Just reply — we read everything.
```

---

## Android — "What's new"

*Play Console → Release → Release notes (max 500)*

```
TimetoPay is now completely free — no subscriptions, no scan limits.

• Unlimited AI receipt scanning and PDF imports for everyone
• Fresh dark-teal design with full dark mode
• New Shopping Mode: tick items off while you shop
• Snap receipts with the in-app camera, or share them in from Photos/Files
• Tax and discounts now captured properly
• Multi-page PDF receipts (up to 10 pages)
• Scanned items matched to past purchases
• Pinch to zoom receipts; fix a receipt's store after saving
```

---

## Listing changes needed

The existing listing copy in [docs/appstore/listing.md](appstore/listing.md) and
[docs/playstore/listing.md](playstore/listing.md) is **still broadly accurate** —
it never advertised a paid tier, and features it mentions (PDF import, full price
history) are now simply available to everyone rather than gated. Two edits worth
making:

1. **Say it's free.** Neither description mentions price. Since "free, no
   subscription" is the single biggest change and a strong conversion line, add it
   to the Promotional Text (iOS, editable without review) and the Short
   Description (Android).
2. **Bump the version reference.** `docs/playstore/listing.md` says
   `**Version:** 1.0.0`.

Suggested iOS Promotional Text (max 170), replacing the current one:

```
Now completely free. Scan any grocery receipt and TimetoPay tracks prices, finds the cheapest store, and builds your smartest shopping list yet. No subscription.
```

Suggested Android Short Description (max 80), replacing the current one:

```
Free receipt scanner. Track grocery prices and find the cheapest store.
```

---

## Store-side checklist (outside the repo)

These cannot be done from the codebase and are easy to forget:

- [ ] **Remove or disable any In-App Purchase / subscription products** in App
      Store Connect and any Play Console subscriptions. The app no longer contains
      purchase code, so leaving live products configured is inconsistent and can
      draw review questions.
- [ ] **Confirm the "free" price tier** on both stores.
- [ ] **Re-check App Privacy answers** (iOS) and the Data Safety form (Android).
      Billing is gone, so any payment-related data collection declaration should be
      removed. Nothing new was added that collects more data.
- [ ] **Upload new screenshots** — the current ones show the old purple UI and the
      removed paywall. See the note below.
- [ ] **Check the app icon** updated correctly on both stores (it is now dark teal).
- [ ] Android: confirm the release track (internal → closed → production) and
      staged-rollout percentage.

## Screenshots

Not generated in this release — see the blocker note in
`.agents/memory/appstore-screenshots.md`. The documented pipeline needs
ImageMagick plus authentic signed-in captures driven through a browser, and it
referenced a Replit environment the project has since disconnected from. The
existing `scripts/src/compose-appstore.sh` and `compose-appstore-ipad.sh` still
hardcode the old purple gradient (`#8b5cf6` → `#5b21b6`) and would need the teal
values before use.
