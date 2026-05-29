import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { storesTable } from "@workspace/db";
import {
  CreateStoreBody,
  UpdateStoreBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  const stores = await db.select().from(storesTable).orderBy(storesTable.name);
  res.json(
    stores.map((s) => ({
      ...s,
      deliveryFee: s.deliveryFee ? Number(s.deliveryFee) : null,
      minimumOrderAmount: s.minimumOrderAmount ? Number(s.minimumOrderAmount) : null,
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [store] = await db.insert(storesTable).values({
    ...parsed.data,
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
  const id = parseInt(req.params.id);
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, id));
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
  const id = parseInt(req.params.id);
  const parsed = UpdateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [store] = await db
    .update(storesTable)
    .set({
      ...parsed.data,
      deliveryFee: parsed.data.deliveryFee != null ? String(parsed.data.deliveryFee) : parsed.data.deliveryFee,
      minimumOrderAmount: parsed.data.minimumOrderAmount != null ? String(parsed.data.minimumOrderAmount) : parsed.data.minimumOrderAmount,
    })
    .where(eq(storesTable.id, id))
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
  const id = parseInt(req.params.id);
  await db.delete(storesTable).where(eq(storesTable.id, id));
  res.status(204).send();
});

export default router;
