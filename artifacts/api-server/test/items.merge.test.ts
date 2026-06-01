import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, itemsTable, lineItemsTable } from "@workspace/db";
import {
  buildTestApp,
  resetDb,
  createUser,
  createStore,
  createItem,
  recordPurchase,
} from "./helpers";

const app = buildTestApp();

async function lineItemCount(itemId: number): Promise<number> {
  const rows = await db
    .select({ id: lineItemsTable.id })
    .from(lineItemsTable)
    .where(eq(lineItemsTable.itemId, itemId));
  return rows.length;
}

describe("POST /items/:id/merge", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("reassigns history, sums counts, and deletes the source", async () => {
    const userId = await createUser();
    const store = await createStore(userId, "Costco");

    const source = await createItem(userId, "Milk 2%", { purchaseCount: 2 });
    const target = await createItem(userId, "Milk", { purchaseCount: 1 });

    // Source has two purchases, target has one.
    await recordPurchase(userId, store, source, { price: "3.00" });
    await recordPurchase(userId, store, source, { price: "3.20" });
    await recordPurchase(userId, store, target, { price: "3.10" });

    expect(await lineItemCount(source)).toBe(2);
    expect(await lineItemCount(target)).toBe(1);

    const res = await request(app)
      .post(`/items/${source}/merge`)
      .set("x-test-user-id", userId)
      .send({ targetId: target });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(target);
    // Counts summed.
    expect(res.body.purchaseCount).toBe(3);

    // All history reassigned to the target, none orphaned on the source.
    expect(await lineItemCount(target)).toBe(3);
    expect(await lineItemCount(source)).toBe(0);

    // Source row deleted.
    const [sourceRow] = await db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, source));
    expect(sourceRow).toBeUndefined();

    // Target persists with the summed count.
    const [targetRow] = await db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, target));
    expect(targetRow.purchaseCount).toBe(3);
  });

  it("clears dismissal on the target so the merged item stays on the list", async () => {
    const userId = await createUser();
    const store = await createStore(userId, "Costco");
    const source = await createItem(userId, "Milk 2%", { purchaseCount: 1 });
    const target = await createItem(userId, "Milk", {
      purchaseCount: 1,
      dismissedAt: new Date(),
    });
    await recordPurchase(userId, store, source);

    const res = await request(app)
      .post(`/items/${source}/merge`)
      .set("x-test-user-id", userId)
      .send({ targetId: target });
    expect(res.status).toBe(200);

    const [targetRow] = await db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, target));
    expect(targetRow.dismissedAt).toBeNull();
  });

  it("rejects merging an item into itself", async () => {
    const userId = await createUser();
    const item = await createItem(userId, "Milk");
    const res = await request(app)
      .post(`/items/${item}/merge`)
      .set("x-test-user-id", userId)
      .send({ targetId: item });
    expect(res.status).toBe(400);
  });

  it("does not merge across users (404 when target is not owned)", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const source = await createItem(userA, "Milk 2%");
    const otherTarget = await createItem(userB, "Milk");

    const res = await request(app)
      .post(`/items/${source}/merge`)
      .set("x-test-user-id", userA)
      .send({ targetId: otherTarget });
    expect(res.status).toBe(404);

    // Nothing was touched.
    const [srcRow] = await db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, source));
    expect(srcRow).toBeDefined();
  });

  it("404s when the source item belongs to another user", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const aSource = await createItem(userA, "Milk 2%");
    const bTarget = await createItem(userB, "Milk");

    // userB tries to merge userA's item.
    const res = await request(app)
      .post(`/items/${aSource}/merge`)
      .set("x-test-user-id", userB)
      .send({ targetId: bTarget });
    expect(res.status).toBe(404);
  });
});
