# TimetoPay — Brand Kit (Canva plug-and-play)

> Organized to match **Canva's Brand Kit panel exactly** — fill each Canva field with the value
> in the matching section below. Every color and font here is pulled from the live app
> (`constants/colors.ts`, Inter font weights), so Canva output matches the product 1:1.
>
> **Where in Canva:** Home → **Brand** (left sidebar) → your **TimetoPay** kit (id `kAHLVoeL-zI`).
> Canva kits are configured in the UI — there is no file to import — so this doc is the
> copy/paste source of truth for every field.

---

## 1) Logos  → Canva "Brand → Logos"

Upload these files (from `artifacts/receipt-tracker/assets/images/`):

> **⚠️ Logo updated (v2).** The current logo is the dimensional gradient version:
> the icon is a purple gradient rounded-square with the clock-check **knocked out** (the mark
> shows the background *through* it), the **wordmark is a blue→purple gradient** (no longer flat
> slate), and the tagline reads **"Keep the Receipt"** in title case (also gradient), not the old
> uppercase "KEEP THE RECEIPT". Upload this new file to Canva → Brand → Logos and replace the old
> lockup so all future designs pick it up.

| Slot | File | Use |
|---|---|---|
| Primary logo (lockup) — **v2 gradient** | new gradient PNG (upload to Canva) | Icon + gradient "TimetoPay" wordmark + "Keep the Receipt" tagline. Default logo for posts. |
| Icon / avatar | `icon.png` (1024²) | Square app icon — use as profile pic, watermark, favicon. |
| Adaptive/foreground | `adaptive-icon.png` | Clock-check mark alone, for overlays. |

**Logo tokens (v2):**
| Element | Treatment |
|---|---|
| Icon square | Purple gradient — top-left `#8B5CF6` → bottom-right `#5B21B6`, rounded ~22% radius, soft dimension/depth. |
| Icon mark (clock + check) | **Knockout** — the mark is cut out so the ground shows through (dark on transparent art, background color on solid). Do not fill it a flat color. |
| Wordmark "TimetoPay" | Blue→purple gradient, left→right: `#4F46E5` (indigo) → `#7C3AED` (purple). Inter Bold. |
| Tagline "Keep the Receipt" | Title case, same blue→purple gradient, lighter weight (Inter SemiBold), letter-spacing +0.15em. |

**Logo usage rules (add to Canva "Brand → Logos" notes):**
- Clear space around the logo = at least the height of the icon's corner radius.
- Minimum size: icon no smaller than 40 px; lockup wordmark stays legible ≥ 120 px wide.
- Preserve the gradient direction on both icon and wordmark — do **not** flatten to a single color, stretch, or skew.
- The v2 gradient wordmark works on **light and dark** grounds (unlike the old slate wordmark). On busy or mid-tone backgrounds, use a **white knockout** of the whole lockup for contrast.
- Tagline is **title case** ("Keep the Receipt") — do not revert to all-caps.

---

## 2) Brand Colors  → Canva "Brand → Brand Kit → Colors"

Canva lets you create **named color groups**. Create these four groups so the right swatches are one click away when designing.

### Group A — "Core" (the everyday palette)
| Name | HEX | Role |
|---|---|---|
| Primary Purple | `#7C3AED` | Headlines, buttons, key numbers, brand bar. **The** brand color. Also the right end of the logo gradient. |
| Logo Indigo | `#4F46E5` | Left end of the v2 logo/wordmark gradient. Pair with Primary Purple for on-brand gradients. |
| Icon Light | `#8B5CF6` | Top-left of the icon square gradient. |
| Deep Purple | `#5B21B6` | Secondary headings, pressed states, bottom-right of the icon gradient. |
| Accent Purple | `#6D28D9` | Links, small emphasis, icon fills on light. |
| Ink | `#1E1B2E` | Primary body text on light grounds. |

> **Signature gradient (v2 logo):** linear `#4F46E5` → `#7C3AED` (left→right for the wordmark;
> top-left→bottom-right for the icon square). Add this as a Canva **brand gradient** if available.
> _The old flat "Slate wordmark #3D4A6B" is retired — the wordmark is now this gradient._

### Group B — "Tints & Grounds" (backgrounds)
| Name | HEX | Role |
|---|---|---|
| Lilac BG | `#FAF8FF` | Default post / card background. |
| Lilac Tint | `#F3F0FF` | Secondary blocks, muted fills. |
| Lilac Chip | `#EDE9FE` | Chips, highlight pills, badge backgrounds. |
| White | `#FFFFFF` | Cards, receipt mockups, knockout logo. |
| Border Lilac | `#E7E1F5` | Hairlines, dividers, card borders. |
| Muted Text | `#6B6385` | Captions, secondary labels. |

### Group C — "Semantic" (data & alerts — NOT decorative)
> Use ONLY to signal meaning, never as an accent. Green = good/cheaper, Rose = alert/overpaying.
| Name | HEX | Role |
|---|---|---|
| Good Green | `#059669` | "Cheaper", price drop, low-spend week. |
| Good Green BG | `#ECFDF5` | Background behind a positive stat. |
| Alert Rose | `#E11D48` | "Overpaying", price up, high-spend week. |
| Alert Rose (bright) | `#F43F5E` | Buttons/emphasis for the alert state. |
| Alert Rose BG | `#FFF1F2` | Background behind a negative stat. |

### Group D — "Dark mode" (for dark-background posts / stories)
| Name | HEX | Role |
|---|---|---|
| Dark BG | `#0F0D1A` | Dark post background. |
| Dark Card | `#1A1628` | Cards on dark. |
| Purple (on dark) | `#9D6AFF` | Primary purple, brightened for dark grounds. |
| Text (on dark) | `#F0EDFF` | Body text on dark. |
| Muted (on dark) | `#9B92B8` | Secondary text on dark. |
| Border (on dark) | `#2E2648` | Dividers on dark. |

**Primary brand color to set as the Canva default swatch:** `#7C3AED`.

---

## 3) Brand Fonts  → Canva "Brand → Brand Kit → Fonts"

The app uses **Inter** (already in Canva's font library — search "Inter"). Map the three Canva font slots:

| Canva slot | Font | Weight | Size guidance |
|---|---|---|---|
| **Heading** | Inter | **Bold (700)** | Post headlines. Letter-spacing −2%. `text-wrap: balance`. |
| **Subheading** | Inter | **SemiBold (600)** | Kickers, section labels, CTAs. Uppercase labels get +8% letter-spacing. |
| **Body** | Inter | **Regular (400)** | Captions, descriptions, body copy. Line-height ~1.5. |

Extra weight used in-app for buttons/labels: **Inter Medium (500)**.

**Type rules:**
- Never mix in a second typeface. Inter only, weight does the work.
- Uppercase eyebrows/labels: SemiBold, +0.08em tracking, in Primary Purple or Muted Text.
- Big numbers/prices: Bold, `tabular-nums` (Canva: enable "Tabular figures" if available) so digits align.

---

## 4) Brand Voice  → Canva "Brand → Brand Voice" (optional field)

- **Tone:** friendly, positive, money-smart. Talk like an encouraging savvy friend, not a bank. Lead with the **win** (savings, ease, confidence), not the fear of overpaying.
- **Say:** "The smartest way to shop." "Watch your savings add up." "Scan, track, save — it's that easy." "Always know the best price." "No typing — just snap."
- **Avoid:** jargon ("OCR", "line-item extraction"), hype ("revolutionary"), fear/shame framing ("you've been overpaying"), fake urgency.
- **Signature lines:** "Keep the Receipt." · "Scan. Track. Save." · "It's TimetoPay smarter."
- **Emoji:** sparingly — 🧾 💜 🎉 🛒 are on-brand; avoid random faces.

---

## 5) Photos / Graphics / Icons  → Canva "Brand → uploads / folders"

| Asset type | What to add | Source |
|---|---|---|
| App screenshots | The real in-app screens for mockups | `artifacts/receipt-tracker/assets/images/guide/*.jpg` (scan, receipts, analytics, shopping, store-detail, etc.) |
| Icon style | Rounded, single-weight line/solid icons in Primary Purple | Canva's "Corporate" / line icon sets — match the clock-check look |
| Graphic motifs | Rounded-corner cards (radius **12px** app / ~16–22px for posts), dashed receipt divider, price chart with a purple line + single emphasized dot | Recreate per the Instagram kit |
| Corner radius | **12** (app token) — use 16–22 for social cards | `constants/colors.ts` `radius: 12` |

---

## 6) Quick reference card (paste anywhere)

```
BRAND: TimetoPay  (FivetoNine LLC)   Canva kit id: kAHLVoeL-zI
PRIMARY:   #7C3AED  purple
GRADIENT:  #4F46E5 indigo → #7C3AED purple   (logo wordmark + icon square, v2)
ICON:      #8B5CF6 → #5B21B6  (square)  · mark is KNOCKOUT (cut out, not filled)
DEEP:      #5B21B6  · ACCENT: #6D28D9
INK TEXT:  #1E1B2E  · MUTED: #6B6385
GROUNDS:   #FAF8FF bg · #F3F0FF tint · #EDE9FE chip · #FFFFFF · #E7E1F5 border
GOOD:      #059669 (bg #ECFDF5)     ALERT: #E11D48 / #F43F5E (bg #FFF1F2)
DARK:      bg #0F0D1A · card #1A1628 · purple #9D6AFF · text #F0EDFF
FONT:      Inter — Bold(700) head / SemiBold(600) sub / Regular(400) body / Medium(500) labels
RADIUS:    12 (app) · 16–22 (social)
TAGLINE:   Keep the Receipt.  (title case — gradient, not slate)
```

---

### How to load this into Canva (5 minutes)
1. **Brand** → open the **TimetoPay** kit.
2. **Logos** → upload the **new v2 gradient lockup** (replace the old one), plus `icon.png`, `adaptive-icon.png`.
3. **Colors** → **Add color group** ×4 → name them Core / Tints & Grounds / Semantic / Dark → paste each HEX. Add the signature gradient `#4F46E5 → #7C3AED` if Canva supports brand gradients.
4. **Fonts** → set Heading = Inter Bold, Subheading = Inter SemiBold, Body = Inter Regular.
5. **Brand Voice** → paste section 4.
6. **Uploads** → drop the `guide/*.jpg` screenshots into a "TimetoPay screenshots" folder.

Once set, every template in the Instagram kit (`docs/marketing/instagram-posts.md`) will pull these
colors and fonts automatically via Canva's "Apply brand" / "Styles" one-click.
