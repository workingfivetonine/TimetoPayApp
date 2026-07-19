import { Platform } from "react-native";

const CLERK_PROXY_PATH = "/api/__clerk";

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
    // The API runs on the `api.` subdomain (Railway), NOT the frontend origin.
    // Derive it from the current host so the app keeps working even when the
    // EXPO_PUBLIC_API_URL build var is unset — otherwise every /api call hits the
    // SPA and returns HTML ("Unexpected token '<' ... is not valid JSON").
    const host = window.location.hostname.replace(/^www\./, "");
    return `https://api.${host}`;
  }
  return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
}

export function getClerkProxyUrl(): string | undefined {
  // Native routes Clerk's Frontend API through our own fast app-server proxy
  // (/api/__clerk) instead of the custom clerk.* domain, which stalls ~12s on
  // mobile (unreachable-IPv6 timeout before IPv4 fallback). Web is left on the
  // direct domain — browsers do Happy-Eyeballs (fast) and rely on same-site
  // cookies, so a cross-origin proxy would only add risk there.
  if (Platform.OS === "web") return undefined;
  return `${getApiOrigin()}/api/__clerk`;
}
