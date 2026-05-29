import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { lineItemsTable, itemsTable } from "@workspace/db";
import { UpdateLineItemBody } from "@workspace/api-zod";

const router = Router();

router.patch("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const parsed = UpdateLineItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
    price: Number(lineItem.price),
    quantity: Number(lineItem.quantity),
    createdAt: lineItem.createdAt.toISOString(),
  });
});

router.delete("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(lineItemsTable).where(eq(lineItemsTable.id, id));
  res.status(204).send();
});

export default router;
