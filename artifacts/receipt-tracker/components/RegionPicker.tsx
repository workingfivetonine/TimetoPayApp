import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  COUNTRIES,
  US_STATES,
  isStateScoped,
  countryName,
  usStateName,
} from "@workspace/geo";
import { useColors } from "@/hooks/useColors";

type Option = { code: string; name: string };

interface RegionPickerProps {
  countryCode: string | null;
  stateCode: string | null;
  onChange: (countryCode: string | null, stateCode: string | null) => void;
}

// Country select + (US-only) state select. Selecting a non-US country clears any
// previously-chosen state; selecting US leaves the state to be picked. Used by
// the first-run region gate, account settings, and the store edit modal.
export function RegionPicker({ countryCode, stateCode, onChange }: RegionPickerProps) {
  const colors = useColors();
  const [open, setOpen] = useState<null | "country" | "state">(null);
  const [query, setQuery] = useState("");

  const stateScoped = isStateScoped(countryCode);

  const options: Option[] = open === "state" ? US_STATES : COUNTRIES;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q),
    );
  }, [options, query]);

  const selectCountry = (code: string) => {
    onChange(code, isStateScoped(code) ? stateCode : null);
    setOpen(null);
    setQuery("");
  };
  const selectState = (code: string) => {
    onChange(countryCode, code);
    setOpen(null);
    setQuery("");
  };

  const countryLabel = countryName(countryCode) ?? "Select country";
  const stateLabel = usStateName(stateCode) ?? "Select state";

  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>COUNTRY</Text>
      <TouchableOpacity
        style={[styles.select, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => {
          setQuery("");
          setOpen("country");
        }}
        activeOpacity={0.7}
      >
        <Text style={[styles.selectText, { color: countryCode ? colors.foreground : colors.mutedForeground }]}>
          {countryLabel}
        </Text>
        <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      {stateScoped ? (
        <>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STATE</Text>
          <TouchableOpacity
            style={[styles.select, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              setQuery("");
              setOpen("state");
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.selectText, { color: stateCode ? colors.foreground : colors.mutedForeground }]}>
              {stateLabel}
            </Text>
            <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </>
      ) : null}

      <Modal visible={open !== null} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {open === "state" ? "Select state" : "Select country"}
            </Text>
            <TouchableOpacity onPress={() => setOpen(null)} hitSlop={8}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchWrap}>
            <TextInput
              style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search…"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected =
                open === "state" ? item.code === stateCode : item.code === countryCode;
              return (
                <TouchableOpacity
                  style={[styles.option, { borderBottomColor: colors.border }]}
                  onPress={() => (open === "state" ? selectState(item.code) : selectCountry(item.code))}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, { color: colors.foreground }]}>{item.name}</Text>
                  {selected ? <Feather name="check" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 14,
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  selectText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
