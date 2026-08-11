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

function findBrowseItem(
  body: { categories: { items: { name: string }[] }[] },
  name: string,
): Record<string, unknown> | undefined {
  for (const cat of body.categories) {
    const hit = cat.items.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit as Record<string, unknown>;
  }
  return undefined;
}

// A line item can legitimately carry no price: "Log Items" saves a blank price
// as 0.00, and receipt parsing can come back without one. Those rows are real
// purchases but not prices, and the catalog exists only to report what others
// paid. See artifacts/api-server/src/lib/prices.ts.
describe("catalog prices exclude unpriced purchases", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("does not report a 0.00 line item as a $0 catalog price", async () => {
    const requester = await createUser();
    const other = await createUser();
    const store = await createStore(other, "Costco");
    const item = await createItem(other, "Bananas");
    await recordPurchase(other, store, item, { price: "0.00" });

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(res.status).toBe(200);

    // The only contribution was unpriced, so there is nothing to report. The
    // item must not appear claiming a price of zero.
    const bananas = findBrowseItem(res.body, "Bananas");
    expect(bananas?.bestPrice).not.toBe(0);
  });

  it("keeps a real price when a newer unpriced purchase exists", async () => {
    // The regression this guards: rows are aggregated most-recent-first and the
    // first row per store wins, so a later unpriced scan used to overwrite an
    // existing real price with 0.00 for everyone in the region.
    const requester = await createUser();
    const other = await createUser();
    const store = await createStore(other, "Costco");
    const item = await createItem(other, "Milk");

    await recordPurchase(other, store, item, {
      price: "3.49",
      purchasedAt: new Date("2026-01-10T00:00:00Z"),
    });
    await recordPurchase(other, store, item, {
      price: "0.00",
      purchasedAt: new Date("2026-06-10T00:00:00Z"),
    });

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(res.status).toBe(200);

    const milk = findBrowseItem(res.body, "Milk");
    expect(milk).toBeDefined();
    expect(milk!.bestPrice).toBe(3.49);
  });
});
