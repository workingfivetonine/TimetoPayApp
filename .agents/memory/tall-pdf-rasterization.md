---
name: Tall/wide PDF rasterization for vision
description: How image-based PDF receipts are rasterized before the vision model, and why
---

# Image-based PDF rasterization for the vision model

When an image-based (scanned) PDF receipt is sent to the OpenAI vision model, a
single fixed-DPI full-page render can produce an image too large for the model
to accept — a very tall single "invoice"/order-confirmation page (e.g. a media
box ~1080 x 8489 pt at 150 DPI → ~2250 x 17686 px) silently fails the vision
call, so the upload "doesn't register at all."

**Rule:** rasterize with poppler ONLY (pdftoppm + pdfinfo). Do NOT depend on
ImageMagick — it is not confirmed present in the deployed image.

**How it works:** read page count + first-page media-box via `pdfinfo`
(assumed uniform). Choose a DPI that keeps rendered width within a cap, then
split a too-tall page into stacked vertical bands using pdftoppm's crop flags
`-x/-y/-W/-H` (pixel coords at the chosen `-r` DPI). Cap total band images.

**Why the DPI floor is 1, not a larger value:** the width cap must be absolute
even for a pathologically wide media box (DoS bound on raster pixel count);
readability is secondary to bounding the job. `Math.floor(MAX_W*72/widthPt)`
guarantees `widthPx <= MAX_W`.

**Temp-file hygiene:** every produced JPEG must be registered for cleanup AS IT
IS CREATED (push into the route's `tempFiles` array inside the render helper),
not only after the helper returns — otherwise a mid-loop band-render throw
leaks the already-written files past the route's `finally`.

**Other bounds kept:** work bounded to the first few pages, each pdftoppm call
wrapped in wall-clock timeout + SIGKILL, global AI budget charged only after a
successful render.
