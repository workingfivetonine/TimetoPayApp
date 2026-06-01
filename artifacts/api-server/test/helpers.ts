import express, { type Express, type RequestHandler } from "express";
import {
  db,
  usersTable,
  storesTable,
  itemsTable,
  receiptsTable,
  lineItemsTable,
  catalogStoresTable,
  catalogStoreAliasesTable,
  catalogItemsTable,
  catalogItemAliasesTable,
} from "@workspace/db";
import catalogRouter from "../src/routes/catalog";
import itemsRouter from "../src/routes/items";
import shoppingListRouter from "../src/routes/shoppingList";

// Builds a minimal Express app that mounts the data routers behind a stub auth
// middleware. The real app authenticates via Clerk; for these route-logic tests
// we inject the user id directly from a header so we never touch Clerk. The
// route handlers only depend on req.userId (and req.isAdmin, unused here).
export function buildTestApp(): Express {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  const injectUser: RequestHandler = (req, res, next) => {
    const userId = req.header("x-test-user-id");
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.userId = userId;
    req.isAdmin = false;
    next();
  };
  app.use(injectUser);

  app.use("/catalog", catalogRouter);
  app.use("/items", itemsRouter);
  app.use("/shopping-list", shoppingListRouter);

  return app;
}

// Wipe every table the tests touch so each case starts from a clean slate.
// Order respects FK dependencies (cascade also handles it, but be explicit).
export async function resetDb(): Promise<void> {
  await db.delete(lineItemsTable);
  await db.delete(receiptsTable);
  await db.delete(itemsTable);
  await db.delete(storesTable);
  await db.delete(catalogItemAliasesTable);
  await db.delete(catalogItemsTable);
  await db.delete(catalogStoreAliasesTable);
  await db.delete(catalogStoresTable);
  await db.delete(usersTable);
}

const DAY_MS = 24 * 60 * 60 * 1000;

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now()}_${seq}`;
}

// Create a user. By default the account is "mature" (old enough to count toward
// the catalog k-anonymity threshold). Pass ageDays to control tenure.
export async function createUser(opts?: {
  countryCode?: string | null;
  stateCode?: string | null;
  ageDays?: number;
  isAdmin?: boolean;
}): Promise<string> {
  const id = uid("user");
  const ageDays = opts?.ageDays ?? 365;
  const createdAt = new Date(Date.now() - ageDays * DAY_MS);
  await db.insert(usersTable).values({
    id,
    email: `${id}@example.com`,
    isAdmin: opts?.isAdmin ?? false,
    role: opts?.isAdmin ? "master_admin" : "general",
    countryCode: opts?.countryCode === undefined ? "US" : opts.countryCode,
    stateCode: opts?.stateCode === undefined ? "CA" : opts.stateCode,
    createdAt,
  });
  return id;
}

export async function createStore(
  userId: string,
  name: string,
  opts?: { countryCode?: string | null; stateCode?: string | null },
): Promise<number> {
  const [store] = await db
    .insert(storesTable)
    .values({
      userId,
      name,
      countryCode: opts?.countryCode === undefined ? "US" : opts.countryCode,
      stateCode: opts?.stateCode === undefined ? "CA" : opts.stateCode,
    })
    .returning();
  return store.id;
}

export async function createItem(
  userId: string,
  name: string,
  opts?: {
    purchaseCount?: number;
    addedToListAt?: Date | null;
    dismissedAt?: Date | null;
    ranOutAt?: Date | null;
    category?: string | null;
  },
): Promise<number> {
  const [item] = await db
    .insert(itemsTable)
    .values({
      userId,
      name,
      purchaseCount: opts?.purchaseCount ?? 0,
      addedToListAt: opts?.addedToListAt ?? null,
      dismissedAt: opts?.dismissedAt ?? null,
      ranOutAt: opts?.ranOutAt ?? null,
      category: opts?.category ?? null,
    })
    .returning();
  return item.id;
}

// Record a purchase: creates a receipt for the store and a line item linking it
// to the given item at the given price/date.
export async function recordPurchase(
  userId: string,
  storeId: number,
  itemId: number,
  opts?: { price?: string; purchasedAt?: Date },
): Promise<{ receiptId: number; lineItemId: number }> {
  const purchasedAt = opts?.purchasedAt ?? new Date();
  const price = opts?.price ?? "1.99";
  const [receipt] = await db
    .insert(receiptsTable)
    .values({ userId, storeId, purchasedAt, total: price })
    .returning();
  const [lineItem] = await db
    .insert(lineItemsTable)
    .values({ receiptId: receipt.id, itemId, price })
    .returning();
  return { receiptId: receipt.id, lineItemId: lineItem.id };
}
