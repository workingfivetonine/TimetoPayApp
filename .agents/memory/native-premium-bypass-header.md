---
name: Native premium-bypass relies on x-client-platform header
description: Raw expoFetch calls to premium API endpoints must manually send x-client-platform or native users get wrongly 403'd.
---

The web-only premium paywall (`requirePremium`) bypasses gating for requests
carrying `x-client-platform: ios|android`. The generated API client sets this
header automatically (via `setClientPlatform`), but **hand-written `expoFetch`
calls do not** — they must add `"x-client-platform": Platform.OS` to their
headers explicitly.

**Why:** Several screens call premium AI endpoints (`/receipts/parse`,
`/detect-bounds`, `/parse-pdf`) with raw `expoFetch` instead of the generated
hooks (for base64 upload / streaming control). Without the header the server
evaluates the native request as web and returns 403, silently breaking mobile
AI scanning — even though "native is never paywalled" is a core invariant.

**How to apply:** Any new raw fetch to a `requirePremium` route from the Expo
app must include the platform header. If you add a premium endpoint or a new raw
fetch call site, grep for `expoFetch` + the endpoint and confirm the header is
present. Prefer the generated client when possible (it handles this for free).
