---
name: Expo-router auth redirect must keep the navigator mounted
description: Why a signed-out root "/" blanked on Expo RN-web, and the correct expo-router v6 redirect pattern (declarative <Redirect> in the protected layout, not a spinner that replaces the <Stack>).
---

# Expo-router auth redirect must keep the navigator mounted

On an Expo SDK54 / expo-router v6 RN-web app, the app root `/` resolves to the
protected `(tabs)` group (there is no `app/index.tsx`). A **signed-out** user
hitting `/` blanked the page on production web — read by the user as "the app
won't load / the Sign in button does nothing" (the only visible "Sign in" was
Replit's injected feedback widget, NOT the app's auth).

**Why:** the protected tab screens mounted for the signed-out user and fired
authed queries before the redirect ran, blanking the route.

**Failed fix (do NOT repeat):** gating in the ROOT `_layout` `InitialLayout` by
returning an `<ActivityIndicator>` spinner *instead of* `<RootLayoutNav/>` (the
`<Stack>`) while a redirect is "pending". This UNMOUNTS the navigator, so
`router.replace(...)` has no mounted navigator to act on — `useSegments()` never
updates, the redirect never fires, and the page is stuck blank at `/`. The root
`_layout` must ALWAYS render the `<Stack>` after Clerk loads.

**Correct fix:** put the auth guard in the *protected* layout, declaratively,
so the parent navigator stays mounted. In `app/(tabs)/_layout.tsx`:
`const {isLoaded,isSignedIn}=useAuth();` → if `!isLoaded` render a spinner; if
`!isSignedIn` `return <Redirect href="/landing" />;`. `<Redirect>` fires from
INSIDE the mounted root `<Stack>`, so it navigates reliably while the protected
tab screens never mount for signed-out users. Keep the root `_layout`'s
effect-based bidirectional redirect (signed-in on a public route → `/`).

**Residual risk / how to apply:** only `(tabs)` has this declarative guard. Other
protected routes outside it (`/catalog`, `/account`, `/scan`, `/admin/*`, …) still
rely on the root effect and can briefly mount while signed out. The robust
long-term shape is a `(protected)` route group whose `_layout` holds one
`<Redirect>` guard, with a separate `(public)` group (`landing` + `(auth)`).

**Verify with settle-aware checks, not single screenshots:** everything is gated
behind `<ClerkLoaded>`, so a COLD page load is legitimately blank for 1–2s before
content paints. Single-instant `app_preview` screenshots routinely catch this
transient and look like a false failure. Poll `body.innerText` length > 0 (the
testing skill / a browser test) before asserting on landing/redirect state.

**Takes effect in prod only after REPUBLISH** (web bundle built at publish time).
