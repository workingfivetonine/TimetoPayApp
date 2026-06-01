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
import billingRouter from "./billing";
import { paypalWebhookHandler } from "./paypalWebhook";
import { requireAuth } from "../middlewares/auth";
import { requireEntitlement } from "../middlewares/requireEntitlement";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
// PayPal webhook is public (signature-verified inside the handler) and uses the
// parsed JSON body, so it's mounted here before requireAuth.
router.post("/webhooks/paypal", paypalWebhookHandler);

// Everything below requires an authenticated user
router.use(requireAuth);

// Ungated authed routes: /me (so the client can read entitlement to render the
// paywall) and /billing (so a locked-out user can still subscribe or redeem).
router.use("/me", meRouter);
router.use("/billing", billingRouter);

// Entitlement gate: web clients without an active trial/subscription get 402.
// Native clients and admins pass through (see requireEntitlement).
router.use(requireEntitlement);
router.use("/stores", storesRouter);
router.use("/items", itemsRouter);
router.use("/receipts", receiptsRouter);
router.use("/line-items", lineItemsRouter);
router.use("/analytics", analyticsRouter);
router.use("/shopping-list", shoppingListRouter);
router.use("/catalog", catalogRouter);
router.use("/admin/catalog", adminCatalogRouter);
router.use("/admin", adminRouter);

export default router;
