import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { lineItemsTable, itemsTable, receiptsTable } from "@workspace/db";
import { UpdateLineItemBody } from "@workspace/api-zod";

const router = Router();

router.patch("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const parsed = UpdateLineItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Ownership: the line item's parent receipt must belong to the user.
  const [owned] = await db
    .select({ id: lineItemsTable.id })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .where(and(eq(lineItemsTable.id, id), eq(receiptsTable.userId, userId)));
  if (!owned) {
    res.status(404).json({ error: "Line item not found" });
    return;
  }
  const [lineItem] = await db
    .update(lineItemsTable)
    .set({
      ...(parsed.data.price !== undefined ? { price: String(parsed.data.price) } : {}),
      ...(parsed.data.quantity !== undefined ? { quantity: String(parsed.data.quantity) } : {}),
    })
    .where(eq(lineItemsTable.id, id))
    .returning();
  if (!lineItem) {
    res.status(404).json({ error: "Line item not found" });
    return;
  }
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, lineItem.itemId));
  res.json({
    ...lineItem,
    itemName: item?.name ?? "Unknown",
    icon: item?.icon ?? null,
    price: Number(lineItem.price),
    quantity: Number(lineItem.quantity),
    createdAt: lineItem.createdAt.toISOString(),
  });
});

router.delete("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id);
  const [owned] = await db
    .select({ id: lineItemsTable.id })
    .from(lineItemsTable)
    .innerJoin(receiptsTable, eq(lineItemsTable.receiptId, receiptsTable.id))
    .where(and(eq(lineItemsTable.id, id), eq(receiptsTable.userId, userId)));
  if (!owned) {
    res.status(204).send();
    return;
  }
  await db.delete(lineItemsTable).where(eq(lineItemsTable.id, id));
  res.status(204).send();
});

export default router;
