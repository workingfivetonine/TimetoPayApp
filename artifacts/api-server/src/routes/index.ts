import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storesRouter from "./stores";
import itemsRouter from "./items";
import receiptsRouter from "./receipts";
import lineItemsRouter from "./lineItems";
import analyticsRouter from "./analytics";
import shoppingListRouter from "./shoppingList";
import adminRouter from "./admin";
import adminCatalogRouter from "./adminCatalog";
import meRouter from "./me";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);

// Everything below requires an authenticated user
router.use(requireAuth);
router.use("/me", meRouter);
router.use("/stores", storesRouter);
router.use("/items", itemsRouter);
router.use("/receipts", receiptsRouter);
router.use("/line-items", lineItemsRouter);
router.use("/analytics", analyticsRouter);
router.use("/shopping-list", shoppingListRouter);
router.use("/admin/catalog", adminCatalogRouter);
router.use("/admin", adminRouter);

export default router;
