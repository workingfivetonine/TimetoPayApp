import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  useListStores,
  useCreateStore,
  useUpdateStore,
  useDeleteStore,
  getListStoresQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { StoreCard } from "@/components/StoreCard";
import { EmptyState } from "@/components/EmptyState";
import type { Store } from "@workspace/api-client-react";
import { useRouter } from "expo-router";

interface StoreFormData {
  name: string;
  deliveryAvailable: boolean;
  deliveryFee: string;
  minimumOrderAmount: string;
  notes: string;
}

const defaultForm: StoreFormData = {
  name: "",
  deliveryAvailable: false,
  deliveryFee: "",
  minimumOrderAmount: "",
  notes: "",
};

export default function StoresScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [form, setForm] = useState<StoreFormData>(defaultForm);

  const { data: stores, isLoading } = useListStores();
  const createMutation = useCreateStore();
  const updateMutation = useUpdateStore();
  const deleteMutation = useDeleteStore();

  const paddingTop = Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
    setRefreshing(false);
  };

  const openAdd = () => {
    setEditingStore(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (store: Store) => {
    setEditingStore(store);
    setForm({
      name: store.name,
      deliveryAvailable: store.deliveryAvailable,
      deliveryFee: store.deliveryFee != null ? String(store.deliveryFee) : "",
      minimumOrderAmount: store.minimumOrderAmount != null ? String(store.minimumOrderAmount) : "",
      notes: store.notes ?? "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const data = {
      name: form.name.trim(),
      deliveryAvailable: form.deliveryAvailable,
      deliveryFee: form.deliveryFee ? Number(form.deliveryFee) : null,
      minimumOrderAmount: form.minimumOrderAmount ? Number(form.minimumOrderAmount) : null,
      notes: form.notes.trim() || null,
    };

    if (editingStore) {
      updateMutation.mutate(
        { id: editingStore.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
            setShowModal(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
            setShowModal(false);
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() }),
      }
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Stores</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={openAdd}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={stores ?? []}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom },
            (!stores || stores.length === 0) && styles.emptyList,
          ]}
          scrollEnabled={!!(stores && stores.length > 0)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState icon="shopping-bag" title="No stores yet" subtitle="Add a store to start tracking where you shop" />
          }
          renderItem={({ item }) => (
            <StoreCard
              store={item}
              onPress={() => router.push(`/store/${item.id}`)}
            />
          )}
        />
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={[styles.modalCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingStore ? "Edit Store" : "Add Store"}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[styles.modalSave, { color: colors.primary }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STORE NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Whole Foods"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />

            <View style={[styles.switchRow, { borderColor: colors.border }]}>
              <View>
                <Text style={[styles.switchLabel, { color: colors.foreground }]}>Delivery Available</Text>
                <Text style={[styles.switchSub, { color: colors.mutedForeground }]}>
                  Enable to track delivery costs
                </Text>
              </View>
              <Switch
                value={form.deliveryAvailable}
                onValueChange={(v) => setForm((f) => ({ ...f, deliveryAvailable: v }))}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            {form.deliveryAvailable && (
              <>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DELIVERY FEE ($)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form.deliveryFee}
                  onChangeText={(v) => setForm((f) => ({ ...f, deliveryFee: v }))}
                  placeholder="e.g. 4.99"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />

                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>MINIMUM ORDER ($)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form.minimumOrderAmount}
                  onChangeText={(v) => setForm((f) => ({ ...f, minimumOrderAmount: v }))}
                  placeholder="e.g. 35.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
              </>
            )}

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.notes}
              onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
              placeholder="Add any notes about this store..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  emptyList: { flex: 1 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalCancel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  modalSave: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalContent: { padding: 20 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  switchLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  switchSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
