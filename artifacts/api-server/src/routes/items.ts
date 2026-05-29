import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { itemsTable } from "@workspace/db";
import { CreateItemBody, UpdateItemBody } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  const items = await db.select().from(itemsTable).orderBy(itemsTable.name);
  res.json(items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })));
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db.insert(itemsTable).values(parsed.data).returning();
  res.status(201).json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.get("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.patch("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const parsed = UpdateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await db
    .update(itemsTable)
    .set(parsed.data)
    .where(eq(itemsTable.id, id))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ ...item, createdAt: item.createdAt.toISOString() });
});

router.delete("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db.delete(itemsTable).where(eq(itemsTable.id, id));
  res.status(204).send();
});

export default router;
