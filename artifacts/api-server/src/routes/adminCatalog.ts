import { Router } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  itemsTable,
  storesTable,
  catalogItemsTable,
  catalogItemAliasesTable,
  catalogStoresTable,
  catalogStoreAliasesTable,
} from "@workspace/db";
import {
  AdminMergeCatalogItemsBody,
  AdminMergeCatalogStoresBody,
  AdminUpdateCatalogItemParams,
  AdminUpdateCatalogItemBody,
  AdminUpdateCatalogStoreParams,
  AdminUpdateCatalogStoreBody,
  AdminSplitCatalogItemParams,
  AdminSplitCatalogItemBody,
  AdminSplitCatalogStoreParams,
  AdminSplitCatalogStoreBody,
  AdminSuggestCatalogItemCategoriesBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAdmin } from "../middlewares/auth";
import {
  ensureCatalog,
  looseKey,
  computeGlobalPrices,
} from "../lib/catalog";
import {
  FIXED_CATEGORIES,
  isValidCategory,
  categoryForItemName,
} from "../lib/categories";

const router = Router();
router.use(requireAdmin);

type Member = { normalizedName: string; displayName: string; count: number };
type Entry = {
  id: number;
  canonicalName: string;
  icon: string | null;
  category: string | null;
  logo: string | null;
  websiteUrl: string | null;
  members: Member[];
  totalCount: number;
};

// Normalize an admin-entered store website to a canonical http(s) URL, or null
// to clear it. Returns `false` when the input is present but not a valid URL.
function normalizeWebsiteUrl(raw: string | null): string | null | false {
  if (raw === null) return null;
  let value = raw.trim();
  if (value === "") return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!parsed.hostname.includes(".")) return false;
  const normalized = parsed.toString();
  if (normalized.length > 2048) return false;
  return normalized;
}
type Suggestion = { ids: number[]; names: string[]; reason: string };

// Order-independent key: lowercase, split on non-alphanumerics, sort tokens.
// Groups "corn & wheat tortillas" with "tortillas corn wheat".
function tokenSortKey(name: string): string {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// Clusters catalog entries whose canonical names look like the same thing using
// a union-find over three signals: identical loose key (alphanumerics only),
// identical token-sort key (word reordering), and high edit-distance similarity
// (typos / OCR garble). Only suggests groups of 2+; the admin confirms each.
function buildSuggestions(entries: Entry[]): Suggestion[] {
  const n = entries.length;
  const parent = entries.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const looseKeys = entries.map((e) => looseKey(e.canonicalName));
  const byLoose = new Map<string, number>();
  const byTokens = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const lk = looseKeys[i];
    if (lk) {
      const j = byLoose.get(lk);
      if (j !== undefined) union(i, j);
      else byLoose.set(lk, i);
    }
    const tk = tokenSortKey(entries[i].canonicalName);
    if (tk) {
      const j = byTokens.get(tk);
      if (j !== undefined) union(i, j);
      else byTokens.set(tk, i);
    }
  }

  // Fuzzy pass (O(n^2)). Bounded so it never runs on pathologically large
  // catalogs; a household catalog is well under this.
  if (n <= 800) {
    for (let i = 0; i < n; i++) {
      const a = looseKeys[i];
      if (!a || a.length < 4) continue;
      for (let j = i + 1; j < n; j++) {
        const b = looseKeys[j];
        if (!b || b.length < 4) continue;
        if (find(i) === find(j)) continue;
        const min = Math.min(a.length, b.length);
        const max = Math.max(a.length, b.length);
        if (min / max < 0.6) continue; // very different lengths -> skip
        if (similarity(a, b) >= 0.85) union(i, j);
      }
    }
  }

  const groups = new Map<number, Entry[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(entries[i]);
    else groups.set(r, [entries[i]]);
  }

  const suggestions: Suggestion[] = [];
  for (const g of groups.values()) {
    if (g.length > 1) {
      suggestions.push({
        ids: g.map((e) => e.id),
        names: g.map((e) => e.canonicalName),
        reason: "Names look like variants of the same thing",
      });
    }
  }
  return suggestions;
}

// ---- Global prices --------------------------------------------------------

router.get("/global", async (_req, res): Promise<void> => {
  await ensureCatalog();
  res.json(await computeGlobalPrices());
});

// ---- Catalog listings (items & stores) ------------------------------------

router.get("/items", async (_req, res): Promise<void> => {
  await ensureCatalog();

  const catItems = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon, category: catalogItemsTable.category })
    .from(catalogItemsTable);

  const aliases = await db
    .select({
      normalizedName: catalogItemAliasesTable.normalizedName,
      displayName: catalogItemAliasesTable.displayName,
      catalogItemId: catalogItemAliasesTable.catalogItemId,
    })
    .from(catalogItemAliasesTable);

  // Count of user items per normalized name.
  const counts = await db
    .select({ norm: sql<string>`lower(btrim(${itemsTable.name}))`, count: sql<number>`count(*)::int` })
    .from(itemsTable)
    .groupBy(sql`lower(btrim(${itemsTable.name}))`);
  const countMap = new Map(counts.map((c) => [c.norm, c.count]));

  const membersByEntry = new Map<number, Member[]>();
  for (const a of aliases) {
    const m: Member = {
      normalizedName: a.normalizedName,
      displayName: a.displayName,
      count: countMap.get(a.normalizedName) ?? 0,
    };
    const list = membersByEntry.get(a.catalogItemId);
    if (list) list.push(m);
    else membersByEntry.set(a.catalogItemId, [m]);
  }

  const entries: Entry[] = catItems
    .map((c) => {
      const members = (membersByEntry.get(c.id) ?? []).sort((x, y) =>
        x.displayName.localeCompare(y.displayName),
      );
      return {
        id: c.id,
        canonicalName: c.name,
        icon: c.icon ?? null,
        category: c.category ?? null,
        logo: null,
        websiteUrl: null,
        members,
        totalCount: members.reduce((sum, m) => sum + m.count, 0),
      };
    })
    .sort((x, y) => x.canonicalName.localeCompare(y.canonicalName));

  res.json({ entries, suggestions: buildSuggestions(entries) });
});

router.get("/stores", async (_req, res): Promise<void> => {
  await ensureCatalog();

  const catStores = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName, logo: catalogStoresTable.logo, websiteUrl: catalogStoresTable.websiteUrl })
    .from(catalogStoresTable);

  const aliases = await db
    .select({
      normalizedName: catalogStoreAliasesTable.normalizedName,
      displayName: catalogStoreAliasesTable.displayName,
      catalogStoreId: catalogStoreAliasesTable.catalogStoreId,
    })
    .from(catalogStoreAliasesTable);

  const counts = await db
    .select({ norm: sql<string>`lower(btrim(${storesTable.name}))`, count: sql<number>`count(*)::int` })
    .from(storesTable)
    .groupBy(sql`lower(btrim(${storesTable.name}))`);
  const countMap = new Map(counts.map((c) => [c.norm, c.count]));

  const membersByEntry = new Map<number, Member[]>();
  for (const a of aliases) {
    const m: Member = {
      normalizedName: a.normalizedName,
      displayName: a.displayName,
      count: countMap.get(a.normalizedName) ?? 0,
    };
    const list = membersByEntry.get(a.catalogStoreId);
    if (list) list.push(m);
    else membersByEntry.set(a.catalogStoreId, [m]);
  }

  const entries: Entry[] = catStores
    .map((c) => {
      const members = (membersByEntry.get(c.id) ?? []).sort((x, y) =>
        x.displayName.localeCompare(y.displayName),
      );
      return {
        id: c.id,
        canonicalName: c.name,
        icon: null,
        category: null,
        logo: c.logo ?? null,
        websiteUrl: c.websiteUrl ?? null,
        members,
        totalCount: members.reduce((sum, m) => sum + m.count, 0),
      };
    })
    .sort((x, y) => x.canonicalName.localeCompare(y.canonicalName));

  res.json({ entries, suggestions: buildSuggestions(entries) });
});

// ---- Helpers to (re)build a single entry response -------------------------

async function buildItemEntry(id: number): Promise<Entry | null> {
  const [c] = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName, icon: catalogItemsTable.icon, category: catalogItemsTable.category })
    .from(catalogItemsTable)
    .where(eq(catalogItemsTable.id, id));
  if (!c) return null;
  const aliases = await db
    .select({ normalizedName: catalogItemAliasesTable.normalizedName, displayName: catalogItemAliasesTable.displayName })
    .from(catalogItemAliasesTable)
    .where(eq(catalogItemAliasesTable.catalogItemId, id));
  const members: Member[] = aliases.map((a) => ({
    normalizedName: a.normalizedName,
    displayName: a.displayName,
    count: 0,
  }));
  return { id: c.id, canonicalName: c.name, icon: c.icon ?? null, category: c.category ?? null, logo: null, websiteUrl: null, members, totalCount: 0 };
}

async function buildStoreEntry(id: number): Promise<Entry | null> {
  const [c] = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName, logo: catalogStoresTable.logo, websiteUrl: catalogStoresTable.websiteUrl })
    .from(catalogStoresTable)
    .where(eq(catalogStoresTable.id, id));
  if (!c) return null;
  const aliases = await db
    .select({ normalizedName: catalogStoreAliasesTable.normalizedName, displayName: catalogStoreAliasesTable.displayName })
    .from(catalogStoreAliasesTable)
    .where(eq(catalogStoreAliasesTable.catalogStoreId, id));
  const members: Member[] = aliases.map((a) => ({
    normalizedName: a.normalizedName,
    displayName: a.displayName,
    count: 0,
  }));
  return { id: c.id, canonicalName: c.name, icon: null, category: null, logo: c.logo ?? null, websiteUrl: c.websiteUrl ?? null, members, totalCount: 0 };
}

// ---- Merge ----------------------------------------------------------------

router.post("/items/merge", async (req, res): Promise<void> => {
  const parsed = AdminMergeCatalogItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { sourceId, targetId } = parsed.data;
  if (sourceId === targetId) {
    res.status(400).json({ error: "Cannot merge an entry into itself" });
    return;
  }
  const [target] = await db.select().from(catalogItemsTable).where(eq(catalogItemsTable.id, targetId));
  const [source] = await db.select().from(catalogItemsTable).where(eq(catalogItemsTable.id, sourceId));
  if (!target || !source) {
    res.status(404).json({ error: "Catalog item not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(catalogItemAliasesTable)
      .set({ catalogItemId: targetId })
      .where(eq(catalogItemAliasesTable.catalogItemId, sourceId));
    await tx.delete(catalogItemsTable).where(eq(catalogItemsTable.id, sourceId));
  });
  res.json(await buildItemEntry(targetId));
});

router.post("/stores/merge", async (req, res): Promise<void> => {
  const parsed = AdminMergeCatalogStoresBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { sourceId, targetId } = parsed.data;
  if (sourceId === targetId) {
    res.status(400).json({ error: "Cannot merge an entry into itself" });
    return;
  }
  const [target] = await db.select().from(catalogStoresTable).where(eq(catalogStoresTable.id, targetId));
  const [source] = await db.select().from(catalogStoresTable).where(eq(catalogStoresTable.id, sourceId));
  if (!target || !source) {
    res.status(404).json({ error: "Catalog store not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(catalogStoreAliasesTable)
      .set({ catalogStoreId: targetId })
      .where(eq(catalogStoreAliasesTable.catalogStoreId, sourceId));
    await tx.delete(catalogStoresTable).where(eq(catalogStoresTable.id, sourceId));
  });
  res.json(await buildStoreEntry(targetId));
});

// ---- Rename ---------------------------------------------------------------

router.patch("/items/:id", async (req, res): Promise<void> => {
  const params = AdminUpdateCatalogItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = AdminUpdateCatalogItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: { canonicalName?: string; icon?: string | null; category?: string | null } = {};
  if (parsed.data.canonicalName !== undefined) update.canonicalName = parsed.data.canonicalName;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.category !== undefined) {
    if (parsed.data.category !== null && !isValidCategory(parsed.data.category)) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
    update.category = parsed.data.category;
  }
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const [updated] = await db
    .update(catalogItemsTable)
    .set(update)
    .where(eq(catalogItemsTable.id, id))
    .returning({ id: catalogItemsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Catalog item not found" });
    return;
  }
  res.json(await buildItemEntry(id));
});

router.patch("/stores/:id", async (req, res): Promise<void> => {
  const params = AdminUpdateCatalogStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = AdminUpdateCatalogStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: { canonicalName: string; logo?: string | null; websiteUrl?: string | null } = {
    canonicalName: parsed.data.canonicalName,
  };
  if (parsed.data.websiteUrl !== undefined) {
    const normalized = normalizeWebsiteUrl(parsed.data.websiteUrl);
    if (normalized === false) {
      res.status(400).json({ error: "Website must be a valid http(s) URL" });
      return;
    }
    update.websiteUrl = normalized;
  }
  if (parsed.data.logo !== undefined) {
    const logo = parsed.data.logo;
    if (logo !== null) {
      // Logos are small client-resized images stored inline as base64 data
      // URIs. Guard against oversized / non-image payloads even though this is
      // an admin-only route (keeps DB + list responses bounded).
      if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(logo)) {
        res.status(400).json({ error: "Logo must be a base64 image data URI" });
        return;
      }
      const MAX_LOGO_BYTES = 1_000_000; // ~1MB of base64 text
      if (logo.length > MAX_LOGO_BYTES) {
        res.status(400).json({ error: "Logo image is too large" });
        return;
      }
    }
    update.logo = logo;
  }
  const [updated] = await db
    .update(catalogStoresTable)
    .set(update)
    .where(eq(catalogStoresTable.id, id))
    .returning({ id: catalogStoresTable.id });
  if (!updated) {
    res.status(404).json({ error: "Catalog store not found" });
    return;
  }
  res.json(await buildStoreEntry(id));
});

// ---- Split (move one member name into its own canonical entry) -------------

router.post("/items/:id/split", async (req, res): Promise<void> => {
  const params = AdminSplitCatalogItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = AdminSplitCatalogItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [alias] = await db
    .select()
    .from(catalogItemAliasesTable)
    .where(eq(catalogItemAliasesTable.normalizedName, parsed.data.normalizedName));
  if (!alias || alias.catalogItemId !== id) {
    res.status(404).json({ error: "Member not found in this catalog item" });
    return;
  }
  const siblings = await db
    .select({ id: catalogItemAliasesTable.id })
    .from(catalogItemAliasesTable)
    .where(eq(catalogItemAliasesTable.catalogItemId, id));
  if (siblings.length <= 1) {
    res.status(400).json({ error: "Cannot split the only name out of an entry" });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(catalogItemsTable)
      .values({ canonicalName: alias.displayName })
      .returning({ id: catalogItemsTable.id });
    await tx
      .update(catalogItemAliasesTable)
      .set({ catalogItemId: row.id })
      .where(eq(catalogItemAliasesTable.id, alias.id));
    return row;
  });
  res.json(await buildItemEntry(created.id));
});

router.post("/stores/:id/split", async (req, res): Promise<void> => {
  const params = AdminSplitCatalogStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const parsed = AdminSplitCatalogStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [alias] = await db
    .select()
    .from(catalogStoreAliasesTable)
    .where(eq(catalogStoreAliasesTable.normalizedName, parsed.data.normalizedName));
  if (!alias || alias.catalogStoreId !== id) {
    res.status(404).json({ error: "Member not found in this catalog store" });
    return;
  }
  const siblings = await db
    .select({ id: catalogStoreAliasesTable.id })
    .from(catalogStoreAliasesTable)
    .where(eq(catalogStoreAliasesTable.catalogStoreId, id));
  if (siblings.length <= 1) {
    res.status(400).json({ error: "Cannot split the only name out of an entry" });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(catalogStoresTable)
      .values({ canonicalName: alias.displayName })
      .returning({ id: catalogStoresTable.id });
    await tx
      .update(catalogStoreAliasesTable)
      .set({ catalogStoreId: row.id })
      .where(eq(catalogStoreAliasesTable.id, alias.id));
    return row;
  });
  res.json(await buildStoreEntry(created.id));
});

// ---- AI assists -----------------------------------------------------------

// Cap for the single-shot duplicate scans (one prompt sees all names so they can
// be grouped together). Household catalogs are far below this.
const AI_DUPLICATE_LIMIT = 400;
// Category classification is batched (below) so it always covers every id.
const CATEGORY_BATCH = 150;

function extractJson(text: string): unknown {
  // Models occasionally wrap JSON in prose or code fences; grab the first {...}.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

// AI-suggest a category (from the FIXED list) for the requested catalog items.
// Always returns one suggestion per existing requested id; falls back to the
// keyword heuristic for any item the model omits or mislabels.
router.post("/items/suggest-categories", async (req, res): Promise<void> => {
  const parsed = AdminSuggestCatalogItemCategoriesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ids = [...new Set(parsed.data.ids)];
  if (ids.length === 0) {
    res.json({ suggestions: [] });
    return;
  }
  await ensureCatalog();
  const rows = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName })
    .from(catalogItemsTable)
    .where(inArray(catalogItemsTable.id, ids));
  if (rows.length === 0) {
    res.json({ suggestions: [] });
    return;
  }

  // Classify in batches so every requested id gets a suggestion regardless of
  // catalog size; the keyword heuristic backfills anything the model omits.
  const aiByName = new Map<number, string>();
  for (let i = 0; i < rows.length; i += CATEGORY_BATCH) {
    const batch = rows.slice(i, i + CATEGORY_BATCH);
    await classifyCategoryBatch(req.log, batch, aiByName);
  }

  const suggestions = rows.map((r) => ({
    id: r.id,
    category: aiByName.get(r.id) ?? categoryForItemName(r.name),
  }));
  res.json({ suggestions });
});

async function classifyCategoryBatch(
  log: { warn: (obj: unknown, msg?: string) => void },
  batch: { id: number; name: string }[],
  out: Map<number, string>,
): Promise<void> {
  try {
    const list = batch.map((r) => `${r.id}\t${r.name}`).join("\n");
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content:
            "You classify grocery and household products into exactly one category " +
            "from this fixed list (use the value VERBATIM): " +
            FIXED_CATEGORIES.join(", ") +
            '. Respond ONLY with JSON of the form {"results":[{"id":<number>,"category":"<one of the categories>"}]} ' +
            "with one entry for every product id provided. Do not invent categories.",
        },
        {
          role: "user",
          content: `Classify these products (id<TAB>name per line):\n${list}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "";
    const data = extractJson(content) as
      | { results?: Array<{ id?: unknown; category?: unknown }> }
      | null;
    if (data?.results) {
      for (const r of data.results) {
        const id = typeof r.id === "number" ? r.id : Number(r.id);
        const cat = typeof r.category === "string" ? r.category : "";
        if (Number.isFinite(id) && isValidCategory(cat)) out.set(id, cat);
      }
    }
  } catch (err) {
    log.warn({ err }, "AI category suggestion failed; using heuristic fallback");
  }
}

// Shared core for AI duplicate detection over a set of {id, name} entries.
async function aiFindDuplicates(
  log: { warn: (obj: unknown, msg?: string) => void },
  rows: { id: number; name: string }[],
  kind: "products" | "stores",
): Promise<Suggestion[]> {
  if (rows.length < 2) return [];
  const batch = rows.slice(0, AI_DUPLICATE_LIMIT);
  const byId = new Map(batch.map((r) => [r.id, r.name]));
  let groups: number[][] = [];
  try {
    const list = batch.map((r) => `${r.id}\t${r.name}`).join("\n");
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content:
            `You find duplicate ${kind} in a catalog. Group entries that refer to the SAME ` +
            `real-world ${kind === "products" ? "product" : "store"}, including misspellings, ` +
            "OCR garble, abbreviations, word reordering, and brand/description variants. " +
            "Do NOT group merely-similar but genuinely different entries (e.g. whole milk vs skim milk, " +
            "or two different store chains). Every group must have 2 or more ids. " +
            'Respond ONLY with JSON of the form {"groups":[[id,id,...],...]}. Use an empty array if there are no duplicates.',
        },
        {
          role: "user",
          content: `Entries (id<TAB>name per line):\n${list}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "";
    const data = extractJson(content) as { groups?: unknown } | null;
    if (Array.isArray(data?.groups)) {
      groups = (data.groups as unknown[])
        .filter((g): g is unknown[] => Array.isArray(g))
        .map((g) =>
          [
            ...new Set(
              g
                .map((x) => (typeof x === "number" ? x : Number(x)))
                .filter((x) => Number.isFinite(x) && byId.has(x)),
            ),
          ],
        );
    }
  } catch (err) {
    log.warn({ err }, "AI duplicate detection failed");
    return [];
  }

  const seen = new Set<number>();
  const suggestions: Suggestion[] = [];
  for (const g of groups) {
    const ids = g.filter((id) => !seen.has(id));
    if (ids.length < 2) continue;
    for (const id of ids) seen.add(id);
    suggestions.push({
      ids,
      names: ids.map((id) => byId.get(id)!),
      reason: "AI thinks these are the same — review before merging",
    });
  }
  return suggestions;
}

router.post("/items/suggest-duplicates", async (req, res): Promise<void> => {
  await ensureCatalog();
  const rows = await db
    .select({ id: catalogItemsTable.id, name: catalogItemsTable.canonicalName })
    .from(catalogItemsTable);
  res.json({ suggestions: await aiFindDuplicates(req.log, rows, "products") });
});

router.post("/stores/suggest-duplicates", async (req, res): Promise<void> => {
  await ensureCatalog();
  const rows = await db
    .select({ id: catalogStoresTable.id, name: catalogStoresTable.canonicalName })
    .from(catalogStoresTable);
  res.json({ suggestions: await aiFindDuplicates(req.log, rows, "stores") });
});

export default router;
