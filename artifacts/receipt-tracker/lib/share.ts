import { Linking, Platform, Share } from "react-native";

// Public-facing brand name + marketing copy used in every share surface.
export const APP_NAME = "TimetoPay";

// The public URL we want people to land on. On web we use the live serving
// origin; on native we fall back to the marketing domain (mirrors landing.tsx).
export function appUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN || "www.5to9shopping.com";
  return `https://${domain}`;
}

export const SHARE_MESSAGE =
  "I'm using TimetoPay to scan receipts and track grocery prices automatically. Check it out:";

// Full text (message + link) for channels that take a single string (SMS, native sheet).
export function shareText(): string {
  return `${SHARE_MESSAGE} ${appUrl()}`;
}

// Open an external URL: new tab for http(s) on web, native scheme via location
// (so sms: works), and the OS handler on native.
export function openExternal(url: string): void {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (/^https?:/i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = url;
    }
    return;
  }
  void Linking.openURL(url);
}

// Native OS share sheet (covers Messages/SMS + every installed social app).
export async function nativeShare(): Promise<void> {
  try {
    await Share.share({ message: shareText() });
  } catch {
    // user cancelled or unsupported — no-op
  }
}

// Web Share API (available on most mobile browsers) — opens the OS share sheet.
export function canWebShare(): boolean {
  return (
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    typeof (navigator as Navigator & { share?: unknown }).share === "function"
  );
}

export async function webShare(): Promise<void> {
  try {
    await (
      navigator as Navigator & {
        share: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
      }
    ).share({ title: APP_NAME, text: SHARE_MESSAGE, url: appUrl() });
  } catch {
    // user cancelled or unsupported — no-op
  }
}

// Copy the app link to the clipboard (web only). Returns whether it succeeded.
export async function copyAppLink(): Promise<boolean> {
  try {
    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      navigator.clipboard
    ) {
      await navigator.clipboard.writeText(appUrl());
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// Channel-specific share URLs.
export function smsUrl(): string {
  return `sms:?&body=${encodeURIComponent(shareText())}`;
}
export function whatsappUrl(): string {
  return `https://wa.me/?text=${encodeURIComponent(shareText())}`;
}
export function twitterUrl(): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    SHARE_MESSAGE,
  )}&url=${encodeURIComponent(appUrl())}`;
}
export function facebookUrl(): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl())}`;
}
