---
name: Receipt Tracker deployment serves both a web app and Expo Go mobile
description: How the published deployment serves the real browser web app AND the Expo Go mobile distribution from one artifact, plus the Replit default-robots gotcha.
---

# Deployment is dual-mode: real web app for browsers + Expo Go for mobile

The receipt-tracker artifact is `kind = "mobile"` (`router = "expo-domain"`,
`BASE_PATH = "/"`), but its production build serves BOTH surfaces:

- `scripts/build.js` runs `expo export --platform web` (SPA — `app.json`
  `web.output: "single"`) into `static-build/web/`, IN ADDITION TO building the
  iOS/Android Expo Go bundles + manifests. The web export runs BEFORE
  `startMetro()` to avoid Metro port 8081 contention.
- `server/serve.js` routes by request:
  - `expo-platform: ios|android` header on `/` or `/manifest` → platform
    manifest JSON (Expo Go, unchanged).
  - browser `/` → real web app (`static-build/web/index.html`) with SEO
    `<title>`/description/OG/Twitter/canonical/robots meta injected at serve time.
  - static assets resolve from `static-build/web` first, then the timestamped
    Expo Go build (`static-build/<timestamp>/...`), so both keep working.
  - extensionless unknown paths → SPA fallback to the web index (deep links like
    `/catalog` survive reload); paths with an extension → 404.
  - if `static-build/web/index.html` is missing, `serveWebApp` falls back to the
    old Expo Go QR landing page.

The web build gets the same `EXPO_PUBLIC_*` env as mobile (domain, Clerk key,
repl id). App code already supports web (react-native-web; camera falls back to
image picker). API base URL is set in `app/_layout.tsx` via
`setBaseUrl(https://EXPO_PUBLIC_DOMAIN)` and calls hit `/api/...` on the same
domain (api-server artifact at `/api`).

**Why:** the user wanted a real, indexable website in addition to mobile, not
just a "download Expo Go" launcher.

**How to apply:** the served browser page is now the actual product. SEO meta is
injected by regex in serve.js (`injectSeo`) — brittle if Expo changes the
exported index.html structure, so re-verify after Expo SDK upgrades. All web/SEO
changes require a REPUBLISH to take effect.

# Replit deployments block indexing by default

A published Replit deployment serves a default `robots.txt` of `User-agent: * /
Disallow: /` until the app serves its own. serve.js now responds to
`/robots.txt` (Allow: /) + `/sitemap.xml`; this only takes effect after
republish. Lighthouse "Page is blocked from indexing" traces to this default
robots.txt, not to any meta tag.
