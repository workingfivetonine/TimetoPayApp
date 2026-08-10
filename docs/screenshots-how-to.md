# Capturing App Store screenshots

Both halves are scripted now: capture, then framing. End to end it's three
commands and about ten minutes, most of which is the browser loading.

**Finished size: 1320 × 2868** — the native iPhone 6.9" resolution, and one of
the two sizes App Store Connect accepts for that slot (1290 × 2796 is the other).
Capture happens at 1290 × 2796 and `compose-appstore.sh` places it on the larger
canvas, scaling the phone image *down* to 986px wide, so nothing is ever
upscaled. The app is iPhone-only
(`supportsTablet: false`), so Apple never asks for iPad — `compose-appstore-ipad.sh`
exists but is not needed for submission.

**Seven screenshots**, Home first, because Home is the first screen in the app
and so the first thing anyone sees on the listing. Apple allows up to ten. All
seven are scriptable — the shopping and analytics sub-tabs each take a query
param, so they have addressable URLs.

---

## Before you start

**ImageMagick v7** — already installed (`magick -version` reports 7.1.2). If you
ever hit a machine without it:

```bash
winget install ImageMagick.ImageMagick
```

**Chrome or Edge** — found automatically at the standard install paths. Override
only if yours is somewhere unusual:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = "C:\path\to\chrome.exe"
```

**An account with real data.** The capture photographs whatever the signed-in
account actually has. Empty lists make weak screenshots and Apple has rejected
listings for showing placeholder-looking screens.

**Know which build you're shooting.** Capture defaults to the live site,
`5to9shopping.com`, which runs whatever was last deployed to Vercel — *not*
necessarily your local branch. To shoot an unreleased UI, point it elsewhere:

```powershell
$env:EXPO_DEV_DOMAIN = "your-preview-url.vercel.app"
```

---

## Step 1 — sign in, once

```powershell
pnpm --filter @workspace/scripts run capture:login
```

A real Chrome window opens on `/sign-in`. **Nothing is typed for you** — sign in
by hand, with whatever method you use. Take as long as you like; it waits up to
five minutes and won't close until Clerk has actually issued a session. It then
prints which account you signed in as, so you can tell your own account apart
from the App Review demo account.

It writes `screenshots/.auth.json`, which holds live session cookies. That file
is gitignored and must stay that way; anyone with it is signed in as you.

To switch accounts, just run it again — each run starts from a clean browser
profile, so you always get a fresh sign-in prompt. Delete `.auth.json` if you
want to be certain nothing is reused.

You only repeat this when the session expires, which shows up as a clear error
in step 2 rather than as a bad screenshot.

> **This step was broken until Aug 2026** and the failure was silent. It waited
> for the URL to leave `/landing`, `/sign-in` or `/sign-up` — but a signed-out
> visitor at `/` is on none of those, because `/` serves landing content without
> redirecting. The condition was already true on load, so the window closed after
> ~2.5 seconds with no chance to type and saved a signed-*out* session. That is
> where the six identical marketing-page screenshots came from. It now waits on
> Clerk's `__session` cookie, and the capture step re-checks it per screen.

## Step 2 — capture the seven screens

```powershell
pnpm --filter @workspace/scripts run capture
```

It warms the bundle once (Expo's first paint is slow enough to ruin the first
frame otherwise), then walks the seven routes at a 430 × 932 viewport with a 3×
pixel ratio — which is exactly 1290 × 2796, so nothing is ever upscaled.

| File | Route | What should be visible |
|---|---|---|
| `01-home.png` | `/` | The hub: Scan card, six tiles |
| `02-receipts.png` | `/receipts` | Several receipts with store names and totals |
| `03-stores.png` | `/stores` | Stores with delivery fees |
| `04-shopping.png` | `/shopping?view=items` | Items sub-tab, Regulars and One-offs |
| `05-analytics.png` | `/analytics?tab=items` | Store comparison, "Cheapest by category" |
| `06-catalog.png` | `/catalog` | Categories with prices |
| `07-createlist.png` | `/shopping?view=create` | Build your list, with RAN OUT badges |

Sub-tabs are addressable, which is why the last three are scriptable at all.
`/shopping` takes `?view=items|create|shop` and `/analytics` takes
`?tab=calendar|items`; an unrecognised value falls back to the default rather
than erroring. Two of those defaults are deliberately overridden here:

- **Analytics** opens on Calendar, which is an empty month grid unless you
  shopped this month. `?tab=items` lands on the store comparison instead.
- **Create list** is a sub-tab, not a top-level screen, so without `?view=` the
  capture would just re-shoot the Items list.

Catalog sorts by Category out of the box, which opens on produce. If you switch
it to A–Z you get "12 Bottle Deposit" and "Ami Magazine" at the top — accurate,
but a much weaker first impression. Don't.

Each line prints `OK (content matched)` or `captured (NO content match — check
this one)`. The second is not fatal — it usually means that screen has no data
in your account — but open the file before continuing.

If the saved session has died, the script **throws instead of writing a file**.
That is deliberate: a signed-out browser is redirected to `/landing`, and the
old version of this script silently saved six copies of the marketing page under
real screen names. It looks like a valid screenshot right up until App Review.

To redo a single screen without repeating the set:

```powershell
node scripts/src/capture-one.mjs 04-shopping /shopping "Regular,One-off,Best"
```

## Step 3 — look at all seven

Open `screenshots/raw/` and check each one. Things that have gone wrong before:

- A view still loading, so the frame is blank white
- A screen with one item on it
- Real personal data you don't want public — these images go on a public store page

## Step 4 — frame them

```bash
bash scripts/src/compose-appstore.sh
```

Finished images land in `screenshots/appstore/`, one 1320 × 2868 PNG each:
rounded device corners, drop shadow, teal gradient background
(`#06687e` → `#032f3c`), white headline.

Headline copy lives in the `heads=(...)` array near the top of that script. Edit
it there, not in the composite step:

| # | Headline |
|---|---|
| 1 | Turn receipts into real savings |
| 2 | Snap a receipt. We handle the rest. |
| 3 | Compare the true cost of every store |
| 4 | A list that finds the lowest price |
| 5 | See where your money really goes |
| 6 | Every feature. Completely free. |
| 7 | Know what ran out before you go |

A slot with no raw capture is skipped with a `SKIP` line and summarised in a
warning at the end, rather than aborting the run — so you can frame what you
have while the rest are still being collected.

## Step 5 — upload

App Store Connect → your version → **Previews and Screenshots** → *iPhone 6.9"
Display*. Drag all seven in. Order matters and is not inferred from filenames —
check it after dropping them; the numeric prefixes are the intended order.

---

## Gotchas already paid for

Real time was lost to each of these:

- The rounded-corner mask must be drawn with `-fill white` on `xc:none`. With a
  default black fill plus `-alpha Off`, `CopyOpacity` reads pixel *intensity*
  (black = 0) and the screenshot comes out fully transparent, i.e. invisible.
- `caption:"@file"` (reading text from a file) is blocked by ImageMagick's
  security policy and fails **silently**. Pass text inline; use `$'line1\nline2'`
  for line breaks.
- `-morphology EdgeOut` for a bezel edge is pathologically slow at this size. The
  drop shadow already gives enough depth.
- A naive capture grabs frames before React Query has loaded, producing blank
  white screens. The current script waits for expected text and then settles.
- Do not reuse pre-2.0 screenshots. They show the purple UI *and* a paywall that
  no longer exists.
- Earlier attempts reached signed-in screens with a temporary dev auth bypass.
  That is no longer necessary and should not be reintroduced — `capture:login`
  uses a genuine session. If you ever do add one, revert it and confirm a
  protected route returns 401 afterwards.
