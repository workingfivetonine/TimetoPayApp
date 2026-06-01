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

// Recursively collect every object key that appears anywhere in a payload.
function collectKeys(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, into);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      collectKeys(v, into);
    }
  }
}

function findBrowseItem(
  body: { categories: { items: { name: string }[] }[] },
  name: string,
): Record<string, unknown> | undefined {
  for (const cat of body.categories) {
    const hit = cat.items.find(
      (i) => i.name.toLowerCase() === name.toLowerCase(),
    );
    if (hit) return hit as Record<string, unknown>;
  }
  return undefined;
}

describe("GET /catalog/browse privacy", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("never exposes buyer identity but still returns user-scoped fields", async () => {
    // Requester plus three OTHER mature users, all in the same region, all
    // buying "Milk" at a store that normalizes to the same catalog store, so the
    // item clears the k-anonymity threshold (>=3 distinct other contributors).
    const requester = await createUser();
    const others: string[] = [];
    for (let i = 0; i < 3; i++) {
      const u = await createUser();
      others.push(u);
      const store = await createStore(u, "Costco");
      const item = await createItem(u, "Milk");
      await recordPurchase(u, store, item, { price: "3.49" });
    }

    // Requester owns "Milk" too, with their own purchase history, so the browse
    // payload must report inHistory / inList / userItemId for them.
    const reqStore = await createStore(requester, "Costco");
    const reqItem = await createItem(requester, "Milk", {
      addedToListAt: new Date(),
    });
    await recordPurchase(requester, reqStore, reqItem, { price: "4.00" });

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(res.status).toBe(200);

    const milk = findBrowseItem(res.body, "Milk");
    expect(milk).toBeDefined();

    // User-scoped fields are present and correct for the requester.
    expect(milk!.inList).toBe(true);
    expect(milk!.inHistory).toBe(true);
    expect(milk!.userItemId).toBe(reqItem);
    // Aggregated price comes only from OTHER users (requester excluded).
    expect(milk!.bestStoreName).toBe("Costco");
    expect(milk!.bestPrice).toBe(3.49);
    // Date is coarsened to YYYY-MM, never an exact timestamp.
    expect(milk!.bestDate).toMatch(/^\d{4}-\d{2}$/);

    // No buyer-identity key anywhere in the payload.
    const keys = new Set<string>();
    collectKeys(res.body, keys);
    for (const forbidden of [
      "userId",
      "user_id",
      "buyerId",
      "ownerId",
      "contributorId",
      "email",
      "users",
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }

    // None of the OTHER users' ids leak into the payload as a value.
    const json = JSON.stringify(res.body);
    for (const other of others) {
      expect(json.includes(other)).toBe(false);
    }
    // ...and the requester's own auth id is never echoed either (only their
    // numeric item id is, via userItemId).
    expect(json.includes(requester)).toBe(false);
  });

  it("suppresses items below the contributor threshold (no existence leak)", async () => {
    // Only two OTHER users buy "Eggs" -> below the threshold of 3 -> the item
    // must not appear at all (not even as a name with null price).
    const requester = await createUser();
    for (let i = 0; i < 2; i++) {
      const u = await createUser();
      const store = await createStore(u, "Costco");
      const item = await createItem(u, "Eggs");
      await recordPurchase(u, store, item, { price: "2.99" });
    }

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(res.status).toBe(200);
    expect(findBrowseItem(res.body, "Eggs")).toBeUndefined();
  });

  it("does not count immature (freshly-created) accounts toward the threshold", async () => {
    // Three other contributors, but one account is brand new -> only two mature
    // contributors -> still suppressed. Guards the Sybil/sockpuppet defense.
    const requester = await createUser();
    const ages = [365, 365, 0]; // last one is too new to count
    for (const ageDays of ages) {
      const u = await createUser({ ageDays });
      const store = await createStore(u, "Costco");
      const item = await createItem(u, "Bread");
      await recordPurchase(u, store, item, { price: "1.50" });
    }

    const res = await request(app)
      .get("/catalog/browse")
      .set("x-test-user-id", requester);
    expect(res.status).toBe(200);
    expect(findBrowseItem(res.body, "Bread")).toBeUndefined();
  });
});
