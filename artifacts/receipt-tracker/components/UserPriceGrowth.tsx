import React from "react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  useGetCatalogPriceGrowth,
  getGetCatalogPriceGrowthQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import type { GetCatalogPriceGrowthWindowDays, AdminPriceGrowthItem } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { formatPrice } from "@workspace/geo";
import { EmptyState } from "@/components/EmptyState";
import { PriceGrowthChart } from "@/components/PriceGrowthChart";

const WINDOWS: { days: GetCatalogPriceGrowthWindowDays; label: string }[] = [
  { days: 90, label: "90 days" },
  { days: 182, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 0, label: "All time" },
];

// The same idea as admin's Growth tab — how a price has moved, one line per
// store — but for every shopper: region-scoped to the viewer's own area,
// their own purchases excluded (this is about OTHER shoppers), and every date
// coarsened to a month. See computePriceGrowth's `monthly`/`countryCode`
// opts — the admin view stays exact-date/unsuppressed; this is deliberately
// the privacy-safe sibling, not the same data with a different label.
export function UserPriceGrowth() {
  const colors = useColors();
  const router = useRouter();
  const { data: me } = useGetCurrentUser();
  const [windowDays, setWindowDays] = React.useState<GetCatalogPriceGrowthWindowDays>(90);
  const [open, setOpen] = React.useState<Record<number, boolean>>({});

  const growthParams = { windowDays };
  const { data, isLoading, error } = useGetCatalogPriceGrowth(growthParams, {
    query: { queryKey: getGetCatalogPriceGrowthQueryKey(growthParams), enabled: !!me?.countryCode },
  });

  if (!me) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Same defensive fallback used elsewhere (Browse Catalog): the region gate
  // normally routes a region-less user to /region-setup before they get here,
  // but if they ever land here anyway, explain why the tab is empty instead of
  // silently showing nothing.
  if (!me.countryCode) {
    return (
      <View style={styles.center}>
        <View style={styles.regionPrompt}>
          <View style={[styles.regionIcon, { backgroundColor: colors.accent }]}>
            <Feather name="map-pin" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.regionTitle, { color: colors.foreground }]}>Pick your region</Text>
          <Text style={[styles.regionSubtitle, { color: colors.mutedForeground }]}>
            Price trends are shared between shoppers in the same area — choose
            where you shop to see how prices are moving near you.
          </Text>
          <TouchableOpacity
            style={[styles.regionBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/region-setup")}
            activeOpacity={0.85}
          >
            <Text style={[styles.regionBtnText, { color: colors.primaryForeground }]}>Choose region</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        How prices have moved for other shoppers near you — never whose
        purchase it was, and dates are rounded to the month. Tap a card for
        the per-store trend.
      </Text>

      <View style={styles.chipRow}>
        {WINDOWS.map((w) => {
          const active = windowDays === w.days;
          return (
            <TouchableOpacity
              key={w.days}
              onPress={() => setWindowDays(w.days)}
              style={[
                styles.chip,
                { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : "transparent" },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {w.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <EmptyState icon="alert-triangle" title="Unable to load price trends" subtitle="Try again shortly." />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon="trending-up"
          title="Not enough shared history yet"
          subtitle="Once shoppers near you have scanned enough receipts for the same items, trends show up here."
        />
      ) : (
        data.items.map((item) => (
          <UserGrowthCard
            key={item.catalogItemId}
            item={item}
            colors={colors}
            domainStart={windowDays === 0 ? undefined : data.windowStart}
            domainEnd={windowDays === 0 ? undefined : data.windowEnd}
            expanded={!!open[item.catalogItemId]}
            onToggle={() => setOpen((o) => ({ ...o, [item.catalogItemId]: !o[item.catalogItemId] }))}
          />
        ))
      )}
    </View>
  );
}

function UserGrowthCard({
  item,
  colors,
  domainStart,
  domainEnd,
  expanded,
  onToggle,
}: {
  item: AdminPriceGrowthItem;
  colors: ReturnType<typeof useColors>;
  domainStart?: string;
  domainEnd?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const country = item.stores[0]?.countryCode ?? null;
  const rising = item.growthPct > 0;
  const flat = Math.abs(item.growthPct) < 0.05;
  const deltaColor = flat ? colors.mutedForeground : rising ? colors.priceBad : colors.priceGood;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.7}
      onPress={onToggle}
    >
      <View style={styles.cardTop}>
        <Text style={styles.icon}>{item.icon ?? "🛒"}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {formatPrice(item.firstPrice, country)} → {formatPrice(item.lastPrice, country)} ·{" "}
            {item.stores.length} store{item.stores.length === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={styles.deltaCol}>
          <Feather name={flat ? "minus" : rising ? "arrow-up-right" : "arrow-down-right"} size={13} color={deltaColor} />
          <Text style={[styles.delta, { color: deltaColor }]}>
            {rising && !flat ? "+" : ""}
            {item.growthPct.toFixed(1)}%
          </Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
      </View>

      {expanded ? (
        <View style={[styles.stores, { borderTopColor: colors.border }]}>
          <PriceGrowthChart series={item.stores} countryCode={country} domainStart={domainStart} domainEnd={domainEnd} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { fontSize: 24 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  deltaCol: { flexDirection: "row", alignItems: "center", gap: 3 },
  delta: { fontSize: 15, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
  stores: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  regionPrompt: { alignItems: "center", paddingHorizontal: 32, gap: 10 },
  regionIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  regionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  regionSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  regionBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  regionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
