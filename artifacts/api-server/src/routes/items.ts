import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { itemsTable, lineItemsTable, receiptsTable } from "@workspace/db";
import { CreateItemBody, UpdateItemBody, MergeItemBody } from "@workspace/api-zod";

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
  const parsed = UpdateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db
    .update(itemsTable)
    .set(parsed.data)
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

export default router;
