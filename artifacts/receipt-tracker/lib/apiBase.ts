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
    return window.location.origin;
  }
  return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
}

export function getClerkProxyUrl(): string | undefined {
  return undefined;
}
