import React from "react";
import { Platform, TextInput, StyleProp, TextStyle } from "react-native";

interface Props {
  // Date as an ISO calendar string (YYYY-MM-DD), the value the screens already use.
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Native TextInput style (mobile only).
  style?: StyleProp<TextStyle>;
  placeholderTextColor?: string;
  // Text color for the web <input> (so it follows the theme).
  color?: string;
  // Extra CSS for the web <input>, merged over the inline defaults (e.g. to give
  // it a border/background when it stands alone rather than inside a row).
  webStyle?: Record<string, string | number>;
}

// A date input that uses the browser's native calendar picker on web and a typed
// YYYY-MM-DD field on mobile. No extra dependency — on web the app renders via
// react-dom, so a real <input type="date"> works and gives a real date picker.
export function DateField({
  value,
  onChange,
  placeholder,
  style,
  placeholderTextColor,
  color,
  webStyle,
}: Props) {
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: "date",
      value: value || "",
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: {
        flex: 1,
        border: "none",
        outline: "none",
        background: "transparent",
        color: color ?? "inherit",
        fontFamily: "Inter_400Regular",
        fontSize: 15,
        padding: 0,
        ...webStyle,
      },
    });
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder ?? "YYYY-MM-DD"}
      placeholderTextColor={placeholderTextColor}
      keyboardType="numbers-and-punctuation"
      style={style}
    />
  );
}
