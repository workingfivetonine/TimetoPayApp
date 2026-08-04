# TimetoPay — Google Play Store Listing Copy

> Draft Google Play store metadata. Character limits noted per field (Google Play Console).
> Mirrors `docs/appstore/listing.md` (iOS) but adapted to Play's fields and limits — Play uses a
> short **80-char** description, a **4000-char** full description, and **no keywords field**
> (Play indexes the description text itself, so keywords are woven into the copy instead).

- **App:** TimetoPay
- **Package name:** `com.fivetonine.timetopay`
- **Version:** 1.0.0
- **Developer / legal entity:** FivetoNine LLC (New York, NY)
- **Category:** Finance (alt: Shopping)
- **Content rating:** Everyone

---

## App name (max 30)
TimetoPay

## Short description (max 80)
Scan any grocery receipt. Track prices, find the cheapest store, save money.
<!-- 76 chars. Shown under the icon in search/listing. This is the single most important
     conversion line. Alternatives:
     "Scan receipts, track grocery prices & always shop at the cheapest store." (73)
     "Turn grocery receipts into real savings — scan, track prices, spend less." (74) -->

## Full description (max 4000)
TimetoPay turns every grocery receipt into real savings.

Snap a photo of any receipt and our AI instantly reads the store, the date, every item, and every price — no typing. The more you scan, the smarter it gets: TimetoPay remembers what you buy, tracks how prices change over time, and tells you exactly where to get each item for less.

WHY YOU'LL LOVE IT

• Scan receipts with AI
Point your camera at a paper receipt and TimetoPay extracts the store, items, quantities, and prices automatically. Crumpled, faded, or angled receipts are no problem. You can also upload a photo from your gallery or import a PDF order confirmation.

• Track prices over time
Every scan builds your personal price history. See the lowest, average, and highest price you've ever paid for an item — and never get fooled by a fake "sale" again.

• A shopping list that saves you money
TimetoPay automatically builds your shopping list from what you actually buy. Regulars rise to the top, and each item shows the lowest price and the best store to buy it from. Export a clean, printable list grouped by store.

• Compare the true cost of every store
Track delivery fees and order minimums for each store and instantly see which one is genuinely cheaper for your basket — not just on the shelf, but after fees.

• See where your money really goes
Weekly spending analytics highlight your high and low weeks at a glance, so you always know your grocery budget.

• Browse real prices
Explore a catalog of real grocery prices and add anything to your shopping list in one tap.

PRIVATE BY DESIGN
Your receipts and spending are yours alone. Every account's data is fully private and secure.

Start scanning today and find out how much you've been overpaying. It's TimetoPay smarter.

<!-- Play indexes this text for search. Naturally-occurring keywords already present:
     grocery, receipt, scanner, price tracker, shopping list, budget, savings, deals,
     expense, spending. Keep them in the prose — do NOT append a keyword-stuffed block
     (Play policy penalizes it). -->

## What's new (max 500) — release notes for v1.0.0
Welcome to TimetoPay! Scan any grocery receipt and let AI track your prices, build a money-saving shopping list, and show you the cheapest store for your basket. This is our first release — we'd love your feedback.
<!-- 232 chars -->

---

## Graphic assets required by Play (specs)

| Asset | Spec | Required? | Notes |
|---|---|---|---|
| App icon | 512×512 PNG, 32-bit, **no alpha for the store icon** (opaque) | Yes | Reuse the flattened icon from the iOS fix (`assets/images/icon.png` was made opaque). Play's *store* icon is separate from the launcher adaptive icon in `app.json`. |
| Feature graphic | 1024×500 PNG/JPG, no alpha | Yes | Banner shown at top of listing. Put the logo lockup + tagline "Scan receipts, beat prices" on brand background. Canva brand kit `kAHLVoeL-zI`. |
| Phone screenshots | 1080×1920 (or any 16:9-ish, min 320px, max 3840px), 2–8 images | Yes (min 2) | The repo already has **Android 1080×1920** screenshots (unlike iOS, these are valid for Play as-is). Reuse them. |
| 7" tablet screenshots | up to 8 | Optional | App is phone-first; skip unless you want tablet featuring. |
| 10" tablet screenshots | up to 8 | Optional | Skip. |
| Promo video (YouTube URL) | — | Optional | Can point at the Canva promo reel (design `DAHP8KWS5qc`) once uploaded to YouTube. |

---

## Store settings checklist (Play Console)

- [ ] **App category:** Finance (primary). Tags: budgeting, expense tracking, shopping.
- [ ] **Contact details:** email `support@5to9shopping.com`; website `https://5to9shopping.com`.
- [ ] **Privacy policy URL:** `https://5to9shopping.com/privacy` (required).
- [ ] **Data safety form** — declare what's collected (see next section — Play's equivalent of Apple's privacy nutrition labels; **required, blocks release if skipped**).
- [ ] **Content rating questionnaire** — complete → expect "Everyone".
- [ ] **Ads:** declare "No ads" (app has none).
- [ ] **Target audience:** 18+ (finance app; avoids "designed for families" obligations).
- [ ] **Government/financial-features declaration:** it is a personal budgeting tool, **not** a bank/payments app — answer accordingly.

## Data safety form — draft answers
> Play requires you to self-declare data collection. Fill these against the real app; verify
> before submitting.
- **Data collected:** Email address (account), receipt images + extracted purchase data (app functionality), app activity/analytics (Vercel Web Analytics is web-only; confirm none on Android before declaring "none" for the app).
- **Data shared with third parties:** Authentication via Clerk; payment processing (web only, not in the Android app). Declare only what the Android build actually transmits.
- **Encrypted in transit:** Yes (HTTPS).
- **Users can request deletion:** Yes — in-app "Delete my account" (Account screen).

---

## Key differences vs. the iOS submission (so you don't copy the wrong fields)

| Field | Apple App Store | Google Play |
|---|---|---|
| Short line | Subtitle (30) + Promotional Text (170) | **Short description (80)** — one field |
| Keywords | Dedicated 100-char field | **None** — indexed from the full description |
| Long copy | Description (4000) | Full description (4000) — same text works |
| Release notes | "What's New" | "What's new" (500) |
| Banner image | — (none) | **Feature graphic 1024×500 (required)** |
| Screenshots | iPhone 6.9" 1290×2796 (needed new) | Android 1080×1920 (**already have these**) |
| Privacy disclosure | Nutrition labels | **Data safety form** |
| Sign-in rule (4.8) | Must offer Sign in with Apple if 3rd-party login shown | **No equivalent rule** — Google sign-in is fine on Android (and is already scoped correctly per recent commit) |

> Bottom line: Play submission is **lighter** than iOS — no Sign in with Apple requirement, no
> icon-alpha rejection risk for the launcher icon, and existing Android screenshots are valid.
> The only genuinely new artifact you must create is the **1024×500 feature graphic**.
