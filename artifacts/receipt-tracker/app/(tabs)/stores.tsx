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
  getListReceiptsQueryKey,
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useDesktop } from "@/hooks/useDesktop";
import { StoreCard } from "@/components/StoreCard";
import { EmptyState } from "@/components/EmptyState";
import { confirmDestructive } from "@/lib/confirm";
import type { Store } from "@workspace/api-client-react";
import { useRouter } from "expo-router";

interface StoreFormData {
  name: string;
  address: string;
  phone: string;
  openTimes: string;
  deliveryAvailable: boolean;
  deliveryFee: string;
  minimumOrderAmount: string;
  notes: string;
}

const defaultForm: StoreFormData = {
  name: "",
  address: "",
  phone: "",
  openTimes: "",
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

  const isDesktop = useDesktop();
  const paddingTop = isDesktop ? 32 : Platform.OS === "web" ? 67 : insets.top + 8;
  const paddingBottom = isDesktop ? 24 : Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

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
      address: store.address ?? "",
      phone: store.phone ?? "",
      openTimes: store.openTimes ?? "",
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
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      openTimes: form.openTimes.trim() || null,
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

  const handleDelete = () => {
    if (!editingStore) return;
    const store = editingStore;
    confirmDestructive({
      title: `Delete ${store.name}?`,
      message:
        "This permanently deletes the store along with all of its scanned receipts and their line items. This can't be undone.",
      confirmLabel: "Delete",
      onConfirm: () => {
        deleteMutation.mutate(
          { id: store.id },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetShoppingListQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetSpendAnalyticsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDailySpendQueryKey() });
              queryClient.invalidateQueries({
                predicate: (q) =>
                  typeof q.queryKey[0] === "string" &&
                  ((q.queryKey[0] as string).startsWith("/api/receipts") ||
                    (q.queryKey[0] as string).startsWith("/api/analytics/stores")),
              });
              setShowModal(false);
            },
          }
        );
      },
    });
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
              onEdit={() => openEdit(item)}
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

          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            {/* ── Basic Info ─────────────────────────────── */}
            <SectionDivider label="STORE INFO" colors={colors} />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>STORE NAME *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Whole Foods"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ADDRESS</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.address}
              onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
              placeholder="123 Main St, City, State"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
            />

            <View style={styles.twoCol}>
              <View style={styles.colItem}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PHONE</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form.phone}
                  onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                  placeholder="555-0100"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.colItem}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>OPEN TIMES</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form.openTimes}
                  onChangeText={(v) => setForm((f) => ({ ...f, openTimes: v }))}
                  placeholder="Mon–Fri 9am–9pm"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* ── Delivery ───────────────────────────────── */}
            <SectionDivider label="DELIVERY" colors={colors} />

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
                  returnKeyType="next"
                />

                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>MINIMUM ORDER ($)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form.minimumOrderAmount}
                  onChangeText={(v) => setForm((f) => ({ ...f, minimumOrderAmount: v }))}
                  placeholder="e.g. 35.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </>
            )}

            {/* ── Notes ─────────────────────────────────── */}
            <SectionDivider label="NOTES" colors={colors} />

            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={form.notes}
              onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
              placeholder="Add any notes about this store..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
            />

            {editingStore && (
              <TouchableOpacity
                style={[styles.deleteBtn, { borderColor: colors.destructive }]}
                onPress={handleDelete}
                disabled={deleteMutation.isPending}
                activeOpacity={0.7}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <>
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                    <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Delete Store</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SectionDivider({ label, colors }: { label: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={divStyles.row}>
      <Text style={[divStyles.text, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[divStyles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const divStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 2 },
  text: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  line: { flex: 1, height: 1 },
});

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
  modalContent: { paddingHorizontal: 20 },
  twoCol: { flexDirection: "row", gap: 12 },
  colItem: { flex: 1 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 14,
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
    marginTop: 8,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
  },
  switchLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  switchSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 28,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
