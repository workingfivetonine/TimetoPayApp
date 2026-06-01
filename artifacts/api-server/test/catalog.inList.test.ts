import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import {
  buildTestApp,
  resetDb,
  createUser,
  createStore,
  createItem,
  recordPurchase,
} from "./helpers";

const app = buildTestApp();

// Seed a catalog "Milk" entry backed by three OTHER mature contributors so it is
// always visible in the requester's browse view. The requester's own membership
// (inList) is what we then vary. Returns the requester id.
async function seedVisibleMilk(): Promise<string> {
  const requester = await createUser();
  for (let i = 0; i < 3; i++) {
    const u = await createUser();
    const store = await createStore(u, "Costco");
    const item = await createItem(u, "Milk");
    await recordPurchase(u, store, item, { price: "3.49" });
  }
  return requester;
}

function browseInList(
  body: { categories: { items: { name: string; inList: boolean }[] }[] },
): boolean {
  for (const cat of body.categories) {
    const hit = cat.items.find((i) => i.name.toLowerCase() === "milk");
    if (hit) return hit.inList;
  }
  return false;
}

async function shoppingListHas(
  userId: string,
  itemId: number,
): Promise<boolean> {
  const res = await request(app)
    .get("/shopping-list")
    .set("x-test-user-id", userId);
  expect(res.status).toBe(200);
  const ids = [...res.body.recurring, ...res.body.oneOff].map(
    (r: { itemId: number }) => r.itemId,
  );
  return ids.includes(itemId);
}

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date(Date.now() - 10 * DAY);
const t1 = new Date(Date.now() - 8 * DAY);
const t2 = new Date(Date.now() - 6 * DAY);

describe("catalog browse inList matches shopping-list inclusion", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("history, not dismissed -> in both", async () => {
    const requester = await seedVisibleMilk();
    const store = await createStore(requester, "Costco");
    const item = await createItem(requester, "Milk", { purchaseCount: 1 });
    await recordPurchase(requester, store, item, { purchasedAt: t1 });

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(browseInList(res.body)).toBe(true);
    expect(await shoppingListHas(requester, item)).toBe(true);
  });

  it("dismissed after last event -> in neither", async () => {
    const requester = await seedVisibleMilk();
    const store = await createStore(requester, "Costco");
    const item = await createItem(requester, "Milk", {
      purchaseCount: 1,
      dismissedAt: t2,
    });
    await recordPurchase(requester, store, item, { purchasedAt: t1 });

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(browseInList(res.body)).toBe(false);
    expect(await shoppingListHas(requester, item)).toBe(false);
  });

  it("ran-out after dismissal -> back in both", async () => {
    const requester = await seedVisibleMilk();
    const store = await createStore(requester, "Costco");
    const item = await createItem(requester, "Milk", {
      purchaseCount: 1,
      dismissedAt: t1,
      ranOutAt: t2,
    });
    await recordPurchase(requester, store, item, { purchasedAt: t0 });

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(browseInList(res.body)).toBe(true);
    expect(await shoppingListHas(requester, item)).toBe(true);
  });

  it("re-added after dismissal -> back in both", async () => {
    const requester = await seedVisibleMilk();
    const store = await createStore(requester, "Costco");
    const item = await createItem(requester, "Milk", {
      purchaseCount: 1,
      dismissedAt: t1,
      addedToListAt: t2,
    });
    await recordPurchase(requester, store, item, { purchasedAt: t0 });

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(browseInList(res.body)).toBe(true);
    expect(await shoppingListHas(requester, item)).toBe(true);
  });

  it("added to list, no history -> in both", async () => {
    const requester = await seedVisibleMilk();
    const item = await createItem(requester, "Milk", {
      addedToListAt: t1,
    });

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(browseInList(res.body)).toBe(true);
    expect(await shoppingListHas(requester, item)).toBe(true);
  });

  it("stays in lockstep across a live dismiss / re-add cycle", async () => {
    const requester = await seedVisibleMilk();
    const store = await createStore(requester, "Costco");
    const item = await createItem(requester, "Milk", { purchaseCount: 1 });
    await recordPurchase(requester, store, item, { purchasedAt: t0 });

    const browseFlag = async () => {
      const res = await request(app)
        .get("/catalog/browse")
        .set("x-test-user-id", requester);
      return browseInList(res.body);
    };

    // Initially present.
    expect(await browseFlag()).toBe(true);
    expect(await shoppingListHas(requester, item)).toBe(true);

    // Dismiss via the real endpoint.
    await request(app)
      .post(`/items/${item}/dismiss`)
      .set("x-test-user-id", requester)
      .expect(200);
    expect(await browseFlag()).toBe(false);
    expect(await shoppingListHas(requester, item)).toBe(false);

    // Re-add via the catalog add-to-list endpoint, which clears dismissal.
    await request(app)
      .post("/catalog/add-to-list")
      .set("x-test-user-id", requester)
      .send({ catalogItemId: await catalogIdForMilk(requester) })
      .expect(200);
    expect(await browseFlag()).toBe(true);
    expect(await shoppingListHas(requester, item)).toBe(true);
  });
});

// Resolve the catalog item id for "Milk" as the requester sees it in browse.
async function catalogIdForMilk(userId: string): Promise<number> {
  const res = await request(app)
    .get("/catalog/browse")
    .set("x-test-user-id", userId);
  for (const cat of res.body.categories) {
    const hit = cat.items.find(
      (i: { name: string }) => i.name.toLowerCase() === "milk",
    );
    if (hit) return hit.catalogItemId;
  }
  throw new Error("Milk not found in catalog browse");
}
