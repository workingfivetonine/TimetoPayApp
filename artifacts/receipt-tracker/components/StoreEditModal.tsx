import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getListStoresQueryKey,
  getGetSpendAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { notify } from "@/lib/confirm";
import { getApiOrigin } from "@/lib/apiBase";
import { StoreNameField } from "@/components/StoreNameField";

export type StoreEditor = ReturnType<typeof useStoreEditor>;

// Repointing a receipt at a different store. Shared by the detail screen and the
// post-scan batch review, which is where a misread store name is most often
// caught. Hits PATCH /api/receipts/:id/store, which moves only this receipt —
// other receipts on the old store are untouched.
export function useStoreEditor(onSaved?: (receiptId: number, storeName: string) => void) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const isOnline = useOnlineStatus();

  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const open = (receiptId: number, currentName: string) => {
    setEditing(receiptId);
    setName(currentName);
  };

  const close = () => setEditing(null);

  const save = async () => {
    if (editing === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      notify("Store name required", "Enter a store name.");
      return;
    }
    if (!isOnline) {
      notify("You're offline", "Connect to the internet to change the store.");
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiOrigin()}/api/receipts/${editing}/store`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-client-platform": Platform.OS,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ storeName: trimmed }),
      });
      if (!res.ok) throw new Error(`store update ${res.status}`);
      queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(editing) });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
      onSaved?.(editing, trimmed);
      setEditing(null);
    } catch {
      notify("Couldn't save", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return { editing, open, close, save, saving, name, setName };
}

export function StoreEditModal({ editor }: { editor: StoreEditor }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={editor.editing !== null} animationType="slide" presentationStyle="formSheet">
      <KeyboardAvoidingView
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.modalHeader,
            {
              borderBottomColor: colors.border,
              paddingTop: Platform.OS === "android" ? insets.top + 16 : 16,
            },
          ]}
        >
          <TouchableOpacity onPress={editor.close}>
            <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Store</Text>
          <TouchableOpacity onPress={editor.save} disabled={editor.saving}>
            <Text style={[styles.modalSave, { color: colors.primary, opacity: editor.saving ? 0.5 : 1 }]}>
              {editor.saving ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STORE</Text>
          <StoreNameField value={editor.name} onChangeText={editor.setName} autoFocus />
          <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
            Only this receipt moves. Other receipts keep their current store.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalSave: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalContent: { padding: 20 },
  modalHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 12 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
});
