import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink, readdir } from "fs/promises";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { receiptsTable, storesTable, lineItemsTable, itemsTable } from "@workspace/db";
import {
  CreateReceiptBody,
  AddLineItemBody,
  UpdateLineItemBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { iconForItemName } from "../lib/itemIcon.js";
import { categoryForItemName, isValidCategory } from "../lib/categories.js";
// Use lib directly to skip pdf-parse's test-file read on import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require("pdf-parse/lib/pdf-parse.js");
const execFileAsync = promisify(execFile);

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
router.post("/detect-bounds", async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64: string };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  try {
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
router.post("/parse", async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64: string };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  try {
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
async function persistParsedReceipt(userId: string, parsed: {
  storeName: string;
  purchasedAt: string;
  total: number;
  lineItems: { name: string; price: number; quantity: number; icon?: string | null; category?: string | null }[];
}) {
  // Find or create store (scoped to this user)
  let store = (await db.select().from(storesTable).where(and(eq(storesTable.userId, userId), sql`LOWER(${storesTable.name}) = LOWER(${parsed.storeName})`)))[0];
  if (!store) {
    [store] = await db.insert(storesTable).values({ name: parsed.storeName, userId }).returning();
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
router.post("/parse-and-save", async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64: string };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  try {
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
    let parsed: { storeName: string; purchasedAt: string; total: number; lineItems: { name: string; price: number; quantity: number; icon?: string | null; category?: string | null }[] };

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
  const parsed = req.body as { storeName: string; purchasedAt: string; total: number; lineItems: { name: string; price: number; quantity: number; icon?: string | null; category?: string | null }[] };
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

// Parse and save a PDF receipt — handles text-based and image-based (scanned) PDFs
router.post("/parse-pdf", async (req, res): Promise<void> => {
  const { pdfBase64 } = req.body as { pdfBase64: string };
  if (!pdfBase64) {
    res.status(400).json({ error: "pdfBase64 is required" });
    return;
  }

  const id = randomUUID();
  const pdfPath = join(tmpdir(), `receipt-${id}.pdf`);
  const imgPrefix = join(tmpdir(), `receipt-${id}`);
  const tempFiles: string[] = [pdfPath];

  try {
    const buffer = Buffer.from(pdfBase64, "base64");

    // Try text extraction first (works for text-based PDFs)
    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text.trim();

    type ParsedReceipt = {
      storeName: string;
      purchasedAt: string;
      total: number;
      lineItems: { name: string; price: number; quantity: number; icon?: string | null; category?: string | null }[];
    };
    let parsed: ParsedReceipt;
    const today = new Date().toISOString();
    const jsonSchema = `{
  "storeName": "store or retailer name",
  "purchasedAt": "ISO 8601 date string (use today if unclear: ${today})",
  "total": total order amount as number,
  "lineItems": [
    { "name": "item name", "icon": "a single emoji best representing the product", "category": "one of the fixed categories", "price": price per unit as number, "quantity": quantity as number }
  ]
}`;
    const jsonInstructions = `Normalize item names (title case, remove special chars). If quantity is not shown, use 1. Only include actual purchased items — exclude delivery fees, taxes, discounts, and subtotals. For each item, set "icon" to exactly one emoji that best represents the product (e.g. 🥛 milk, 🍞 bread, 🥕 carrots); use 🛒 if unsure. Set "category" to EXACTLY one of: "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry", "Frozen", "Beverages", "Snacks", "Household", "Personal Care", "Baby", "Pet", "Other".`;

    if (extractedText.length >= 50) {
      // Text-based PDF: send extracted text to language model
      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 2048,
        messages: [{
          role: "user",
          content: `Extract receipt data from the following text (from an online order confirmation PDF) and return ONLY valid JSON (no markdown, no code blocks):\n${jsonSchema}\n${jsonInstructions}\n\nPDF text:\n${extractedText.slice(0, 8000)}`,
        }],
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      try {
        parsed = JSON.parse(content) as ParsedReceipt;
      } catch {
        res.status(500).json({ error: "Failed to parse AI response as JSON" });
        return;
      }
    } else {
      // Image-based PDF: render pages with pdftoppm then use Vision
      await writeFile(pdfPath, buffer);
      await execFileAsync("pdftoppm", ["-jpeg", "-r", "150", pdfPath, imgPrefix]);

      // Collect generated JPEG files (pdftoppm names them prefix-1.jpg, prefix-01.jpg, etc.)
      const allFiles = await readdir(tmpdir());
      const pageFiles = allFiles
        .filter((f) => f.startsWith(`receipt-${id}`) && f.endsWith(".jpg"))
        .sort()
        .slice(0, 4); // cap at 4 pages to limit tokens

      for (const f of pageFiles) tempFiles.push(join(tmpdir(), f));

      if (pageFiles.length === 0) {
        res.status(422).json({ error: "Could not render PDF pages — the file may be corrupted." });
        return;
      }

      const imageContents = await Promise.all(
        pageFiles.map(async (f) => {
          const imgBuf = await readFile(join(tmpdir(), f));
          return {
            type: "image_url" as const,
            image_url: {
              url: `data:image/jpeg;base64,${imgBuf.toString("base64")}`,
              detail: "high" as const,
            },
          };
        })
      );

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `These are pages from a receipt or order confirmation PDF. Extract the receipt data and return ONLY valid JSON (no markdown, no code blocks):\n${jsonSchema}\n${jsonInstructions}`,
            },
            ...imageContents,
          ],
        }],
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      try {
        parsed = JSON.parse(content) as ParsedReceipt;
      } catch {
        res.status(500).json({ error: "Failed to parse AI response as JSON" });
        return;
      }
    }

    // Persist receipt and line items (scoped to this user)
    const { receipt, store, savedLineItems } = await persistParsedReceipt(req.userId!, parsed);

    res.status(201).json({ ...formatReceipt(receipt, store.name), lineItems: savedLineItems });
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

