import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAdminListCatalogItems,
  useAdminListCatalogStores,
  useAdminMergeCatalogItems,
  useAdminMergeCatalogStores,
  useAdminUpdateCatalogItem,
  useAdminUpdateCatalogStore,
  useAdminSplitCatalogItem,
  useAdminSplitCatalogStore,
} from "@workspace/api-client-react";
import type { CatalogEntry, CatalogSuggestion } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { EmptyState } from "@/components/EmptyState";

type Tab = "items" | "stores";

// Mirrors FIXED_CATEGORIES in the API server's categories lib.
const CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
  "Frozen",
  "Beverages",
  "Snacks",
  "Household",
  "Personal Care",
  "Baby",
  "Pet",
  "Other",
] as const;

export default function AdminCatalogScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<Tab>("items");

  const itemsQuery = useAdminListCatalogItems();
  const storesQuery = useAdminListCatalogStores();

  const refetch = React.useCallback(() => {
    void itemsQuery.refetch();
    void storesQuery.refetch();
  }, [itemsQuery, storesQuery]);

  const mergeItems = useAdminMergeCatalogItems();
  const mergeStores = useAdminMergeCatalogStores();
  const updateItem = useAdminUpdateCatalogItem();
  const updateStore = useAdminUpdateCatalogStore();
  const splitItem = useAdminSplitCatalogItem();
  const splitStore = useAdminSplitCatalogStore();

  const [renameTarget, setRenameTarget] = React.useState<CatalogEntry | null>(null);
  const [renameText, setRenameText] = React.useState("");
  const [mergeSource, setMergeSource] = React.useState<CatalogEntry | null>(null);
  const [categoryTarget, setCategoryTarget] = React.useState<CatalogEntry | null>(null);
  const [busy, setBusy] = React.useState(false);

  const active = tab === "items" ? itemsQuery : storesQuery;
  const entries = active.data?.entries ?? [];
  const suggestions = active.data?.suggestions ?? [];

  const doMerge = async (sourceId: number, targetId: number) => {
    if (tab === "items") await mergeItems.mutateAsync({ data: { sourceId, targetId } });
    else await mergeStores.mutateAsync({ data: { sourceId, targetId } });
  };

  const onConfirmRename = async () => {
    if (!renameTarget) return;
    const name = renameText.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (tab === "items") await updateItem.mutateAsync({ id: renameTarget.id, data: { canonicalName: name } });
      else await updateStore.mutateAsync({ id: renameTarget.id, data: { canonicalName: name } });
      refetch();
      setRenameTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const onPickCategory = async (category: string) => {
    if (!categoryTarget) return;
    setBusy(true);
    try {
      await updateItem.mutateAsync({ id: categoryTarget.id, data: { category } });
      refetch();
      setCategoryTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const onPickMergeTarget = async (target: CatalogEntry) => {
    if (!mergeSource) return;
    setBusy(true);
    try {
      await doMerge(mergeSource.id, target.id);
      refetch();
      setMergeSource(null);
    } finally {
      setBusy(false);
    }
  };

  const onAcceptSuggestion = async (s: CatalogSuggestion) => {
    setBusy(true);
    try {
      const [target, ...rest] = s.ids;
      for (const sourceId of rest) {
        await doMerge(sourceId, target);
      }
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const onSplit = async (entry: CatalogEntry, normalizedName: string) => {
    setBusy(true);
    try {
      if (tab === "items") await splitItem.mutateAsync({ id: entry.id, data: { normalizedName } });
      else await splitStore.mutateAsync({ id: entry.id, data: { normalizedName } });
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const onUploadLogo = async (entry: CatalogEntry) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1.0,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setBusy(true);
    try {
      const resized = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256 } }],
        { compress: 0.85, format: SaveFormat.PNG, base64: true },
      );
      if (!resized.base64) return;
      const logo = `data:image/png;base64,${resized.base64}`;
      await updateStore.mutateAsync({ id: entry.id, data: { canonicalName: entry.canonicalName, logo } });
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const onRemoveLogo = async (entry: CatalogEntry) => {
    setBusy(true);
    try {
      await updateStore.mutateAsync({ id: entry.id, data: { canonicalName: entry.canonicalName, logo: null } });
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const paddingTop = Platform.OS === "web" ? 32 : insets.top + 8;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Manage Catalog</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.secondary }]}>
        {(["items", "stores"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { backgroundColor: colors.card }]}
            onPress={() => setTab(t)}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === t ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {t === "items" ? "Items" : "Stores"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {active.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : active.error ? (
        <View style={styles.center}>
          <EmptyState icon="alert-triangle" title="Unable to load catalog" subtitle="You may not have admin access." />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <SuggestionsHeader
              suggestions={suggestions}
              colors={colors}
              busy={busy}
              onAccept={onAcceptSuggestion}
            />
          }
          ListEmptyComponent={
            <EmptyState icon="layers" title="Nothing here yet" subtitle="Catalog entries appear as users add data." />
          }
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              colors={colors}
              showCategory={tab === "items"}
              showLogo={tab === "stores"}
              busy={busy}
              onRename={() => {
                setRenameTarget(item);
                setRenameText(item.canonicalName);
              }}
              onMerge={() => setMergeSource(item)}
              onSplit={(norm) => onSplit(item, norm)}
              onEditCategory={() => setCategoryTarget(item)}
              onUploadLogo={() => onUploadLogo(item)}
              onRemoveLogo={() => onRemoveLogo(item)}
            />
          )}
        />
      )}

      {/* Rename modal */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rename entry</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              style={[
                styles.input,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              placeholder="Canonical name"
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setRenameTarget(null)} disabled={busy}>
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={onConfirmRename}
                disabled={busy}
              >
                <Text style={[styles.modalBtnText, { color: colors.primaryForeground }]}>
                  {busy ? "Saving…" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Merge target picker */}
      <Modal visible={!!mergeSource} transparent animationType="fade" onRequestClose={() => setMergeSource(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { backgroundColor: colors.card, maxHeight: "70%" }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Merge “{mergeSource?.canonicalName}” into…
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              All its names move to the entry you pick. The original entry is removed.
            </Text>
            <FlatList
              data={entries.filter((e) => e.id !== mergeSource?.id)}
              keyExtractor={(e) => String(e.id)}
              style={{ marginTop: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.targetRow, { borderColor: colors.border }]}
                  onPress={() => onPickMergeTarget(item)}
                  disabled={busy}
                >
                  <Text style={[styles.targetName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.icon ? `${item.icon} ` : ""}
                    {item.canonicalName}
                  </Text>
                  <Feather name="arrow-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={[styles.modalBtn, { alignSelf: "flex-end", marginTop: 8 }]} onPress={() => setMergeSource(null)}>
              <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Category picker */}
      <Modal visible={!!categoryTarget} transparent animationType="fade" onRequestClose={() => setCategoryTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { backgroundColor: colors.card, maxHeight: "70%" }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Category for “{categoryTarget?.canonicalName}”
            </Text>
            <FlatList
              data={CATEGORIES}
              keyExtractor={(c) => c}
              style={{ marginTop: 8 }}
              renderItem={({ item: cat }) => {
                const selected = categoryTarget?.category === cat;
                return (
                  <TouchableOpacity
                    style={[styles.targetRow, { borderColor: selected ? colors.primary : colors.border }]}
                    onPress={() => onPickCategory(cat)}
                    disabled={busy}
                  >
                    <Text style={[styles.targetName, { color: colors.foreground }]} numberOfLines={1}>
                      {cat}
                    </Text>
                    {selected ? (
                      <Feather name="check" size={16} color={colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity style={[styles.modalBtn, { alignSelf: "flex-end", marginTop: 8 }]} onPress={() => setCategoryTarget(null)}>
              <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SuggestionsHeader({
  suggestions,
  colors,
  busy,
  onAccept,
}: {
  suggestions: CatalogSuggestion[];
  colors: ReturnType<typeof useColors>;
  busy: boolean;
  onAccept: (s: CatalogSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <View style={{ gap: 10, marginBottom: 6 }}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Suggested merges</Text>
      {suggestions.map((s, i) => (
        <View key={i} style={[styles.suggestion, { backgroundColor: colors.accent }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.suggestionNames, { color: colors.accentForeground }]}>
              {s.names.join("  ·  ")}
            </Text>
            <Text style={[styles.suggestionReason, { color: colors.accentForeground }]}>{s.reason}</Text>
          </View>
          <TouchableOpacity
            style={[styles.mergeBtn, { backgroundColor: colors.primary }]}
            onPress={() => onAccept(s)}
            disabled={busy}
          >
            <Text style={[styles.mergeBtnText, { color: colors.primaryForeground }]}>Merge</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function EntryCard({
  entry,
  colors,
  showCategory,
  showLogo,
  busy,
  onRename,
  onMerge,
  onSplit,
  onEditCategory,
  onUploadLogo,
  onRemoveLogo,
}: {
  entry: CatalogEntry;
  colors: ReturnType<typeof useColors>;
  showCategory: boolean;
  showLogo: boolean;
  busy: boolean;
  onRename: () => void;
  onMerge: () => void;
  onSplit: (normalizedName: string) => void;
  onEditCategory: () => void;
  onUploadLogo: () => void;
  onRemoveLogo: () => void;
}) {
  const canSplit = entry.members.length > 1;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        {showLogo ? (
          entry.logo ? (
            <Image source={{ uri: entry.logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={[styles.logo, styles.logoPlaceholder, { borderColor: colors.border }]}>
              <Feather name="image" size={18} color={colors.mutedForeground} />
            </View>
          )
        ) : entry.icon ? (
          <Text style={styles.icon}>{entry.icon}</Text>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {entry.canonicalName}
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {entry.members.length} name{entry.members.length === 1 ? "" : "s"} · {entry.totalCount} record
            {entry.totalCount === 1 ? "" : "s"}
          </Text>
        </View>
        <TouchableOpacity onPress={onRename} hitSlop={8} style={styles.iconBtn}>
          <Feather name="edit-2" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onMerge} hitSlop={8} style={styles.iconBtn}>
          <Feather name="git-merge" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {showLogo ? (
        <View style={styles.logoActions}>
          <TouchableOpacity
            style={[styles.logoBtn, { borderColor: colors.border }]}
            onPress={onUploadLogo}
            disabled={busy}
            activeOpacity={0.7}
          >
            <Feather name="upload" size={13} color={colors.foreground} />
            <Text style={[styles.logoBtnText, { color: colors.foreground }]}>
              {entry.logo ? "Replace logo" : "Upload logo"}
            </Text>
          </TouchableOpacity>
          {entry.logo ? (
            <TouchableOpacity
              style={[styles.logoBtn, { borderColor: colors.border }]}
              onPress={onRemoveLogo}
              disabled={busy}
              activeOpacity={0.7}
            >
              <Feather name="trash-2" size={13} color={colors.destructive} />
              <Text style={[styles.logoBtnText, { color: colors.destructive }]}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {showCategory ? (
        <TouchableOpacity
          style={[styles.categoryRow, { borderColor: colors.border }]}
          onPress={onEditCategory}
          activeOpacity={0.7}
        >
          <Feather name="tag" size={13} color={colors.mutedForeground} />
          <Text style={[styles.categoryText, { color: entry.category ? colors.foreground : colors.mutedForeground }]}>
            {entry.category ?? "Set category"}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.chips}>
        {entry.members.map((m) => (
          <View key={m.normalizedName} style={[styles.chip, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.chipText, { color: colors.secondaryForeground }]} numberOfLines={1}>
              {m.displayName}
              {m.count > 0 ? ` (${m.count})` : ""}
            </Text>
            {canSplit ? (
              <TouchableOpacity onPress={() => onSplit(m.normalizedName)} hitSlop={6} style={{ marginLeft: 4 }}>
                <Feather name="scissors" size={12} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabs: {
    flexDirection: "row",
    margin: 16,
    marginTop: 0,
    padding: 4,
    borderRadius: 12,
    gap: 4,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 12 },
  suggestionNames: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  suggestionReason: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, opacity: 0.85 },
  mergeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 },
  mergeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { fontSize: 22 },
  logo: { width: 40, height: 40, borderRadius: 8 },
  logoPlaceholder: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  logoActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  logoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  logoBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start" },
  categoryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, maxWidth: "100%" },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalBox: { width: "100%", maxWidth: 420, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 14, fontFamily: "Inter_400Regular" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9 },
  modalBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  targetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  targetName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
});
