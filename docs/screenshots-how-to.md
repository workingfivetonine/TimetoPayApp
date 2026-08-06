# Capturing App Store screenshots

The framing half is automated and now teal-ready. The **capture** half needs a
running app with a real signed-in session, which is why it isn't scripted here.

Target: **iPhone 6.7" — 1290 × 2796**. The app is iPhone-only
(`supportsTablet: false`), so Apple does not ask for iPad screenshots;
`compose-appstore-ipad.sh` exists but isn't needed for submission.

---

## Step 1 — install ImageMagick v7

Not currently installed on this machine. The compose script exits with a clear
error if it's missing.

```bash
winget install ImageMagick.ImageMagick
# then reopen your terminal and check:
magick -version
```

## Step 2 — capture five raw screens

Save as PNG into `screenshots/raw/` with these exact names:

| File | Screen |
|---|---|
| `01-receipts.png` | Receipts tab with several receipts listed |
| `02-stores.png` | Stores tab |
| `03-shopping.png` | Shopping tab (show Shopping Mode — it's new in 2.0) |
| `04-analytics.png` | Analytics tab with the spend calendar visible |
| `05-catalog.png` | Catalog screen |

Size doesn't need to be exact — the script resizes to 964px wide — but capture at
the highest resolution you can and keep the aspect ratio portrait.

**Sign in with a real account that has data.** Empty states make weak
screenshots, and the previous run hit exactly this: the naive capture tool
grabbed frames *before* React Query finished loading, producing blank white
screens for every data-backed view.

Easiest routes, in order of preference:

1. **iOS Simulator** (needs a Mac): run the app, sign in, then
   `Cmd+S` on each screen, or `xcrun simctl io booted screenshot 01-receipts.png`.
2. **A real iPhone**: install the EAS preview build, sign in, take normal
   screenshots, AirDrop them over. Note these are the device's own resolution —
   fine, the script rescales.
3. **The web build at phone dimensions**: `pnpm --filter @workspace/receipt-tracker run web`,
   then in the browser devtools set a 430 × 932 viewport at 3× device pixel ratio
   to land exactly on 1290 × 2796. Web layout differs slightly from native, so
   check each frame looks right before using it.

> Do **not** reuse the old screenshots. They show the purple UI *and* the paywall
> that no longer exists.

## Step 3 — frame them

```bash
bash scripts/src/compose-appstore.sh
```

Output lands in `screenshots/appstore/`, one 1290 × 2796 PNG per screen: rounded
corners, soft drop shadow, teal gradient background, white headline.

The script now:
- uses the teal gradient (`#06687e` → `#032f3c`), replacing the old violet
- finds a bold font automatically on Windows, Linux or macOS (override with
  `FONT=/path/to/font.ttf`)
- fails fast with a readable message if ImageMagick or a font is missing

Headline copy lives in the `heads=(...)` array near the top — edit there, not in
the composite step. The fifth headline is now "Every feature. Completely free."
to lead on the 2.0 change.

## Step 4 — upload

App Store Connect → your 2.0.0 version → Previews and Screenshots → iPhone 6.7".
Order matters; the numeric filename prefixes are the intended order.

---

## Gotchas already paid for

From `.agents/memory/appstore-screenshots.md` — these cost real time before:

- The rounded-corner mask must be drawn with `-fill white` on `xc:none`. With a
  default black fill plus `-alpha Off`, `CopyOpacity` reads pixel *intensity*
  (black = 0) and the screenshot goes fully transparent, i.e. invisible.
- `caption:"@file"` (reading text from a file) is blocked by ImageMagick's
  security policy and fails silently. Pass text inline; use `$'line1\nline2'` for
  line breaks.
- `-morphology EdgeOut` for a bezel edge is pathologically slow on images this
  size. The drop shadow already gives enough depth.
- If you use a temporary dev auth bypass to reach signed-in screens, **revert it**
  and confirm a protected route returns 401 afterwards.
