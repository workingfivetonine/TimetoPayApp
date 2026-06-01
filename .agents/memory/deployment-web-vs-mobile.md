---
name: Receipt Tracker deployment is mobile-only (Expo Go launcher)
description: Why the published site is not a real website, and where web/SEO concerns must be handled.
---

# Published deployment serves an Expo Go launcher, not the web app

The receipt-tracker artifact is `kind = "mobile"` (`router = "expo-domain"`). Its
production build (`artifacts/receipt-tracker/scripts/build.js`) only produces
**iOS/Android Expo Go bundles + manifests** — there is **no web export**.
`server/serve.js` serves, at `/`, a QR-code "Download Expo Go / scan to open"
landing page (`server/templates/landing-page.html`) to browsers, and platform
manifest JSON to the Expo Go app.

**Implication:** visiting the deployed URL (or a custom domain) in a desktop
browser shows the Expo Go launcher, NOT the actual Receipt Tracker product.
Anything a search engine indexes is that launcher page. Real "use it as a
website" / meaningful SEO would require switching the build to an Expo **web
export** (`expo export -p web`) and serving that SPA — a significant change to
build.js/serve.js/artifact.toml that also has limits (client-rendered SPA behind
Clerk auth). The app code itself does support web (react-native-web; camera
falls back to image picker on web).

**Why:** the scaffold optimizes mobile distribution via Expo Go, so the "web"
surface is intentionally just a launcher.

**How to apply:** for any "website", "SEO", "landing", or browser-facing request,
remember the served page is the launcher template — improve SEO there, but flag
to the user that the indexed page is the launcher, not the product, and offer the
web-export path as the real fix.

# Replit deployments block indexing by default

A published Replit deployment serves a default `robots.txt` of `User-agent: * /
Disallow: /` (injected by the platform, content-type text/plain) until the app
serves its own. To allow indexing, the app must respond to `/robots.txt` itself
(serve.js now has explicit `/robots.txt` + `/sitemap.xml` routes), then
**republish** — changes only take effect on redeploy. Lighthouse "Page is blocked
from indexing" traces to this robots.txt, not to any meta tag in the HTML.
