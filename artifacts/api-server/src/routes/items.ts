import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { itemsTable, lineItemsTable, receiptsTable } from "@workspace/db";
import { CreateItemBody, MergeItemBody } from "@workspace/api-zod";
import { isValidCategory } from "../lib/categories";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const items = await db
    .select()
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId))
    .orderBy(itemsTable.name);
  res.json(items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })));
});

router.post("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(itemsTable).values({ ...parsed.data, userId }).returning();
  res.status(201).json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.get("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const [item] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.patch("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Manual field handling (the generated UpdateItemBody zod predates the
  // category/brand/size fields). Each field is optional; absent = unchanged.
  const updates: Partial<typeof itemsTable.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.icon === "string") updates.icon = body.icon.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (typeof body.brand === "string") updates.brand = body.brand.trim() || null;
  if (typeof body.size === "string") updates.size = body.size.trim() || null;
  if (typeof body.category === "string") {
    if (!isValidCategory(body.category)) {
      res.status(400).json({ error: "Invalid category." });
      return;
    }
    updates.category = body.category;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update." });
    return;
  }

  const [item] = await db
    .update(itemsTable)
    .set(updates)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.delete("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  await db
    .delete(itemsTable)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));
  res.status(204).send();
});

router.post("/:id/ran-out", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const ranOutAt = new Date();
  const [item] = await db
    .update(itemsTable)
    .set({ ranOutAt })
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const [lastRow] = await db
    .select({ purchasedAt: receiptsTable.purchasedAt })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .where(eq(lineItemsTable.itemId, id))
    .orderBy(sql`${receiptsTable.purchasedAt} DESC`)
    .limit(1);
  const daysSinceLastPurchase = lastRow
    ? Math.floor((Date.now() - lastRow.purchasedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  res.json({ ranOutAt: ranOutAt.toISOString(), daysSinceLastPurchase });
});

// Merge this item into another of the user's items: reassign all of this
// item's line items (purchase history) to the target, add up purchase counts,
// then delete this item. Both items must belong to the requesting user.
router.post("/:id/merge", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const parsed = MergeItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const targetId = parsed.data.targetId;
  if (targetId === id) {
    res.status(400).json({ error: "Cannot merge an item into itself" });
    return;
  }

  const [source] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));
  const [target] = await db
    .select()
    .from(itemsTable)
    .where(and(eq(itemsTable.id, targetId), eq(itemsTable.userId, userId)));
  if (!source || !target) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  // Reassign history, combine counts, and delete the source atomically so a
  // mid-merge failure can't leave the data in a partial state.
  const merged = await db.transaction(async (tx) => {
    // Reassign the source's purchase history to the target.
    await tx
      .update(lineItemsTable)
      .set({ itemId: targetId })
      .where(eq(lineItemsTable.itemId, id));

    // Combine purchase counts and keep the target on the list.
    const [updated] = await tx
      .update(itemsTable)
      .set({
        purchaseCount: target.purchaseCount + source.purchaseCount,
        dismissedAt: null,
        ranOutAt: target.ranOutAt ?? source.ranOutAt,
      })
      .where(and(eq(itemsTable.id, targetId), eq(itemsTable.userId, userId)))
      .returning();

    await tx.delete(itemsTable).where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)));

    return updated;
  });

  res.json({ ...merged, createdAt: merged.createdAt.toISOString() });
});

router.post("/:id/dismiss", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const dismissedAt = new Date();
  const [item] = await db
    .update(itemsTable)
    .set({ dismissedAt })
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ dismissedAt: dismissedAt.toISOString() });
});

// Restore an item to the active shopping list: clears both the "ran out" and
// "dismissed" markers. Powers Undo (after ran-out/dismiss) and a second tap on
// an already-marked "Ran Out" button ("I've restocked — put it back").
router.post("/:id/restore", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const [item] = await db
    .update(itemsTable)
    .set({ ranOutAt: null, dismissedAt: null })
    .where(and(eq(itemsTable.id, id), eq(itemsTable.userId, userId)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ restored: true });
});

export default router;
