import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { storesTable, usersTable } from "@workspace/db";
import {
  CreateStoreBody,
  UpdateStoreBody,
} from "@workspace/api-zod";
import { isValidCountry, isValidUsState, isStateScoped, normalizeRegionCode } from "@workspace/geo";
import { resolveStoreLogo } from "../lib/storeLogo";
import { geocodeAddress, haversineKm, type LatLng } from "../lib/geocode";

// Lazily geocode up to a few of the caller's stores that have an address but no
// coordinates yet (e.g. addresses backfilled before geocoding existed). Kept
// small + fire-and-forget so the Stores list stays fast and we respect rate
// limits; distances appear on a subsequent load.
async function backfillStoreCoords(
  stores: { id: number; address: string | null; latitude: string | null }[],
): Promise<void> {
  const pending = stores.filter((s) => s.address && s.latitude == null).slice(0, 5);
  for (const s of pending) {
    try {
      const coords = await geocodeAddress(s.address!);
      if (coords) {
        await db
          .update(storesTable)
          .set({ latitude: String(coords.lat), longitude: String(coords.lng) })
          .where(eq(storesTable.id, s.id));
      }
    } catch {
      // Non-fatal — try again on a future load.
    }
  }
}

const router = Router();

// Normalize a user-supplied website to a storable string (or null). Adds https://
// when no scheme is present so it's a tappable link, and caps the length.
function normalizeWebsite(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.slice(0, 500);
}

// Resolve the region columns to persist from a (partial) store body. Region
// fields are independent of the rest of the body: only the keys actually present
// are touched. countryCode must be a known country (or null to clear); a US
// store may carry a valid state, every other country forces state to null.
type RegionFields = { countryCode?: string | null; stateCode?: string | null };
function resolveStoreRegion(
  data: { countryCode?: string | null; stateCode?: string | null },
): { ok: true; fields: RegionFields } | { ok: false; error: string } {
  const fields: RegionFields = {};
  if (data.countryCode !== undefined) {
    if (data.countryCode === null) {
      // Clearing the country also clears the (now-meaningless) state.
      fields.countryCode = null;
      fields.stateCode = null;
      return { ok: true, fields };
    }
    if (!isValidCountry(data.countryCode)) {
      return { ok: false, error: "Invalid or unsupported countryCode" };
    }
    const countryCode = normalizeRegionCode(data.countryCode)!;
    fields.countryCode = countryCode;
    if (isStateScoped(countryCode)) {
      if (data.stateCode != null) {
        if (!isValidUsState(data.stateCode)) {
          return { ok: false, error: "Invalid US stateCode" };
        }
        fields.stateCode = normalizeRegionCode(data.stateCode);
      } else {
        fields.stateCode = null;
      }
    } else {
      // Non-US: never persist a state.
      fields.stateCode = null;
    }
    return { ok: true, fields };
  }
  // Country not being changed; a lone state change is only valid for a US store,
  // which we can't verify here without a read, so ignore a state-only payload.
  return { ok: true, fields };
}

router.get("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [stores, [user]] = await Promise.all([
    db.select().from(storesTable).where(eq(storesTable.userId, userId)).orderBy(storesTable.name),
    db
      .select({ latitude: usersTable.latitude, longitude: usersTable.longitude })
      .from(usersTable)
      .where(eq(usersTable.id, userId)),
  ]);

  // Where the user is (their geocoded home address), if set. Distances are only
  // computed when we have both the user's and the store's coordinates.
  const userLoc: LatLng | null =
    user?.latitude != null && user?.longitude != null
      ? { lat: Number(user.latitude), lng: Number(user.longitude) }
      : null;

  res.json(
    stores.map((s) => {
      const storeLoc: LatLng | null =
        s.latitude != null && s.longitude != null
          ? { lat: Number(s.latitude), lng: Number(s.longitude) }
          : null;
      const distanceKm =
        userLoc && storeLoc ? Math.round(haversineKm(userLoc, storeLoc) * 10) / 10 : null;
      return {
        ...s,
        deliveryFee: s.deliveryFee ? Number(s.deliveryFee) : null,
        minimumOrderAmount: s.minimumOrderAmount ? Number(s.minimumOrderAmount) : null,
        distanceKm,
        createdAt: s.createdAt.toISOString(),
      };
    }),
  );

  // Kick off lazy geocoding for any address-but-no-coords stores (fire-and-forget).
  void backfillStoreCoords(stores);
});

// Re-resolve and persist a logo for every one of the caller's stores. Powers
// the "Refresh logos" button so the user can pull logos on demand instead of
// waiting for the boot-time backfill.
router.post("/refresh-logos", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const stores = await db
    .select({ id: storesTable.id, name: storesTable.name })
    .from(storesTable)
    .where(eq(storesTable.userId, userId));
  let updated = 0;
  for (const s of stores) {
    const logoUrl = await resolveStoreLogo(s.name);
    if (!logoUrl) continue;
    await db
      .update(storesTable)
      .set({ logoUrl })
      .where(and(eq(storesTable.id, s.id), eq(storesTable.userId, userId)));
    updated += 1;
  }
  res.json({ updated, total: stores.length });
});

router.post("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const region = resolveStoreRegion(parsed.data);
  if (!region.ok) {
    res.status(400).json({ error: region.error });
    return;
  }
  const { countryCode: _c, stateCode: _s, ...rest } = parsed.data;
  // `website` isn't in the (generated, drifted) CreateStoreBody schema, so read
  // it straight off the raw body and normalize.
  const website = normalizeWebsite((req.body as { website?: unknown }).website);
  const logoUrl = await resolveStoreLogo(parsed.data.name);
  const [store] = await db.insert(storesTable).values({
    ...rest,
    ...region.fields,
    website,
    userId,
    logoUrl,
    deliveryFee: parsed.data.deliveryFee != null ? String(parsed.data.deliveryFee) : null,
    minimumOrderAmount: parsed.data.minimumOrderAmount != null ? String(parsed.data.minimumOrderAmount) : null,
  }).returning();
  res.status(201).json({
    ...store,
    deliveryFee: store.deliveryFee ? Number(store.deliveryFee) : null,
    minimumOrderAmount: store.minimumOrderAmount ? Number(store.minimumOrderAmount) : null,
    createdAt: store.createdAt.toISOString(),
  });
});

router.get("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const [store] = await db
    .select()
    .from(storesTable)
    .where(and(eq(storesTable.id, id), eq(storesTable.userId, userId)));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.json({
    ...store,
    deliveryFee: store.deliveryFee ? Number(store.deliveryFee) : null,
    minimumOrderAmount: store.minimumOrderAmount ? Number(store.minimumOrderAmount) : null,
    createdAt: store.createdAt.toISOString(),
  });
});

router.patch("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const parsed = UpdateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const region = resolveStoreRegion(parsed.data);
  if (!region.ok) {
    res.status(400).json({ error: region.error });
    return;
  }
  const { countryCode: _c, stateCode: _s, ...rest } = parsed.data;
  // Only update `website` when the key is present in the raw body (drifted schema).
  const hasWebsite = Object.prototype.hasOwnProperty.call(req.body ?? {}, "website");
  const website = hasWebsite ? normalizeWebsite((req.body as { website?: unknown }).website) : undefined;
  const logoUrl = parsed.data.name ? await resolveStoreLogo(parsed.data.name) : undefined;
  const [store] = await db
    .update(storesTable)
    .set({
      ...rest,
      ...region.fields,
      ...(website !== undefined ? { website } : {}),
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      deliveryFee: parsed.data.deliveryFee != null ? String(parsed.data.deliveryFee) : parsed.data.deliveryFee,
      minimumOrderAmount: parsed.data.minimumOrderAmount != null ? String(parsed.data.minimumOrderAmount) : parsed.data.minimumOrderAmount,
    })
    .where(and(eq(storesTable.id, id), eq(storesTable.userId, userId)))
    .returning();
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.json({
    ...store,
    deliveryFee: store.deliveryFee ? Number(store.deliveryFee) : null,
    minimumOrderAmount: store.minimumOrderAmount ? Number(store.minimumOrderAmount) : null,
    createdAt: store.createdAt.toISOString(),
  });
});

router.delete("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  await db
    .delete(storesTable)
    .where(and(eq(storesTable.id, id), eq(storesTable.userId, userId)));
  res.status(204).send();
});

export default router;
