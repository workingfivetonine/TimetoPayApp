import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { searchItemNames } from "@workspace/api-client-react";
import type { ItemNameSearchMatch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  // Warning styling for an AI-scanned name the model was unsure about.
  uncertain?: boolean;
  style?: object;
}

// Wait this long after the last keystroke before asking the server. Typing a
// word fires one request instead of one per letter.
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

// Item name input with tap-to-fill suggestions: the user's own items first,
// then names from the shared catalog. Free text stays allowed — a suggestion is
// a shortcut, never a constraint.
//
// Picking an existing name is the point: it keeps one item with one price
// history, instead of "Cheddar", "cheddar cheese" and "Mature Cheddar" each
// tracking a third of the story.
export function ItemNameField({
  value,
  onChangeText,
  placeholder = "Item name",
  autoFocus,
  uncertain,
  style,
}: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<ItemNameSearchMatch[]>([]);
  // Bumped on every request so a slow earlier response can't overwrite the
  // results of a later, more specific query.
  const requestRef = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setMatches([]);
      return;
    }
    const id = ++requestRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchItemNames({ q });
          if (requestRef.current !== id) return;
          // Drop an exact match: offering the user what they already typed is
          // just a row that does nothing.
          setMatches(res.suggestions.filter((s) => s.name.toLowerCase() !== q.toLowerCase()));
        } catch {
          // Suggestions are a convenience. A failed lookup must never get in
          // the way of typing a name.
          if (requestRef.current === id) setMatches([]);
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const visible = open && matches.length > 0;

  return (
    <View>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: uncertain ? colors.warningBackground : colors.card,
            borderColor: uncertain ? colors.warning : colors.border,
            color: colors.foreground,
          },
          style,
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        value={value}
        autoFocus={autoFocus}
        onChangeText={(v) => {
          onChangeText(v);
          setOpen(v.trim().length >= MIN_CHARS);
        }}
        onFocus={() => setOpen(value.trim().length >= MIN_CHARS)}
        returnKeyType="done"
      />

      {visible ? (
        <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {matches.map((m) => (
            <TouchableOpacity
              key={`${m.source}:${m.name}`}
              style={styles.row}
              onPress={() => {
                onChangeText(m.name);
                setOpen(false);
              }}
              activeOpacity={0.7}
            >
              {/* The icon says where the name came from, so "one you've bought
                  before" is distinguishable from "a name other people use". */}
              <Feather
                name={m.source === "history" ? "rotate-ccw" : "globe"}
                size={13}
                color={m.source === "history" ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.rowText, { color: colors.foreground }]} numberOfLines={1}>
                {m.name}
              </Text>
              {m.source === "history" ? (
                <Text style={[styles.rowTag, { color: colors.mutedForeground }]}>bought before</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  rowTag: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
