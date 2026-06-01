---
name: App Store screenshot pipeline
description: How to capture authentic signed-in app screens and frame them at 1290x2796, and the gotchas that waste time.
---

# Capturing signed-in screens (Expo RN-web)
- The `app_preview` screenshot tool captures BEFORE React Query data loads → blank white for any data screen (the public landing renders fine). Use playwright-core instead, driving the bundled chromium via `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`, and `waitForFunction` on expected on-screen text before snapping.
- For crisp 6.7" output: viewport 430x932, `deviceScaleFactor: 3` → yields exactly 1290x2796.
- Capturing signed-in screens requires a real auth session. A dev-only auth bypass can be used temporarily but MUST be reverted (verify `/api/<protected>` returns 401 afterward).

# ImageMagick framing gotchas (v7 `magick`)
**Why these cost real time:**
- Rounded-corner mask must be drawn with `-fill white` on `xc:none`. With the default black fill + `-alpha Off`, `CopyOpacity` uses pixel *intensity* (black=0) and the image becomes fully transparent (invisible). Drop `-alpha Off` and use a white-filled roundrectangle.
- `caption:"@file"` (reading text from a file) is blocked by the security policy and hangs/fails silently. Pass text directly (use `$'line1\nline2'` for multi-line).
- `-morphology EdgeOut` for a bezel edge is extremely slow / can hang on large images — avoid; a soft drop shadow (`+clone -background black -shadow ...` then `+swap -layers merge`) is enough for depth.
