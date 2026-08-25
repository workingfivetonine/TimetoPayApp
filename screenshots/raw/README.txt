App Store screenshots — six images, iPhone 6.9" (1290x2796).

TWO WAYS TO FILL THIS FOLDER
============================

A) Capture them automatically from the running web app
------------------------------------------------------
Sign in once (opens a real browser window; the session is cached in
screenshots/.auth.json, which is gitignored):

  pnpm --filter @workspace/scripts run capture:login

Then take all six:

  pnpm --filter @workspace/scripts run capture

Re-shoot just one:

  node scripts/src/capture-one.mjs 04-shopping /shopping "Regular,One-off,Best"

Defaults to the live site. Point it elsewhere with EXPO_DEV_DOMAIN. Chrome or
Edge is found automatically; override with PLAYWRIGHT_CHROMIUM_EXECUTABLE.

Every screen except the landing page is behind sign-in, so without the --login
step the capture would land on /landing. The script now fails loudly if that
happens rather than writing a landing-page image under a real screen's name.

B) Take them on a real iPhone
-----------------------------
Drop them in this folder named exactly as below. A 6.9" device (iPhone 16 Pro
Max or similar) already produces 1290x2796.

FILENAMES (either way)
======================
  01-home.png
  02-receipts.png
  03-stores.png
  04-shopping.png
  05-analytics.png
  06-catalog.png

CAPTION RULE — NO PRICE REFERENCES
==================================
Screenshot captions are App Store metadata, and Guideline 2.3.7 forbids any
reference to what the app costs. "Free", "100% free", "no subscription" and
"discounted" are ALL price references. Version 1.0 (4) was rejected over a
caption reading "Every feature. Completely free."

Grocery prices are the product, so captions about lower grocery prices are
fine. Our own price is never mentioned — put that in the App Store description
instead, where it is allowed.

The same rule applies to the raw captures: never shoot a screen that has "it's
free" / "create your free account" on it (the signed-out landing screen does),
because the composed image carries that text into the metadata too.

THEN COMPOSE
============
From the project root:

  bash scripts/src/compose-appstore.sh

Finished App Store images land in ../appstore/. Needs ImageMagick v7 (`magick`).
