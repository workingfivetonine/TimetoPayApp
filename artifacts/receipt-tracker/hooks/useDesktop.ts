import { Platform, useWindowDimensions } from "react-native";

const DESKTOP_BREAKPOINT = 768;

export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
}
