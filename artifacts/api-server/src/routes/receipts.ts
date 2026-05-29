import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { receiptsTable, storesTable, lineItemsTable, itemsTable } from "@workspace/db";
import {
  CreateReceiptBody,
  AddLineItemBody,
  UpdateLineItemBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
// Use lib directly to skip pdf-parse's test-file read on import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require("pdf-parse/lib/pdf-parse.js");

function receiptPrompt(): string {
  const today = new Date().toISOString();
  return `You are an expert OCR assistant specialising in paper and thermal receipts.

The image may be a photo of a crumpled, faded, or skewed paper receipt taken with a phone camera. Do your absolute best to read all text, even if parts are blurry, cut off, or at an angle.

Extract the receipt data and return ONLY a single valid JSON object (no markdown, no code fences, no explanation):
{
  "storeName": "Name of the store or retailer",
  "purchasedAt": "ISO 8601 date-time string — read the date printed on the receipt; if unreadable use today: ${today}",
  "total": <the final total paid as a number, excluding delivery/service fees>,
  "lineItems": [
    { "name": "Clean item name in Title Case", "price": <unit price as number>, "quantity": <quantity as integer> }
  ]
}

Rules:
- lineItems must contain ONLY purchased products/items — exclude subtotals, taxes, discounts, delivery fees, tips, and loyalty points lines.
- price is the per-unit price. If only a line total is shown for qty > 1, divide to get the unit price.
- If quantity is not printed, default to 1.
- Normalise item names: Title Case, expand obvious abbreviations (e.g. "CHKN" → "Chicken"), remove SKU codes or PLU numbers.
- If the store name is ambiguous, use the most prominent text at the top of the receipt.
- If you cannot confidently read a field, make a reasonable inference rather than omitting it.
- Never return markdown or prose — only the raw JSON object.`;
}

const router = Router();

function formatReceipt(r: typeof receiptsTable.$inferSelect, storeName: string) {
  return {
    ...r,
    storeName,
    total: Number(r.total),
    purchasedAt: r.purchasedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      receipt: receiptsTable,
      storeName: storesTable.name,
    })
    .from(receiptsTable)
    .leftJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
    .orderBy(sql`${receiptsTable.purchasedAt} DESC`);

  res.json(
    rows.map((r) => formatReceipt(r.receipt, r.storeName ?? "Unknown"))
  );
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [receipt] = await db
    .insert(receiptsTable)
    .values({ ...parsed.data, purchasedAt: new Date(parsed.data.purchasedAt), total: String(parsed.data.total) })
    .returning();
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, receipt.storeId));
  res.status(201).json(formatReceipt(receipt, store?.name ?? "Unknown"));
});

router.get("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const rows = await db
    .select({
      receipt: receiptsTable,
      storeName: storesTable.name,
      lineItem: lineItemsTable,
      itemName: itemsTable.name,
    })
    .from(receiptsTable)
    .leftJoin(storesTable, eq(receiptsTable.storeId, storesTable.id))
    .leftJoin(lineItemsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .leftJoin(itemsTable, eq(lineItemsTable.itemId, itemsTable.id))
    .where(eq(receiptsTable.id, id));

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
  const id = parseInt(req.params.id);
  await db.delete(receiptsTable).where(eq(receiptsTable.id, id));
  res.status(204).send();
});

router.post("/:id/line-items", async (req, res): Promise<void> => {
  const receiptId = parseInt(req.params.id);
  const parsed = AddLineItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
    price: Number(lineItem.price),
    quantity: Number(lineItem.quantity),
    createdAt: lineItem.createdAt.toISOString(),
  });
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
    let parsed: { storeName: string; purchasedAt: string; total: number; lineItems: { name: string; price: number; quantity: number }[] };

    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "Failed to parse AI response as JSON" });
      return;
    }

    // Find or create store
    let store = (await db.select().from(storesTable).where(sql`LOWER(${storesTable.name}) = LOWER(${parsed.storeName})`))[0];
    if (!store) {
      [store] = await db.insert(storesTable).values({ name: parsed.storeName }).returning();
    }

    // Create receipt
    const [receipt] = await db
      .insert(receiptsTable)
      .values({
        storeId: store.id,
        purchasedAt: new Date(parsed.purchasedAt),
        total: String(parsed.total),
      })
      .returning();

    // Create line items
    const savedLineItems = [];
    for (const li of parsed.lineItems) {
      // Find or create item by name (case-insensitive)
      let item = (await db.select().from(itemsTable).where(sql`LOWER(${itemsTable.name}) = LOWER(${li.name})`))[0];
      if (!item) {
        [item] = await db.insert(itemsTable).values({ name: li.name, purchaseCount: 1 }).returning();
      } else {
        await db.update(itemsTable).set({ purchaseCount: sql`${itemsTable.purchaseCount} + 1` }).where(eq(itemsTable.id, item.id));
        item.purchaseCount += 1;
      }

      const [lineItem] = await db
        .insert(lineItemsTable)
        .values({ receiptId: receipt.id, itemId: item.id, price: String(li.price), quantity: String(li.quantity) })
        .returning();

      savedLineItems.push({
        ...lineItem,
        itemName: item.name,
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
    req.log.error({ err }, "Failed to parse-and-save receipt");
    res.status(500).json({ error: "Failed to process receipt" });
  }
});

// Parse and save a PDF receipt (online order confirmation)
router.post("/parse-pdf", async (req, res): Promise<void> => {
  const { pdfBase64 } = req.body as { pdfBase64: string };
  if (!pdfBase64) {
    res.status(400).json({ error: "pdfBase64 is required" });
    return;
  }

  try {
    const buffer = Buffer.from(pdfBase64, "base64");
    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text.slice(0, 8000); // cap tokens

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Extract receipt data from the following text (from an online order confirmation PDF) and return ONLY valid JSON (no markdown, no code blocks):
{
  "storeName": "store or retailer name",
  "purchasedAt": "ISO 8601 date string (use today if unclear: ${new Date().toISOString()})",
  "total": total order amount as number,
  "lineItems": [
    { "name": "item name", "price": price per unit as number, "quantity": quantity as number }
  ]
}
Normalize item names (title case, remove special chars). If quantity is not shown, use 1. Only include actual purchased items, not subtotals, shipping, or tax lines.

PDF text:
${extractedText}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: { storeName: string; purchasedAt: string; total: number; lineItems: { name: string; price: number; quantity: number }[] };

    try {
      parsed = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "Failed to parse AI response as JSON" });
      return;
    }

    // Find or create store
    let store = (await db.select().from(storesTable).where(sql`LOWER(${storesTable.name}) = LOWER(${parsed.storeName})`))[0];
    if (!store) {
      [store] = await db.insert(storesTable).values({ name: parsed.storeName }).returning();
    }

    const [receipt] = await db
      .insert(receiptsTable)
      .values({
        storeId: store.id,
        purchasedAt: new Date(parsed.purchasedAt),
        total: String(parsed.total),
      })
      .returning();

    const savedLineItems = [];
    for (const li of parsed.lineItems) {
      let item = (await db.select().from(itemsTable).where(sql`LOWER(${itemsTable.name}) = LOWER(${li.name})`))[0];
      if (!item) {
        [item] = await db.insert(itemsTable).values({ name: li.name, purchaseCount: 1 }).returning();
      } else {
        await db.update(itemsTable).set({ purchaseCount: sql`${itemsTable.purchaseCount} + 1` }).where(eq(itemsTable.id, item.id));
        item.purchaseCount += 1;
      }

      const [lineItem] = await db
        .insert(lineItemsTable)
        .values({ receiptId: receipt.id, itemId: item.id, price: String(li.price), quantity: String(li.quantity) })
        .returning();

      savedLineItems.push({
        ...lineItem,
        itemName: item.name,
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
    req.log.error({ err }, "Failed to parse PDF receipt");
    res.status(500).json({ error: "Failed to process PDF receipt" });
  }
});

export default router;

