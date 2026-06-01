---
name: Custom-domain Clerk white screen (Expo RN-web)
description: Why a published Expo-web app blanks on a custom domain but works on the *.replit.app domain, and the origin-relative fix.
---

# Custom-domain Clerk white screen (Expo RN-web)

A published Expo SDK54 RN-web app that uses Replit-managed Clerk via the
production proxy will render a **blank white page (no JS error)** when opened on a
custom primary domain, while working fine on the `*.replit.app` domain.

**Why:** the Expo web build inlines `EXPO_PUBLIC_*` at build time. `build.js`
derives the domain from `REPLIT_INTERNAL_APP_DOMAIN` (the internal `*.replit.app`
host), so the bundle bakes that single absolute domain into BOTH the API base
URL (`setBaseUrl`) and the Clerk `proxyUrl` (`https://<replit-app>/api/__clerk`).
Served from the custom domain, those become **cross-origin**, so Clerk's
cookie/session handshake can't establish and `<ClerkLoaded>` never resolves →
blank page. The bundle's `pk_live` key encodes the Clerk FAPI domain
(`clerk.<customdomain>`), which need not (and here does not) have its own DNS
record because traffic goes through the same-origin proxy.

**How to apply / fix:** on **production web only**, derive the API base URL and
Clerk proxy URL from the live serving origin (`window.location.origin` +
`/api/__clerk`) instead of the baked absolute domain, so the same bundle works on
any domain it's served from. Native (no `window.location`) and dev web (served
from a separate Expo packager origin that does NOT route `/api`) must keep the
build-time `EXPO_PUBLIC_DOMAIN`. Gate "prod web" on
`NODE_ENV==='production' && Platform.OS==='web' && window`. Dev Clerk proxy must
stay `undefined` (dev hits the dev FAPI directly; the proxy is production-only and
`EXPO_PUBLIC_CLERK_PROXY_URL` is empty in dev). The Clerk proxy path is hardcoded
to `/api/__clerk`. Centralize in one helper and use it everywhere a screen builds
`https://${EXPO_PUBLIC_DOMAIN}/api/...` by hand.

**Verify before coding the fix:** Clerk rejects unregistered proxy URLs, so
confirm the instance accepts the custom-domain proxy first — curl
`https://<customdomain>/api/__clerk/v1/client?...` with header
`Clerk-Proxy-Url: https://<customdomain>/api/__clerk`; a valid `client` JSON +
HTTP 200 means the origin-relative fix will work.

**Takes effect only after REPUBLISH** (production bundles are built at publish
time). Do NOT hand-edit Clerk secrets / publishable keys — they're Replit-managed.
