import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storesRouter from "./stores";
import itemsRouter from "./items";
import receiptsRouter from "./receipts";
import lineItemsRouter from "./lineItems";
import analyticsRouter from "./analytics";
import shoppingListRouter from "./shoppingList";
import catalogRouter from "./catalog";
import adminRouter from "./admin";
import adminCatalogRouter from "./adminCatalog";
import meRouter from "./me";
import donateRouter from "./donate";
import boardRouter from "./board";
import supportRouter from "./support";
import emailPrefsRouter from "./emailPrefs";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
// Email unsubscribe links are clicked straight from the inbox (no session); the
// HMAC token in the URL is the authorization, so this is mounted public.
router.use("/email", emailPrefsRouter);

// Everything below requires an authenticated user
router.use(requireAuth);

router.use("/me", meRouter);
// Voluntary one-off donations. The app is free, so nothing here gates anything —
// see routes/donate.ts.
router.use("/donate", donateRouter);

// Every data route below is available to any signed-in user. There is no premium
// tier: the paywall, entitlement checks and per-route `requirePremium` guards
// were removed when the app became free.
router.use("/stores", storesRouter);
router.use("/items", itemsRouter);
router.use("/receipts", receiptsRouter);
router.use("/line-items", lineItemsRouter);
router.use("/analytics", analyticsRouter);
router.use("/shopping-list", shoppingListRouter);
router.use("/catalog", catalogRouter);
router.use("/board", boardRouter);
router.use("/support", supportRouter);
router.use("/admin/catalog", adminCatalogRouter);
router.use("/admin", adminRouter);

export default router;
