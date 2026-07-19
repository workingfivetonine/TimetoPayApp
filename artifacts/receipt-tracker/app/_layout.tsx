import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, ClerkLoaded, ClerkLoading, useAuth } from "@clerk/expo";
import { tokenCache } from "@/lib/tokenCache";
import "@/lib/pwaInstall"; // side-effect: registers beforeinstallprompt listener in root bundle
import {
  setAuthTokenGetter,
  setBaseUrl,
  setClientPlatform,
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import Toast, {
  BaseToast,
  ErrorToast,
  type BaseToastProps,
} from "react-native-toast-message";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BoardNotificationProvider } from "@/contexts/BoardNotification";
import { AnnualOfferModal } from "@/components/AnnualOfferModal";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { DataProvider } from "@/context/DataContext";
import { getApiOrigin } from "@/lib/apiBase";
import {
  queryClient,
  asyncStoragePersister,
  OFFLINE_CACHE_MAX_AGE,
} from "@/lib/queryClient";

// Set base URL for API calls. On production web this resolves to the live
// serving origin so the app works on the custom domain AND the *.replit.app
// domain (baked absolute URLs would be cross-origin on the other domain and
// break Clerk's session — blank screen). Native/dev use the build-time domain.
// Pass a RESOLVER (not a fixed string): the generated client then computes the
// origin on every request in the browser, so it can never bake/keep a wrong
// value (e.g. http://localhost) from Expo's no-window static-export module eval.
setBaseUrl(() => getApiOrigin());

// Declare the platform so the server can enforce the web-only paywall (native
// clients are intentionally never paywalled to avoid app-store IAP policy).
setClientPlatform(Platform.OS);

// Register the PWA service worker on web so Chrome fires `beforeinstallprompt`.
if (Platform.OS === "web" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => { /* non-fatal */ });
}

// Link the web app manifest + icons into <head> at runtime. Expo's web export
// (`output: "single"`) does NOT add a <link rel="manifest"> to the served HTML,
// and without it Chrome never fires `beforeinstallprompt` — so the install
// button has nothing to trigger. Injecting here (web only, idempotent) makes the
// page installable. Runs at module load, before first paint.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const head = document.head;
  const ensureTag = (selector: string, create: () => HTMLElement) => {
    if (!head.querySelector(selector)) head.appendChild(create());
  };
  ensureTag('link[rel="manifest"]', () => {
    const l = document.createElement("link");
    l.rel = "manifest";
    l.href = "/manifest.json";
    return l;
  });
  ensureTag('link[rel="apple-touch-icon"]', () => {
    const l = document.createElement("link");
    l.rel = "apple-touch-icon";
    l.href = "/apple-touch-icon.png";
    return l;
  });
  ensureTag('meta[name="theme-color"]', () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "theme-color");
    m.content = "#6d28d9";
    return m;
  });
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
// Same-origin Clerk proxy on production web (works on any serving domain);
// undefined in dev (Clerk hits the dev FAPI directly).

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// react-native-toast-message clamps the message (text2) to ONE line inside a
// fixed-height pill by default, which truncated longer messages (e.g. upload
// failure reasons) mid-sentence. This config lets the message wrap to as many
// lines as it needs and grows the toast height to fit.
const toastBaseStyle = {
  height: "auto" as const,
  minHeight: 60,
  width: "90%" as const,
  maxWidth: 420,
  paddingVertical: 10,
};
const toastContentStyle = { paddingHorizontal: 14, paddingVertical: 6 };
const toastText2Style = { fontSize: 13 };

const toastConfig = {
  success: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={{ ...toastBaseStyle, borderLeftColor: "#22c55e" }}
      contentContainerStyle={toastContentStyle}
      text1NumberOfLines={2}
      text2NumberOfLines={0}
      text2Style={toastText2Style}
    />
  ),
  error: (props: BaseToastProps) => (
    <ErrorToast
      {...props}
      style={{ ...toastBaseStyle, borderLeftColor: "#ef4444" }}
      contentContainerStyle={toastContentStyle}
      text1NumberOfLines={2}
      text2NumberOfLines={0}
      text2Style={toastText2Style}
    />
  ),
};

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="landing" options={{ headerShown: false }} />
      <Stack.Screen name="pricing" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="scan" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="review-receipt" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="batch-review" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="receipt/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="store/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="catalog" options={{ headerShown: false }} />
      <Stack.Screen name="profile-setup" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="region-setup" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="choose-plan" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="account" options={{ headerShown: false }} />
      <Stack.Screen name="paywall" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="help" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="admin/[userId]" options={{ headerShown: false }} />
      <Stack.Screen name="admin/global" options={{ headerShown: false }} />
      <Stack.Screen name="admin/catalog" options={{ headerShown: false }} />
    </Stack>
  );
}

// Clears the React Query cache — in memory AND the persisted offline copy —
// whenever the signed-in user changes, so one account's data never leaks into
// another's session (matches the offline-persistence per-user scoping).
function CacheInvalidator() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== undefined && prev.current !== userId) {
      // Drop the persisted snapshot first so a reload can't restore stale data,
      // then clear memory (the provider re-persists the now-empty cache).
      void asyncStoragePersister.removeClient();
      qc.clear();
    }
    prev.current = userId;
  }, [userId, qc]);
  return null;
}

function InitialLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Keep the module-level token getter current on every render so React Query
  // always has the latest getToken before firing a request. Called during render
  // (not in an effect) to eliminate the race where a query fires between the
  // render that enabled it and the effect that would have updated the getter.
  setAuthTokenGetter(() => getToken());

  // Keep the base-URL resolver registered (idempotent). The resolver form means
  // every request computes the origin fresh in the browser, so an early query
  // (before this render) can't grab a stale/wrong base.
  setBaseUrl(() => getApiOrigin());

  const inAuthGroup = segments[0] === "(auth)";
  const onLanding = segments[0] === "landing";
  const onPricing = segments[0] === "pricing";
  const onRegionSetup = segments[0] === "region-setup";
  const onChoosePlan = segments[0] === "choose-plan";
  const onProfileSetup = segments[0] === "profile-setup";
  const isPublicRoute = inAuthGroup || onLanding || onPricing;

  // Region gate: a signed-in user must pick a region before using the app, since
  // the catalog is scoped by it. Only fetch once signed in.
  const { data: me } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), enabled: isSignedIn },
  });
  const needsRegion = isSignedIn && me != null && !me.countryCode;
  // After region is set, a brand-new user picks a plan once (Subscribe / trial /
  // free). planSelected flips permanently after any choice on /choose-plan.
  // Web-only: native is never paywalled, so mobile onboarding must NOT be routed
  // through the plan picker (the choice is meaningless there).
  // TimetoPay is free — there is no plan to pick, so the plan-picker onboarding
  // step is disabled. (The /choose-plan screen is kept but no longer routed to.)
  const needsPlan = false;

  // Every signed-in user sets a username + avatar once, right after signup —
  // before region/plan. (username lives on the server CurrentUser response.)
  const needsProfile =
    isSignedIn && me != null && !(me as { username?: string | null }).username;

  // Freemium model: we no longer redirect lapsed web users to the paywall.
  // Free users keep full access to their own data; premium surfaces (AI scan,
  // global catalog, deep price-history analytics) are gated in-place with an
  // upsell (see usePremiumLock) and the server returns 403 on those routes.

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !isPublicRoute) {
      router.replace("/landing");
    } else if (isSignedIn && isPublicRoute) {
      router.replace("/");
    } else if (needsProfile && !onProfileSetup) {
      router.replace("/profile-setup");
    } else if (needsRegion && !onRegionSetup && !onProfileSetup) {
      router.replace("/region-setup");
    } else if (needsPlan && !onChoosePlan && !onRegionSetup && !onProfileSetup) {
      router.replace("/choose-plan");
    }
    // Note: we do NOT bounce users who already have a region off /region-setup —
    // that screen doubles as the "edit my region" settings screen.
  }, [
    isLoaded,
    isSignedIn,
    isPublicRoute,
    needsProfile,
    needsRegion,
    needsPlan,
    onProfileSetup,
    onRegionSetup,
    onChoosePlan,
    router,
  ]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <RootLayoutNav />
      <AnnualOfferModal />
      <UpdatePrompt />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  // Guard: if the Clerk publishable key didn't get baked into this build, every
  // screen (all gated behind <ClerkLoaded>) would render blank. Show a clear
  // message instead of a white screen so the cause is obvious.
  if (!publishableKey) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ fontSize: 16, textAlign: "center" }}>
          Configuration error: the sign-in key is missing from this build.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* ErrorBoundary OUTSIDE Clerk so a Clerk init/render error shows a message
          instead of a white screen. */}
      <ErrorBoundary>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          {/* Visible state while Clerk initializes (was blank → white screen). */}
          <ClerkLoading>
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 12, color: "#666" }}>Starting up…</Text>
            </View>
          </ClerkLoading>
          <ClerkLoaded>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{
                persister: asyncStoragePersister,
                maxAge: OFFLINE_CACHE_MAX_AGE,
                // Read-only offline: never persist (and later resume) mutations.
                dehydrateOptions: { shouldDehydrateMutation: () => false },
              }}
            >
              <CacheInvalidator />
              <DataProvider>
                <BoardNotificationProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <InitialLayout />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </BoardNotificationProvider>
              </DataProvider>
            </PersistQueryClientProvider>
          </ClerkLoaded>
          <Toast config={toastConfig} />
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
