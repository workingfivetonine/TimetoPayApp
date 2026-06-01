import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useDesktop } from "@/hooks/useDesktop";
import { DesktopSidebar } from "@/components/DesktopSidebar";

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isDesktop = useDesktop();
  const { isLoaded, isSignedIn } = useAuth();

  // The app root "/" resolves to this protected group. Guard it declaratively
  // so signed-out users never mount the authed tab screens (which call
  // protected APIs and blanked the page on production web — read as "sign-in
  // does nothing"). <Redirect> fires from inside the mounted root navigator,
  // so the redirect is reliable (unlike unmounting the navigator for a
  // spinner, which leaves router navigation with nothing to act on).
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!isSignedIn) {
    return <Redirect href="/landing" />;
  }

  const tabs = (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: isDesktop
          ? { display: "none" }
          : {
              position: "absolute",
              backgroundColor: isIOS ? "transparent" : colors.background,
              borderTopWidth: isWeb ? 1 : StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
              elevation: 0,
              ...(isWeb ? { height: 84 } : {}),
            },
        tabBarBackground: isDesktop
          ? undefined
          : () =>
              isIOS ? (
                <BlurView
                  intensity={100}
                  tint={isDark ? "dark" : "light"}
                  style={StyleSheet.absoluteFill}
                />
              ) : isWeb ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
              ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Receipts",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: "Stores",
          tabBarIcon: ({ color }) => <Feather name="shopping-bag" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: "List",
          tabBarIcon: ({ color }) => <Feather name="check-square" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
    </Tabs>
  );

  if (isDesktop) {
    return (
      <View style={[styles.desktopRoot, { backgroundColor: colors.background }]}>
        <DesktopSidebar />
        <View style={styles.desktopContent}>
          <View style={styles.desktopInner}>{tabs}</View>
        </View>
      </View>
    );
  }

  return tabs;
}

const styles = StyleSheet.create({
  desktopRoot: {
    flex: 1,
    flexDirection: "row",
  },
  desktopContent: {
    flex: 1,
    alignItems: "center",
  },
  desktopInner: {
    flex: 1,
    width: "100%",
    maxWidth: 960,
  },
});
