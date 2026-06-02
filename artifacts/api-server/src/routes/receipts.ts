import { Router } from "express";
import { and, eq, sql, inArray } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink, readdir } from "fs/promises";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { receiptsTable, storesTable, lineItemsTable, itemsTable, usersTable } from "@workspace/db";
import { isValidCountry, isValidUsState, isStateScoped, normalizeRegionCode } from "@workspace/geo";
import {
  CreateReceiptBody,
  AddLineItemBody,
  UpdateLineItemBody,
  MergeReceiptsBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { iconForItemName } from "../lib/itemIcon.js";
import { categoryForItemName, isValidCategory } from "../lib/categories.js";
import { aiAbuseGuard, chargeGlobalAiBudget } from "../middlewares/aiRateLimit.js";
import { requirePremium } from "../middlewares/requireEntitlement.js";
// Use lib directly to skip pdf-parse's test-file read on import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (
  buf: Buffer,
  options?: {
    max?: number;
    // Custom per-page renderer. pdf-parse calls this once per page in order; we
    // use it to collect each page's text separately so a multi-page PDF can be
    // split into one receipt per page.
    pagerender?: (pageData: {
      getTextContent: (opts?: object) => Promise<{ items: { str: string }[] }>;
    }) => Promise<string>;
  },
) => Promise<{ text: string; numpages: number }> = require("pdf-parse/lib/pdf-parse.js");
const execFileAsync = promisify(execFile);

// Abuse-control limits for the AI-backed endpoints. Base64 expands ~33% over
// raw bytes, so these char caps bound the decoded image/PDF the model and
// pdftoppm have to process well below the global 20mb body cap.
const MAX_IMAGE_B64_CHARS = 10 * 1024 * 1024; // ~7.5 MB decoded image
const MAX_PDF_B64_CHARS = 15 * 1024 * 1024; // ~11 MB decoded PDF
// Only the first few pages are ever sent to the model; bound the expensive
// local work (text extraction + rasterization) to the same cap.
const PDF_MAX_PAGES = 4;
// Hard wall-clock cap on the pdftoppm subprocess so a crafted PDF cannot
// monopolize a worker; SIGKILL guarantees the child is reaped even if it
// ignores SIGTERM.
const PDFTOPPM_TIMEOUT_MS = 25_000;

// --- Image-based PDF rasterization (poppler-only) ---------------------------
// Rendering a page at a fixed DPI can produce an image too large for the vision
// model when a page is extremely tall (e.g. a single long "invoice"/order-
// confirmation page) or very wide. We pick a DPI that keeps the rendered width
// within MAX_IMG_WIDTH_PX, then split a too-tall page into stacked vertical
// bands via pdftoppm's crop flags (-x/-y/-W/-H) so every emitted image stays
// within model limits. No ImageMagick dependency.
const PDF_RENDER_DPI = 150;
const MAX_IMG_WIDTH_PX = 1600; // cap rendered width; lower the DPI if exceeded
const MAX_BAND_HEIGHT_PX = 2200; // split a page taller than this into bands
const MAX_RENDER_IMAGES = 8; // hard cap on total band images sent to the model

// Read the page count and first-page media-box size (assumed uniform across
// pages) via pdfinfo. Returns null if pdfinfo is unavailable or its output is
// unparseable, so the caller can fall back to a plain full-page render.
async function readPdfDims(
  pdfPath: string,
): Promise<{ pages: number; widthPt: number; heightPt: number } | null> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], {
      timeout: PDFTOPPM_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    const pages = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    const size = stdout.match(/^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m);
    const widthPt = Number(size?.[1]);
    const heightPt = Number(size?.[2]);
    if (!pages || !widthPt || !heightPt) return null;
    return { pages, widthPt, heightPt };
  } catch {
    return null;
  }
}

// Collect the JPEG files pdftoppm produced for a given output prefix, in page
// order, as absolute paths.
async function collectJpegs(prefix: string): Promise<string[]> {
  const dir = tmpdir();
  const base = prefix.slice(dir.length + 1);
  return (await readdir(dir))
    .filter((f) => f.startsWith(base) && f.endsWith(".jpg"))
    .sort()
    .map((f) => join(dir, f));
}

// Rasterize the first PDF_MAX_PAGES of an image-based PDF into JPEG files,
// width-capped and split into vertical bands as needed. Returns absolute file
// paths in reading order (top-to-bottom, page-by-page), capped at
// MAX_RENDER_IMAGES. Each pdftoppm invocation is bounded by a wall-clock
// timeout + SIGKILL so a crafted PDF cannot pin a worker.
//
// Every file produced is pushed into `tempFiles` AS IT IS CREATED (not only on
// success) so the caller's finally-block always cleans them up even if a later
// band render throws mid-way.
async function renderPdfToImages(
  pdfPath: string,
  imgPrefix: string,
  tempFiles: string[],
  // When set, render ONLY this 1-based page (used to split a multi-page PDF into
  // one receipt per page). When omitted, render the first PDF_MAX_PAGES.
  onlyPage?: number,
): Promise<string[]> {
  const dims = await readPdfDims(pdfPath);

  // Fallback: no reliable dims — render full pages at the base DPI (original
  // behavior), still bounded to the first PDF_MAX_PAGES (or the single page).
  if (!dims) {
    const first = onlyPage ?? 1;
    const last = onlyPage ?? PDF_MAX_PAGES;
    await execFileAsync(
      "pdftoppm",
      ["-jpeg", "-r", String(PDF_RENDER_DPI), "-f", String(first), "-l", String(last), pdfPath, imgPrefix],
      { timeout: PDFTOPPM_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 },
    );
    const files = (await collectJpegs(imgPrefix)).slice(0, MAX_RENDER_IMAGES);
    tempFiles.push(...files);
    return files;
  }

  // Pick a DPI that keeps the rendered page width within MAX_IMG_WIDTH_PX. The
  // floor is 1 (not a larger value) so the width cap is truly absolute even for
  // a pathologically wide media box — readability is secondary to bounding the
  // raster job's pixel count.
  const widthPxAtBase = (dims.widthPt * PDF_RENDER_DPI) / 72;
  const dpi =
    widthPxAtBase > MAX_IMG_WIDTH_PX
      ? Math.max(1, Math.floor((MAX_IMG_WIDTH_PX * 72) / dims.widthPt))
      : PDF_RENDER_DPI;
  const widthPx = Math.ceil((dims.widthPt * dpi) / 72);
  const heightPx = Math.ceil((dims.heightPt * dpi) / 72);
  const bandsPerPage = Math.max(1, Math.ceil(heightPx / MAX_BAND_HEIGHT_PX));
  const pageCount = Math.min(dims.pages, PDF_MAX_PAGES);
  const firstPage = onlyPage ?? 1;
  const lastPage = onlyPage ?? pageCount;

  const out: string[] = [];
  for (let page = firstPage; page <= lastPage; page++) {
    for (let band = 0; band < bandsPerPage; band++) {
      if (out.length >= MAX_RENDER_IMAGES) return out;
      const y = band * MAX_BAND_HEIGHT_PX;
      const h = Math.min(MAX_BAND_HEIGHT_PX, heightPx - y);
      if (h <= 0) break;
      const bandPrefix = `${imgPrefix}-p${page}-b${band}`;
      await execFileAsync(
        "pdftoppm",
        [
          "-jpeg", "-r", String(dpi),
          "-f", String(page), "-l", String(page),
          "-x", "0", "-y", String(y), "-W", String(widthPx), "-H", String(h),
          pdfPath, bandPrefix,
        ],
        { timeout: PDFTOPPM_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 },
      );
      const produced = await collectJpegs(bandPrefix);
      tempFiles.push(...produced);
      out.push(...produced);
    }
  }
  return out.slice(0, MAX_RENDER_IMAGES);
}

// Guards for image endpoints vs the heavier PDF endpoint.
const imageGuard = aiAbuseGuard({
  windowMs: 60_000,
  maxPerWindow: 12,
  dailyMax: 200,
  maxConcurrentPerUser: 2,
  maxConcurrentGlobal: 8,
  bodyField: "imageBase64",
  maxBodyChars: MAX_IMAGE_B64_CHARS,
  payloadType: "image",
});
const pdfGuard = aiAbuseGuard({
  windowMs: 60_000,
  maxPerWindow: 6,
  dailyMax: 100,
  maxConcurrentPerUser: 1,
  maxConcurrentGlobal: 4,
  bodyField: "pdfBase64",
  maxBodyChars: MAX_PDF_B64_CHARS,
  payloadType: "pdf",
});

function receiptPrompt(): string {
  const today = new Date().toISOString();
  return `You are an expert OCR assistant specialising in paper and thermal receipts.

The image may be a photo of a crumpled, faded, or skewed paper receipt taken with a phone camera. Do your absolute best to read all text, even if parts are blurry, cut off, or at an angle.

────────────────────────────────────────
TYPICAL RECEIPT LAYOUT — use this as a reference map when reading the image:

  ┌─────────────────────────────────────┐
  │         STORE NAME / LOGO           │  ← storeName
  │      123 High Street, City          │  (address — ignore)
  │      Tel: 01234 567890              │  (phone — ignore)
  │                                     │
  │  Date: 14/03/2024   Time: 11:42     │  ← purchasedAt
  │  Receipt #: 00042                   │  (ref — ignore)
  │─────────────────────────────────────│
  │  ITEM NAME              QTY  PRICE  │  ← line items start here
  │─────────────────────────────────────│
  │  Whole Milk 2L           1   1.35   │  ← name / qty / unit price
  │  Free Range Eggs x6      2   2.49   │  ← qty=2, unit price=2.49
  │  Sourdough Bread         1   1.89   │
  │  PLU#4011 Banana         3   0.25   │  ← strip PLU codes from name
  │  CHKN BRST 500G          1   3.75   │  ← expand abbrev → "Chicken Breast 500g"
  │─────────────────────────────────────│
  │  Subtotal:                   9.73   │  ← IGNORE (not a line item)
  │  Loyalty discount:          -0.50   │  ← IGNORE
  │  VAT (20%):                  1.62   │  ← IGNORE
  │  Delivery fee:               1.99   │  ← IGNORE
  │  Tip:                        1.00   │  ← IGNORE
  │─────────────────────────────────────│
  │  TOTAL:                     10.23   │  ← total (the final amount paid)
  │─────────────────────────────────────│
  │  Paid by card: Visa ****1234        │  (payment — ignore)
  │  Thank you for shopping with us!    │  (footer — ignore)
  └─────────────────────────────────────┘

────────────────────────────────────────
WORKED EXAMPLE — given the receipt above, the correct output is:
{
  "storeName": "Store Name",
  "storeNameUncertain": false,
  "storeCountryCode": "GB",
  "storeStateCode": null,
  "purchasedAt": "2024-03-14T11:42:00.000Z",
  "dateUncertain": false,
  "total": 10.23,
  "totalUncertain": false,
  "lineItems": [
    { "name": "Whole Milk 2L",       "icon": "🥛", "category": "Dairy & Eggs",    "price": 1.35, "quantity": 1, "nameUncertain": false, "priceUncertain": false },
    { "name": "Free Range Eggs",     "icon": "🥚", "category": "Dairy & Eggs",    "price": 2.49, "quantity": 2, "nameUncertain": false, "priceUncertain": false },
    { "name": "Sourdough Bread",     "icon": "🍞", "category": "Bakery",          "price": 1.89, "quantity": 1, "nameUncertain": false, "priceUncertain": false },
    { "name": "Banana",              "icon": "🍌", "category": "Produce",         "price": 0.25, "quantity": 3, "nameUncertain": false, "priceUncertain": false },
    { "name": "Chicken Breast 500g", "icon": "🍗", "category": "Meat & Seafood",  "price": 3.75, "quantity": 1, "nameUncertain": false, "priceUncertain": false }
  ]
}

────────────────────────────────────────
Now extract data from the receipt image provided and return ONLY a single valid JSON object in the same format (no markdown, no code fences, no explanation):
{
  "storeName": "Name of the store or retailer",
  "storeNameUncertain": <true if store name was blurry/missing/guessed, false if clearly readable>,
  "storeCountryCode": "<ISO-3166 alpha-2 country code of the store, or null if you can't tell>",
  "storeStateCode": "<for a US store only: the USPS 2-letter state code, else null>",
  "purchasedAt": "ISO 8601 date-time — read the date on the receipt; if unreadable use today: ${today}",
  "dateUncertain": <true if date was blurry/missing/guessed, false if clearly readable>,
  "total": <final total paid as a number>,
  "totalUncertain": <true if total was blurry/missing/guessed, false if clearly readable>,
  "lineItems": [
    {
      "name": "Clean Title Case name",
      "icon": "<a single emoji that best represents this product>",
      "category": "<one of the fixed categories listed below>",
      "price": <unit price>,
      "quantity": <integer>,
      "nameUncertain": <true if item name was blurry/illegible/guessed, false if clearly readable>,
      "priceUncertain": <true if price was blurry/illegible/guessed, false if clearly readable>
    }
  ]
}

Rules:
- storeCountryCode: infer the store's country from the address, currency symbol, phone format, language, or tax labels (e.g. "VAT" → UK/EU, "GST" → AU/CA, "$" with a US state abbreviation → US). Return the uppercase ISO-3166 alpha-2 code (e.g. "US", "GB", "CA", "AU"). If you genuinely cannot tell, return null.
- storeStateCode: ONLY for a US store, return the USPS 2-letter state code (e.g. "CA", "NY", "TX") read from the address. For any non-US store, or if the US state is unreadable, return null.
- Include ONLY purchased product lines — exclude subtotals, taxes, discounts, delivery fees, tips, loyalty points.
- icon must be exactly one emoji that best represents the product (e.g. 🥛 milk, 🍞 bread, 🥕 carrots, 🍗 chicken, 🧻 paper towels). If unsure, use 🛒.
- category MUST be EXACTLY one of these fixed values (copy verbatim): "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry", "Frozen", "Beverages", "Snacks", "Household", "Personal Care", "Baby", "Pet", "Other". Pick the single best fit; use "Other" only if nothing else fits.
- price is always the per-unit price; if only a line total is shown for qty > 1, divide to get the unit price.
- Default quantity to 1 if not printed.
- Expand abbreviations, strip PLU/SKU codes, use Title Case.
- Set *Uncertain fields to true only when that specific value was smudged, cut off, blurry, or is genuinely a guess. Set to false when you can read it clearly.
- Even if uncertain, always provide a best-guess value — never omit a field.
- Return raw JSON only — no markdown, no prose.`;
}

const router = Router();

function formatReceipt(r: typeof receiptsTable.$inferSelect, storeName: string) {
  return {
    ...r,
    storeName,
    total: Number(r.total),
    totalBeforeTax: r.totalBeforeTax != null ? Number(r.totalBeforeTax) : null,
    purchasedAt: r.purchasedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select({
      receipt: receiptsTable,
      storeName: storesTable.name,
    })
    .from(receiptsTable)
    .leftJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
    .where(eq(receiptsTable.userId, userId))
    .orderBy(sql`${receiptsTable.purchasedAt} DESC`);

  res.json(
    rows.map((r) => formatReceipt(r.receipt, r.storeName ?? "Unknown"))
  );
});

// Merge two or more of the user's receipts into a single receipt. All line
// items are reassigned to the earliest-purchased receipt (the "target"); the
// other ("source") receipts are deleted. Useful after a multi-page PDF or a
// multi-photo upload split one logical purchase across several receipts.
router.post("/merge", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = MergeReceiptsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // De-dup ids so a repeated id can't make a receipt its own merge source.
  const receiptIds = [...new Set(parsed.data.receiptIds)];
  if (receiptIds.length < 2) {
    res.status(400).json({ error: "Select at least two distinct receipts to merge" });
    return;
  }

  try {
    const targetId = await db.transaction(async (tx) => {
      // Load + row-lock every requested receipt, scoped to this user. If any id
      // is missing/not owned, the whole merge fails (404).
      const rows = await tx
        .select({ receipt: receiptsTable, storeName: storesTable.name })
        .from(receiptsTable)
        .leftJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
        .where(and(eq(receiptsTable.userId, userId), inArray(receiptsTable.id, receiptIds)))
        .for("update");

      if (rows.length !== receiptIds.length) {
        const err = new Error("not_found") as Error & { status?: number };
        err.status = 404;
        throw err;
      }

      // Target = earliest purchasedAt; tie-break on lowest id for determinism.
      const sorted = [...rows].sort((a, b) => {
        const t = a.receipt.purchasedAt.getTime() - b.receipt.purchasedAt.getTime();
        return t !== 0 ? t : a.receipt.id - b.receipt.id;
      });
      const target = sorted[0].receipt;
      const sources = sorted.slice(1).map((r) => r.receipt);
      const sourceIds = sources.map((r) => r.id);

      // Move every source line item onto the target receipt.
      await tx
        .update(lineItemsTable)
        .set({ receiptId: target.id })
        .where(inArray(lineItemsTable.receiptId, sourceIds));

      // Combined total = sum of all receipt totals (numeric column → string).
      const combinedTotal = rows.reduce((sum, r) => sum + Number(r.receipt.total), 0);
      // Keep totalBeforeTax consistent with total: sum it across receipts, but
      // only if EVERY receipt has it (else the sum would be misleading) — null
      // otherwise so a stale single-receipt value isn't carried over.
      const allHaveBeforeTax = rows.every((r) => r.receipt.totalBeforeTax != null);
      const combinedBeforeTax = allHaveBeforeTax
        ? String(rows.reduce((sum, r) => sum + Number(r.receipt.totalBeforeTax), 0))
        : null;
      await tx
        .update(receiptsTable)
        .set({ total: String(combinedTotal), totalBeforeTax: combinedBeforeTax })
        .where(eq(receiptsTable.id, target.id));

      // Delete the now-empty source receipts (line items already moved).
      await tx.delete(receiptsTable).where(inArray(receiptsTable.id, sourceIds));

      return target.id;
    });

    // Return the merged receipt detail (same shape as GET /:id).
    const rows = await db
      .select({
        receipt: receiptsTable,
        storeName: storesTable.name,
        lineItem: lineItemsTable,
        itemName: itemsTable.name,
        itemIcon: itemsTable.icon,
      })
      .from(receiptsTable)
      .leftJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
      .leftJoin(lineItemsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
      .leftJoin(itemsTable, eq(lineItemsTable.itemId, itemsTable.id))
      .where(and(eq(receiptsTable.id, targetId), eq(receiptsTable.userId, userId)));

    const receipt = rows[0].receipt;
    const storeName = rows[0].storeName ?? "Unknown";
    const lineItems = rows
      .filter((r) => r.lineItem !== null)
      .map((r) => ({
        ...r.lineItem!,
        itemName: r.itemName ?? "Unknown",
        icon: r.itemIcon ?? null,
        price: Number(r.lineItem!.price),
        quantity: Number(r.lineItem!.quantity),
        createdAt: r.lineItem!.createdAt.toISOString(),
      }));

    res.json({ ...formatReceipt(receipt, storeName), lineItems });
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      res.status(404).json({ error: "One or more receipts were not found" });
      return;
    }
    req.log.error({ err }, "Failed to merge receipts");
    res.status(500).json({ error: "Failed to merge receipts" });
  }
});

router.post("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // The referenced store must belong to the user.
  const [store] = await db
    .select()
    .from(storesTable)
    .where(and(eq(storesTable.id, parsed.data.storeId), eq(storesTable.userId, userId)));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  const [receipt] = await db
    .insert(receiptsTable)
    .values({ ...parsed.data, userId, purchasedAt: new Date(parsed.data.purchasedAt), total: String(parsed.data.total) })
    .returning();
  res.status(201).json(formatReceipt(receipt, store.name));
});

router.get("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const rows = await db
    .select({
      receipt: receiptsTable,
      storeName: storesTable.name,
      lineItem: lineItemsTable,
      itemName: itemsTable.name,
      itemIcon: itemsTable.icon,
    })
    .from(receiptsTable)
    .leftJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
    .leftJoin(lineItemsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .leftJoin(itemsTable, eq(lineItemsTable.itemId, itemsTable.id))
    .where(and(eq(receiptsTable.id, id), eq(receiptsTable.userId, userId)));

  if (!rows.length) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  const receipt = rows[0].receipt;
  const storeName = rows[0].storeName ?? "Unknown";
  const lineItems = rows
    .filter((r) => r.lineItem !== null)
    .map((r) => ({
      ...r.lineItem!,
      itemName: r.itemName ?? "Unknown",
      icon: r.itemIcon ?? null,
      price: Number(r.lineItem!.price),
      quantity: Number(r.lineItem!.quantity),
      createdAt: r.lineItem!.createdAt.toISOString(),
    }));

  res.json({
    ...formatReceipt(receipt, storeName),
    lineItems,
  });
});

router.delete("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  await db.delete(receiptsTable).where(and(eq(receiptsTable.id, id), eq(receiptsTable.userId, userId)));
  res.status(204).send();
});

router.post("/:id/line-items", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const receiptId = parseInt(req.params.id);
  const parsed = AddLineItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Receipt and item must both belong to the user.
  const [receipt] = await db
    .select({ id: receiptsTable.id })
    .from(receiptsTable)
    .where(and(eq(receiptsTable.id, receiptId), eq(receiptsTable.userId, userId)));
  if (!receipt) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }
  const [ownedItem] = await db
    .select({ id: itemsTable.id })
    .from(itemsTable)
    .where(and(eq(itemsTable.id, parsed.data.itemId), eq(itemsTable.userId, userId)));
  if (!ownedItem) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const [lineItem] = await db
    .insert(lineItemsTable)
    .values({
      receiptId,
      itemId: parsed.data.itemId,
      price: String(parsed.data.price),
      quantity: parsed.data.quantity != null ? String(parsed.data.quantity) : undefined,
    })
    .returning();

  // Increment purchase count
  await db
    .update(itemsTable)
    .set({ purchaseCount: sql`${itemsTable.purchaseCount} + 1` })
    .where(eq(itemsTable.id, parsed.data.itemId));

  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, parsed.data.itemId));

  res.status(201).json({
    ...lineItem,
    itemName: item?.name ?? "Unknown",
    icon: item?.icon ?? null,
    price: Number(lineItem.price),
    quantity: Number(lineItem.quantity),
    createdAt: lineItem.createdAt.toISOString(),
  });
});

// Detect receipt bounding box in a photo using AI
router.post("/detect-bounds", requirePremium, imageGuard, async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64: string };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  try {
    if (!chargeGlobalAiBudget(res)) return;
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Look at this photo and find the rectangular boundary of the receipt or document in it.

Return ONLY a single JSON object with the bounding box as fractions (0.0 to 1.0) of the full image dimensions:
{"x": <left edge>, "y": <top edge>, "width": <width>, "height": <height>}

Rules:
- x=0, y=0 is the top-left corner of the image.
- Include a small amount of padding (2-3%) around the receipt edges.
- If the receipt fills most of the image already, return {"x":0,"y":0,"width":1,"height":1}.
- If you cannot detect a clear receipt, return {"x":0,"y":0,"width":1,"height":1}.
- Return ONLY the raw JSON — no markdown, no explanation.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "low",
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const bounds = JSON.parse(content) as { x: number; y: number; width: number; height: number };

    // Clamp all values to [0, 1]
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    res.json({
      x: clamp(bounds.x ?? 0),
      y: clamp(bounds.y ?? 0),
      width: clamp(bounds.width ?? 1),
      height: clamp(bounds.height ?? 1),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to detect receipt bounds");
    // Fallback: return full image
    res.json({ x: 0, y: 0, width: 1, height: 1 });
  }
});

// Parse receipt image with AI
router.post("/parse", requirePremium, imageGuard, async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64: string };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  try {
    if (!chargeGlobalAiBudget(res)) return;
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: receiptPrompt(),
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "Failed to parse receipt");
    res.status(500).json({ error: "Failed to parse receipt image" });
  }
});

// Shared helper: persist a parsed receipt (store, receipt, line items) to the DB
// Resolve the country/state to stamp on a store from AI-detected values, falling
// back to the uploading user's own region (they scanned a local receipt). AI
// values are validated/normalized; an invalid or missing code falls through.
// State is only meaningful for the US.
function resolveScanRegion(
  ai: { country?: string | null; state?: string | null },
  user: { countryCode: string | null; stateCode: string | null },
): { countryCode: string | null; stateCode: string | null } {
  const aiCountryRaw = normalizeRegionCode(ai.country);
  const aiCountry = aiCountryRaw && isValidCountry(aiCountryRaw) ? aiCountryRaw : null;
  const countryCode = aiCountry ?? user.countryCode ?? null;
  if (!countryCode || !isStateScoped(countryCode)) {
    return { countryCode, stateCode: null };
  }
  // US store: prefer the AI-read state; else, only if the user's own region is
  // also US, fall back to their state.
  const aiStateRaw = normalizeRegionCode(ai.state);
  const aiState = aiStateRaw && isValidUsState(aiStateRaw) ? aiStateRaw : null;
  const userState = user.countryCode === "US" ? user.stateCode : null;
  return { countryCode, stateCode: aiState ?? userState ?? null };
}

async function persistParsedReceipt(userId: string, parsed: {
  storeName: string;
  storeCountryCode?: string | null;
  storeStateCode?: string | null;
  purchasedAt: string;
  total: number;
  lineItems: { name: string; price: number; quantity: number; icon?: string | null; category?: string | null }[];
}) {
  // Uploading user's own region, used as the fallback for new/unstamped stores.
  const [u] = await db
    .select({ countryCode: usersTable.countryCode, stateCode: usersTable.stateCode })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const userRegion = { countryCode: u?.countryCode ?? null, stateCode: u?.stateCode ?? null };

  // Guard against a blank/whitespace storeName from the model: a "" value still
  // satisfies the NOT NULL column but creates an unnamed store the user reads as
  // "no store was created". Fall back to a sensible placeholder instead.
  const storeName = parsed.storeName?.trim() || "Unknown Store";

  // Find or create store (scoped to this user)
  let store = (await db.select().from(storesTable).where(and(eq(storesTable.userId, userId), sql`LOWER(${storesTable.name}) = LOWER(${storeName})`)))[0];
  if (!store) {
    const region = resolveScanRegion(
      { country: parsed.storeCountryCode, state: parsed.storeStateCode },
      userRegion,
    );
    [store] = await db
      .insert(storesTable)
      .values({ name: storeName, userId, countryCode: region.countryCode, stateCode: region.stateCode })
      .returning();
  } else if (!store.countryCode) {
    // Lazy-backfill region on a pre-existing store that has none yet.
    const region = resolveScanRegion(
      { country: parsed.storeCountryCode, state: parsed.storeStateCode },
      userRegion,
    );
    if (region.countryCode) {
      await db
        .update(storesTable)
        .set({ countryCode: region.countryCode, stateCode: region.stateCode })
        .where(eq(storesTable.id, store.id));
      store.countryCode = region.countryCode;
      store.stateCode = region.stateCode;
    }
  }

  // Create receipt
  const [receipt] = await db
    .insert(receiptsTable)
    .values({
      userId,
      storeId: store.id,
      purchasedAt: new Date(parsed.purchasedAt),
      total: String(parsed.total),
    })
    .returning();

  // Create line items
  const savedLineItems = [];
  for (const li of parsed.lineItems) {
    let item = (await db.select().from(itemsTable).where(and(eq(itemsTable.userId, userId), sql`LOWER(${itemsTable.name}) = LOWER(${li.name})`)))[0];
    const liCategory = isValidCategory(li.category) ? li.category : categoryForItemName(li.name);
    if (!item) {
      const icon = li.icon || iconForItemName(li.name);
      [item] = await db.insert(itemsTable).values({ name: li.name, icon, category: liCategory, purchaseCount: 1, userId }).returning();
    } else {
      const backfillIcon = !item.icon ? li.icon || iconForItemName(li.name) : undefined;
      const backfillCategory = !item.category ? liCategory : undefined;
      await db
        .update(itemsTable)
        .set({
          purchaseCount: sql`${itemsTable.purchaseCount} + 1`,
          ...(backfillIcon ? { icon: backfillIcon } : {}),
          ...(backfillCategory ? { category: backfillCategory } : {}),
        })
        .where(eq(itemsTable.id, item.id));
      item.purchaseCount += 1;
      if (backfillIcon) item.icon = backfillIcon;
      if (backfillCategory) item.category = backfillCategory;
    }

    const [lineItem] = await db
      .insert(lineItemsTable)
      .values({ receiptId: receipt.id, itemId: item.id, price: String(li.price), quantity: String(li.quantity) })
      .returning();

    savedLineItems.push({
      ...lineItem,
      itemName: item.name,
      icon: item.icon ?? null,
      price: Number(lineItem.price),
      quantity: Number(lineItem.quantity),
      createdAt: lineItem.createdAt.toISOString(),
    });
  }

  return { receipt, store, savedLineItems };
}

// Parse and save receipt
router.post("/parse-and-save", requirePremium, imageGuard, async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64: string };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  try {
    if (!chargeGlobalAiBudget(res)) return;
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: receiptPrompt() },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "high" } },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: { storeName: string; storeCountryCode?: string | null; storeStateCode?: string | null; purchasedAt: string; total: number; lineItems: { name: string; price: number; quantity: number; icon?: string | null; category?: string | null }[] };

    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "Failed to parse AI response as JSON" });
      return;
    }

    const { receipt, store, savedLineItems } = await persistParsedReceipt(req.userId!, parsed);
    res.status(201).json({ ...formatReceipt(receipt, store.name), lineItems: savedLineItems });
  } catch (err) {
    req.log.error({ err }, "Failed to parse-and-save receipt");
    res.status(500).json({ error: "Failed to process receipt" });
  }
});

// Save an already-parsed (and user-corrected) receipt — skips AI, saves directly
router.post("/save-parsed", async (req, res): Promise<void> => {
  const parsed = req.body as { storeName: string; storeCountryCode?: string | null; storeStateCode?: string | null; purchasedAt: string; total: number; lineItems: { name: string; price: number; quantity: number; icon?: string | null; category?: string | null }[] };
  if (!parsed.storeName || !parsed.purchasedAt || parsed.total == null || !Array.isArray(parsed.lineItems)) {
    res.status(400).json({ error: "storeName, purchasedAt, total, and lineItems are required" });
    return;
  }

  try {
    const { receipt, store, savedLineItems } = await persistParsedReceipt(req.userId!, parsed);
    res.status(201).json({ ...formatReceipt(receipt, store.name), lineItems: savedLineItems });
  } catch (err) {
    req.log.error({ err }, "Failed to save parsed receipt");
    res.status(500).json({ error: "Failed to save receipt" });
  }
});

// Parse and save a PDF receipt — handles text-based and image-based (scanned)
// PDFs. EACH PAGE is parsed independently and saved as its OWN receipt, so a
// multi-page PDF (e.g. a stack of receipts scanned into one file) yields one
// receipt per page; the client can then merge any that belong together.
router.post("/parse-pdf", requirePremium, pdfGuard, async (req, res): Promise<void> => {
  const { pdfBase64 } = req.body as { pdfBase64: string };
  if (!pdfBase64) {
    res.status(400).json({ error: "pdfBase64 is required" });
    return;
  }

  const id = randomUUID();
  const pdfPath = join(tmpdir(), `receipt-${id}.pdf`);
  const tempFiles: string[] = [pdfPath];

  type ParsedReceipt = {
    storeName: string;
    storeCountryCode?: string | null;
    storeStateCode?: string | null;
    purchasedAt: string;
    total: number;
    lineItems: { name: string; price: number; quantity: number; icon?: string | null; category?: string | null }[];
  };

  const today = new Date().toISOString();
  const jsonSchema = `{
  "storeName": "store or retailer name",
  "storeCountryCode": "ISO-3166 alpha-2 country code of the store, or null if unknown",
  "storeStateCode": "for a US store only, the USPS 2-letter state code, else null",
  "purchasedAt": "ISO 8601 date string (use today if unclear: ${today})",
  "total": total order amount as number,
  "lineItems": [
    { "name": "item name", "icon": "a single emoji best representing the product", "category": "one of the fixed categories", "price": price per unit as number, "quantity": quantity as number }
  ]
}`;
  const jsonInstructions = `Normalize item names (title case, remove special chars). If quantity is not shown, use 1. Only include actual purchased items — exclude delivery fees, taxes, discounts, and subtotals. For each item, set "icon" to exactly one emoji that best represents the product (e.g. 🥛 milk, 🍞 bread, 🥕 carrots); use 🛒 if unsure. Set "category" to EXACTLY one of: "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry", "Frozen", "Beverages", "Snacks", "Household", "Personal Care", "Baby", "Pet", "Other". For "storeCountryCode", infer the store's country (uppercase ISO-3166 alpha-2, e.g. "US", "GB", "CA", "AU") from the address, currency, or tax labels; use null if you can't tell. For "storeStateCode", only for a US store return the USPS 2-letter state code from the address, else null. This may be a forwarded email or a delivery/marketplace order confirmation: set "storeName" to the actual merchant or retailer the goods were bought from (look for labels like "Store", "Merchant", "Sold by", or "Vendor") — never the email sender or recipient, a person's name, the delivery service, or the marketplace platform. "storeName" must always be a non-empty merchant name. This is a SINGLE page from a larger PDF — only extract what is visible on this page.`;

  // Tolerant JSON parse: strip ```json fences the model sometimes adds. Returns
  // null on failure so one bad page is skipped instead of failing the request.
  const parseJson = (content: string): ParsedReceipt | null => {
    try {
      const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      return JSON.parse(cleaned) as ParsedReceipt;
    } catch {
      return null;
    }
  };

  try {
    const buffer = Buffer.from(pdfBase64, "base64");
    // We may need to rasterize any page that has too little extractable text, so
    // write the PDF to disk up front.
    await writeFile(pdfPath, buffer);

    // Collect each page's text separately (pdf-parse calls pagerender per page,
    // in order). Image-only pages come back as "" but still occupy a slot, so
    // pageTexts.length is a reliable page count, capped at PDF_MAX_PAGES.
    const pageTexts: string[] = [];
    await pdfParse(buffer, {
      max: PDF_MAX_PAGES,
      pagerender: async (pageData) => {
        try {
          const tc = await pageData.getTextContent();
          const text = tc.items.map((i) => i.str).join(" ");
          pageTexts.push(text);
          return text;
        } catch {
          pageTexts.push("");
          return "";
        }
      },
    });

    // Fall back to a single page if pagerender produced nothing (e.g. an
    // unusual PDF structure) so we still attempt an image-based parse.
    const pageCount = Math.min(Math.max(pageTexts.length, 1), PDF_MAX_PAGES);

    // Charge the shared AI budget once for this request before any model call.
    if (!chargeGlobalAiBudget(res)) return;

    const results: object[] = [];

    for (let i = 0; i < pageCount; i++) {
      const pageNum = i + 1;
      const pageText = (pageTexts[i] ?? "").trim();

      // Each page is processed and persisted INDEPENDENTLY: a failure on one
      // page (model error, render error, bad JSON, DB insert) must not discard
      // pages already saved nor abort the whole request — otherwise a retry
      // would silently re-create the earlier pages as duplicates. We catch
      // per-page, skip the failed page, and still return whatever succeeded.
      try {
        let parsed: ParsedReceipt | null = null;

        if (pageText.length >= 50) {
          // Text-based page: cheaper + more accurate than rasterizing.
          const response = await openai.chat.completions.create({
            model: "gpt-5.2",
            max_completion_tokens: 2048,
            messages: [{
              role: "user",
              content: `Extract receipt data from the following text (one page of an order confirmation PDF) and return ONLY valid JSON (no markdown, no code blocks):\n${jsonSchema}\n${jsonInstructions}\n\nPDF page text:\n${pageText.slice(0, 8000)}`,
            }],
          });
          parsed = parseJson(response.choices[0]?.message?.content ?? "{}");
        } else {
          // Image-based page: rasterize just this page (width-capped + banded).
          const pagePrefix = join(tmpdir(), `receipt-${id}-page${pageNum}`);
          const pageFiles = await renderPdfToImages(pdfPath, pagePrefix, tempFiles, pageNum);
          if (pageFiles.length === 0) continue;

          const imageContents = await Promise.all(
            pageFiles.map(async (f) => {
              const imgBuf = await readFile(f);
              return {
                type: "image_url" as const,
                image_url: {
                  url: `data:image/jpeg;base64,${imgBuf.toString("base64")}`,
                  detail: "high" as const,
                },
              };
            }),
          );

          const response = await openai.chat.completions.create({
            model: "gpt-5.2",
            max_completion_tokens: 2048,
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text: `This is one page from a receipt or order confirmation PDF. Extract the receipt data and return ONLY valid JSON (no markdown, no code blocks):\n${jsonSchema}\n${jsonInstructions}`,
                },
                ...imageContents,
              ],
            }],
          });
          parsed = parseJson(response.choices[0]?.message?.content ?? "{}");
        }

        // Skip blank/unreadable pages (no items) so a cover page or trailing
        // blank page doesn't create an empty receipt.
        if (!parsed || !Array.isArray(parsed.lineItems) || parsed.lineItems.length === 0) {
          continue;
        }

        const { receipt, store, savedLineItems } = await persistParsedReceipt(req.userId!, parsed);
        results.push({ ...formatReceipt(receipt, store.name), lineItems: savedLineItems });
      } catch (pageErr) {
        req.log.warn({ err: pageErr, pageNum }, "Failed to parse one PDF page; skipping");
      }
    }

    if (results.length === 0) {
      res.status(422).json({
        error: "We couldn't read any receipts from this PDF — it may be blank, scanned at low quality, or not a receipt.",
      });
      return;
    }

    res.status(201).json({ receipts: results });
  } catch (err) {
    req.log.error({ err }, "Failed to parse PDF receipt");
    res.status(500).json({ error: "Failed to process PDF receipt" });
  } finally {
    await Promise.all(tempFiles.map((f) => unlink(f).catch(() => {})));
  }
});

// Manually enter a receipt with store info and line items
router.post("/manual-entry", async (req, res): Promise<void> => {
  const {
    storeName,
    storeAddress,
    storePhone,
    storeOpenTimes,
    purchasedAt,
    total,
    totalBeforeTax,
    notes,
    lineItems,
  } = req.body as {
    storeName: string;
    storeAddress?: string | null;
    storePhone?: string | null;
    storeOpenTimes?: string | null;
    purchasedAt: string;
    total: number;
    totalBeforeTax?: number | null;
    notes?: string | null;
    lineItems: { name: string; price: number; quantity: number }[];
  };

  if (!storeName || total == null || !purchasedAt || !Array.isArray(lineItems)) {
    res.status(400).json({ error: "storeName, purchasedAt, total, and lineItems are required" });
    return;
  }

  try {
    const userId = req.userId!;
    // Find or create store (scoped to this user)
    let store = (await db.select().from(storesTable).where(and(eq(storesTable.userId, userId), sql`LOWER(${storesTable.name}) = LOWER(${storeName})`)))[0];
    if (!store) {
      [store] = await db
        .insert(storesTable)
        .values({
          name: storeName,
          userId,
          address: storeAddress ?? null,
          phone: storePhone ?? null,
          openTimes: storeOpenTimes ?? null,
        })
        .returning();
    } else if (storeAddress || storePhone || storeOpenTimes) {
      // Update optional store fields if provided
      const updates: Partial<typeof storesTable.$inferInsert> = {};
      if (storeAddress) updates.address = storeAddress;
      if (storePhone) updates.phone = storePhone;
      if (storeOpenTimes) updates.openTimes = storeOpenTimes;
      [store] = await db.update(storesTable).set(updates).where(and(eq(storesTable.id, store.id), eq(storesTable.userId, userId))).returning();
    }

    // Create receipt
    const [receipt] = await db
      .insert(receiptsTable)
      .values({
        userId,
        storeId: store.id,
        purchasedAt: new Date(purchasedAt),
        total: String(total),
        totalBeforeTax: totalBeforeTax != null ? String(totalBeforeTax) : null,
        notes: notes ?? null,
      })
      .returning();

    // Create line items
    const savedLineItems = [];
    for (const li of lineItems) {
      let item = (await db.select().from(itemsTable).where(and(eq(itemsTable.userId, userId), sql`LOWER(${itemsTable.name}) = LOWER(${li.name})`)))[0];
      if (!item) {
        [item] = await db.insert(itemsTable).values({ name: li.name, icon: iconForItemName(li.name), category: categoryForItemName(li.name), purchaseCount: 1, userId }).returning();
      } else {
        const backfillIcon = !item.icon ? iconForItemName(li.name) : undefined;
        const backfillCategory = !item.category ? categoryForItemName(li.name) : undefined;
        await db
          .update(itemsTable)
          .set({
            purchaseCount: sql`${itemsTable.purchaseCount} + 1`,
            ...(backfillIcon ? { icon: backfillIcon } : {}),
            ...(backfillCategory ? { category: backfillCategory } : {}),
          })
          .where(eq(itemsTable.id, item.id));
        item.purchaseCount += 1;
        if (backfillIcon) item.icon = backfillIcon;
        if (backfillCategory) item.category = backfillCategory;
      }

      const [lineItem] = await db
        .insert(lineItemsTable)
        .values({ receiptId: receipt.id, itemId: item.id, price: String(li.price), quantity: String(li.quantity) })
        .returning();

      savedLineItems.push({
        ...lineItem,
        itemName: item.name,
        icon: item.icon ?? null,
        price: Number(lineItem.price),
        quantity: Number(lineItem.quantity),
        createdAt: lineItem.createdAt.toISOString(),
      });
    }

    res.status(201).json({
      ...formatReceipt(receipt, store.name),
      lineItems: savedLineItems,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to save manual receipt entry");
    res.status(500).json({ error: "Failed to save receipt" });
  }
});

export default router;

