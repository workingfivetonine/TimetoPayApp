import { Linking, Platform } from "react-native";

export type LegalPage = "terms" | "privacy" | "support";

/**
 * Open one of the standalone legal pages. They are server-rendered HTML served
 * by Vercel rewrites (see `vercel.json`), not in-app routes, so they always
 * open as a full web page rather than through the router.
 *
 * Shared so that the terms a user agrees to at sign-up and the terms linked
 * from the landing page and Account screen can never drift to different URLs.
 */
export function openLegalPage(page: LegalPage): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.href = `/${page}`;
    return;
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN || "www.5to9shopping.com";
  void Linking.openURL(`https://${domain}/${page}`);
}
