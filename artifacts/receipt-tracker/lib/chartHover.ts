import { Platform } from "react-native";

// react-native-svg's shared Circle/Rect prop types don't declare onMouseEnter /
// onMouseLeave — but its web renderer forwards any unrecognised prop straight
// onto the real DOM node (see node_modules/react-native-svg/.../web/utils/
// prepare.js: everything not explicitly destructured passes through via
// `...rest`), so these work at runtime on web. There's nothing to type them
// against, hence the any — it's a deliberate, narrow escape for a real,
// verified runtime behaviour, not a shortcut around one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function webHoverProps(onEnter: () => void, onLeave: () => void): any {
  if (Platform.OS !== "web") return {};
  return { onMouseEnter: onEnter, onMouseLeave: onLeave };
}
