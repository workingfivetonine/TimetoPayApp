# App Store Connect — every field, with what to type

For the **new** Apple account (team `VA6ZH2PDXM`). This is a first submission of a
brand-new app record, not a resubmission — the old account's app died with it.

Work top to bottom. Anything marked ⚠️ has bitten this project before.

---

## Before you start

| | |
|---|---|
| Apple team | `VA6ZH2PDXM` |
| iOS bundle ID | `com.fivetonine.timetopayapp` |
| Version | `2.0.0` |
| Devices | **iPhone only** (`supportsTablet: false` — Apple will not ask for iPad screenshots) |

⚠️ **The bundle ID changed.** The old account still holds
`com.fivetonine.timetopay` and it can't be reused or transferred. Android
deliberately keeps the old package — the two platforms having different IDs is
intentional.

---

## 1. My Apps → + → New App

| Field | Type this |
|---|---|
| Platforms | ☑ iOS only |
| **Name** | `TimetoPay` |
| Primary Language | `English (U.S.)` |
| **Bundle ID** | select `com.fivetonine.timetopayapp` |
| **SKU** | `timetopay-ios-001` |
| User Access | Full Access |

⚠️ **If "TimetoPay" is rejected as taken**, that's the frozen account's dead
listing holding the name. Use a variant — `TimetoPay — Receipt Scanner` (26
chars, under the 30 limit). The name **on the phone** comes from `app.json` and
stays "TimetoPay" either way, so only the store listing differs.

SKU is internal-only; Apple never shows it and it can't be changed later.

---

## 2. App Information

| Field | Type this |
|---|---|
| Subtitle (max 30) | `Scan receipts, beat prices` |
| Category — Primary | `Finance` |
| Category — Secondary | `Shopping` |
| Content Rights | ☑ *"...does not contain, show, or access third-party content"* |
| Age Rating | Answer **No** to everything → results in **4+** |

The Community Board is user-generated content, but it's moderated (posts need
approval, and there's a 2-receipt gate). If the age-rating questionnaire asks
about user-generated content, answer honestly — it may push the rating to 12+,
which is fine.

---

## 3. Pricing and Availability

| Field | Type this |
|---|---|
| Price | **Free** |
| Availability | All countries |

⚠️ **Do not configure any In-App Purchases.** The app has no purchase code at
all. A live IAP entry with no matching code invites review questions.

---

## 4. App Privacy

The section most likely to cause a rejection. Answers below are verified against
the code.

**"Do you collect data from this app?" → Yes**

### Collected, linked to identity, NOT used for tracking

| Data type | Purpose | Notes |
|---|---|---|
| **Email Address** | App Functionality | Sign-in, via Clerk |
| **Name** | App Functionality | First name / username |
| **Coarse Location** | App Functionality | ⚠️ Only if the user *chooses* to enter a home address; it's geocoded to show store distances. Optional. |
| **Purchase History** | App Functionality | Receipt line items, prices, spend totals — the core feature |
| **Photos** | App Functionality | ⚠️ See below |
| **User Content** | App Functionality | Community Board posts |
| **Customer Support** | App Functionality | In-app support form |

### For every single item above

- **Used for tracking? → NO** (all of them)
- **Linked to the user's identity? → YES** (all of them)

⚠️ **Tracking is No.** The app has no advertising SDK and no cross-app tracking.
`@vercel/analytics` is in the dependencies but the native component is a
**deliberate no-op** — it only runs on web. So there is no analytics SDK in the
iOS binary at all. Answering "Yes" here would force an App Tracking Transparency
prompt you don't need.

### Photos — be precise

Receipt images are **sent to OpenAI for parsing, then discarded**. Declare Photos
as collected — they do leave the device — with purpose **App Functionality**. But
you are not building a photo library and are not retaining images.

Verified rather than assumed: the `receipts` table does have an `image_uri`
column, but it is **dead** — nothing in the API server writes it and the client
never sends it. So a grep of the schema looks alarming while the behaviour is
genuinely "not stored". (Logged in [../follow-ups.md](../follow-ups.md).)

### Not collected — leave unticked

Precise Location · Contacts · Health · Financial Info (no payment data — there's
no billing) · Browsing History · Search History · Identifiers · Diagnostics ·
Advertising Data

---

## 5. Version 2.0.0 — Prepare for Submission

### Screenshots ⚠️

**6.7" iPhone, 1290 × 2796**, 3–10 images. Required.

Do **not** reuse the existing ones — they show the old purple UI and a paywall
that no longer exists. See [../screenshots-how-to.md](../screenshots-how-to.md);
ImageMagick is installed and the framing script is ready, it just needs 5
captures.

No iPad screenshots needed (iPhone-only app).

### Promotional Text (max 170) — editable later without review

```
Now completely free. Scan any grocery receipt and TimetoPay tracks prices, finds the cheapest store, and builds your smartest shopping list yet. No subscription.
```

### Description (max 4000)

Use the full text in [listing.md](listing.md) under **## Description**.

### Keywords (max 100, comma-separated, no spaces)

```
grocery,receipt,scanner,price tracker,shopping list,budget,savings,deals,expense,spending,coupons
```

### What's New in This Version

Use the iOS block in [../release-2.0.0.md](../release-2.0.0.md) — 1,610 chars of
the 4,000 allowed.

⚠️ **Do not paste the Android version.** It's written to Play's 500-char limit
and reads as a stub here.

### URLs

| Field | Type this |
|---|---|
| Support URL | `https://5to9shopping.com/support` |
| Marketing URL | `https://5to9shopping.com` |
| Privacy Policy URL | `https://5to9shopping.com/privacy` |

---

## 6. Build

Select the 2.0.0 build after EAS uploads it. Build number auto-increments, so
just take the newest.

**Export Compliance:** answers itself — `usesNonExemptEncryption: false` is
already in `app.json`, so App Store Connect won't ask.

---

## 7. App Review Information

⚠️ **The single most important section. The app is sign-in-gated, so without
working credentials the reviewer sees a login wall and rejects.**

| Field | Type this |
|---|---|
| Sign-in required | ☑ **Yes** |
| Username | *a real account you create for this* |
| Password | *its password* |
| Contact — First/Last | Brocha Zweig |
| Contact — Phone | *your number* |
| Contact — Email | `bz@fivetoninesolutions.com` |

**Make the demo account useful.** Sign in as it and add 3–4 receipts across two
different stores before submitting. An empty account makes the core feature —
price history across stores — look broken.

### Notes for the reviewer

```
TimetoPay is completely free. There are no in-app purchases, no subscriptions, and no external payment links anywhere in the iOS app.

The demo account above has sample receipts already loaded so price history and store comparison are visible immediately.

To try the main flow: Scan tab > Take Photo or Choose from Library > pick any receipt image > the AI extracts the store, date and line items > review and save.

Note the app is iPhone-only by design.

Google sign-in is intentionally hidden on iOS, so the only sign-in method on this platform is email and password.
```

⚠️ That last line matters. Google sign-in is hidden on iOS specifically so that
Sign in with Apple isn't required under Guideline 4.8 — saying so up front avoids
a reviewer asking.

---

## 8. Release

Choose **Manually release this version** — so a surprise approval doesn't publish
before your screenshots and Play release are lined up.

---

## Final checks before you hit Submit

- [ ] Screenshots show the **teal 2.0 UI**, not purple, and no paywall
- [ ] **No donation links anywhere in the iOS build** — they're hidden behind
      `Platform.OS !== "ios"`, which is what got the old submission rejected
- [ ] Demo account works from a signed-out device and has receipts in it
- [ ] No In-App Purchases configured
- [ ] Privacy Policy URL loads
- [ ] App Privacy: **tracking answered No** on every item

---

## Submitting the build

```
cd C:\Users\broch\TimetoPayApp\artifacts\receipt-tracker
eas submit --platform ios --latest
```

⚠️ Run it from `artifacts/receipt-tracker`, never the repo root. The root has no
Expo config, and running EAS there previously created a junk second project and
prompted to invent a new bundle ID.
