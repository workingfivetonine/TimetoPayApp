import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useListStores } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  // Warning styling for an AI-scanned name the model was unsure about.
  uncertain?: boolean;
}

// Store name input backed by the user's existing stores as tap-to-fill
// suggestions. Free text stays allowed — picking a suggestion is a shortcut,
// not a constraint, so a genuinely new store can still be typed in.
export function StoreNameField({
  value,
  onChangeText,
  placeholder = "Store name",
  autoFocus,
  uncertain,
}: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const { data: stores } = useListStores();

  const suggestions = useMemo(() => {
    if (!stores || !value.trim()) return [];
    const q = value.toLowerCase();
    return stores
      .filter((s) => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q)
      .slice(0, 5);
  }, [stores, value]);

  return (
    <View>
      <View
        style={[
          styles.inputRow,
          {
            borderColor: uncertain ? colors.warning : colors.border,
            backgroundColor: colors.card,
          },
        ]}
      >
        <Feather name="shopping-bag" size={15} color={colors.mutedForeground} style={styles.leadingIcon} />
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={value}
          autoFocus={autoFocus}
          onChangeText={(v) => {
            onChangeText(v);
            setOpen(v.trim().length > 0);
          }}
          onFocus={() => setOpen(value.trim().length > 0)}
          returnKeyType="next"
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              onChangeText("");
              setOpen(false);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.clearBtn}
            accessibilityLabel="Clear store name"
          >
            <Feather name="x-circle" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {open && suggestions.length > 0 && (
        <View
          style={[
            styles.dropdown,
            { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.foreground },
          ]}
        >
          {suggestions.map((store) => (
            <TouchableOpacity
              key={store.id}
              style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                onChangeText(store.name);
                setOpen(false);
              }}
            >
              <Feather name="shopping-bag" size={13} color={colors.primary} />
              <Text style={[styles.dropdownText, { color: colors.foreground }]}>{store.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    height: 46,
    gap: 8,
  },
  leadingIcon: { marginLeft: 12 },
  input: { flex: 1, height: 46, fontSize: 15, fontFamily: "Inter_400Regular" },
  clearBtn: { marginRight: 12 },
  dropdown: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 12,
    zIndex: 100,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
