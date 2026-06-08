import { Platform } from "react-native";

// CLERK_PROXY_PATH on the API server is hardcoded to "/api/__clerk".
const CLERK_PROXY_PATH = "/api/__clerk";

/**
 * Origin used for API + Clerk-proxy requests.
 *
 * A production web build can be served from EITHER the custom primary domain
 * (e.g. https://5to9shopping.com) OR the *.replit.app domain. `/api` and the
 * Clerk proxy are always same-origin with whatever domain served the page.
 * Build-time absolute URLs are baked for a single domain, so opening the app on
 * the OTHER domain makes every request cross-origin — which breaks Clerk's
 * cookie/session handshake (blank screen) and can fail API auth. On production
 * web we therefore use the live serving origin so the app works on any domain.
 *
 * Native builds and dev web keep the build-time domain: native has no
 * `window.location`, and dev web is served from a separate Expo packager origin
 * that does not route `/api`.
 */
function isProdWeb(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    Platform.OS === "web" &&
    typeof window !== "undefined"
  );
}

export function getApiOrigin(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl;
  }
  if (isProdWeb()) {
    return window.location.origin;
  }
  return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
}

/**
 * Clerk proxy URL passed to `<ClerkProvider proxyUrl>`.
 *
 * - Dev (web or native): `undefined` — Clerk talks to the dev FAPI directly,
 *   the proxy is production-only (`EXPO_PUBLIC_CLERK_PROXY_URL` is empty).
 * - Prod web: same-origin proxy so it works on the custom domain too.
 * - Prod native: the build-time baked proxy URL.
 */
export function getClerkProxyUrl(): string | undefined {
  const configured = process.env.EXPO_PUBLIC_CLERK_PROXY_URL;
  if (!configured) return undefined;
  if (isProdWeb()) {
    return `${window.location.origin}${CLERK_PROXY_PATH}`;
  }
  return configured;
}
