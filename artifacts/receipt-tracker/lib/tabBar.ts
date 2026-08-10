import { Platform } from "react-native";

// The tab bar is `position: "absolute"` (app/(tabs)/_layout.tsx) so it floats
// OVER the screen instead of taking layout space. That's fine for a scroll view
// (it just needs contentContainer padding), but anything a tab screen pins to
// the BOTTOM — a footer with a button in it — renders underneath the bar and is
// unreachable. Pad past it with this.
//
// The number is the bar's own chrome only; the home-indicator inset sits below
// it and has to be added on top. Web gets an explicit 84pt height in the tab
// layout, and reports no bottom inset, so it carries the whole clearance.
export const TAB_BAR_HEIGHT = Platform.OS === "web" ? 84 : 49;

/**
 * Bottom padding for a footer pinned inside a tab screen: clears the floating
 * tab bar and the home indicator, plus a small visual gap.
 */
export function tabBarClearance(insetBottom: number, gap = 12): number {
  return TAB_BAR_HEIGHT + insetBottom + gap;
}
