---
name: Native React Query online detection
description: Why offline UI needs NetInfo wired into onlineManager on React Native, and how to pick the version.
---

React Query's `onlineManager` reports "always online" on React Native unless you
wire connectivity in yourself. Its default web listener tracks the browser
`online`/`offline` events, but native has no equivalent, so cached/offline UI
(banners, paused queries) silently never fires on iOS/Android.

**Fix:** on native only, `onlineManager.setEventListener((setOnline) => NetInfo.addEventListener(...))`,
mapping `isInternetReachable ?? isConnected ?? true`. Keep web on the default
listener (don't override) so its proven behavior is untouched.

**Why the null fallback:** `isInternetReachable` is `null` until NetInfo's first
probe resolves; treating null as reachable avoids flashing "offline" on launch.

**How to apply / version pinning:** install the Expo-SDK-compatible NetInfo
version — read it from `node_modules/expo/bundledNativeModules.json` (key
`@react-native-community/netinfo`) rather than latest, so it works in Expo Go.
For SDK 54 that was 11.4.1.
