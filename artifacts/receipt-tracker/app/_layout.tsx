import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataProvider } from "@/context/DataContext";
import { getApiOrigin, getClerkProxyUrl } from "@/lib/apiBase";

// Set base URL for API calls. On production web this resolves to the live
// serving origin so the app works on the custom domain AND the *.replit.app
// domain (baked absolute URLs would be cross-origin on the other domain and
// break Clerk's session — blank screen). Native/dev use the build-time domain.
setBaseUrl(getApiOrigin());

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
// Same-origin Clerk proxy on production web (works on any serving domain);
// undefined in dev (Clerk hits the dev FAPI directly).
const proxyUrl = getClerkProxyUrl();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="landing" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="scan" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="review-receipt" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="receipt/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="store/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="catalog" options={{ headerShown: false }} />
      <Stack.Screen name="account" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="admin/[userId]" options={{ headerShown: false }} />
      <Stack.Screen name="admin/global" options={{ headerShown: false }} />
      <Stack.Screen name="admin/catalog" options={{ headerShown: false }} />
    </Stack>
  );
}

// Clears the React Query cache whenever the signed-in user changes so
// data from a previous account never leaks into another's session.
function CacheInvalidator() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prev.current !== undefined && prev.current !== userId) {
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

  // Attach the Clerk bearer token to every generated API request.
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  const inAuthGroup = segments[0] === "(auth)";
  const onLanding = segments[0] === "landing";
  const isPublicRoute = inAuthGroup || onLanding;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !isPublicRoute) {
      router.replace("/landing");
    } else if (isSignedIn && isPublicRoute) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, isPublicRoute, router]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <RootLayoutNav />;
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

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl}>
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <CacheInvalidator />
              <DataProvider>
                <GestureHandlerRootView>
                  <KeyboardProvider>
                    <InitialLayout />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </DataProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
