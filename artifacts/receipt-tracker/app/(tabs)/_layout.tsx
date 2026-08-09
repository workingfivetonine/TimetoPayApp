import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useDesktop } from "@/hooks/useDesktop";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { useBoardNotification } from "@/contexts/BoardNotification";

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isDesktop = useDesktop();
  const { isLoaded, isSignedIn } = useAuth();
  const { newCount } = useBoardNotification();

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
          title: "Home",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      {/* Receipts gave up its tab-bar slot to Home. The route still exists and
          is reached from the Home hub (and the desktop sidebar). */}
      <Tabs.Screen name="receipts" options={{ href: null, title: "Receipts" }} />
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
          title: "Stats",
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="bar-chart-2" size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="board"
        options={{
          title: "Board",
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="message-square" size={22} color={color} />
              {newCount > 0 && (
                <View style={[tabStyles.notifBadge, { backgroundColor: colors.destructive }]} />
              )}
            </View>
          ),
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

const tabStyles = StyleSheet.create({
  notifBadge: {
    position: "absolute",
    top: -3,
    right: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
});

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
