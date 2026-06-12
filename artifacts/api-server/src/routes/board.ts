import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { boardPostsTable, receiptsTable, usersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { computeEntitlement } from "../lib/billing/entitlement";

const router = Router();

const MIN_ACCOUNT_DAYS = 14;
const MIN_UPLOADS = 2;
const MAX_CONTENT_LENGTH = 500;

interface EligibilityResult {
  eligible: boolean;
  missingRequirements: string[];
}

async function checkBoardEligibility(userId: string, isAdmin: boolean): Promise<EligibilityResult> {
  if (isAdmin) return { eligible: true, missingRequirements: [] };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return { eligible: false, missingRequirements: ["not_found"] };

  const missing: string[] = [];

  const entitlement = computeEntitlement(user);
  if (!entitlement.entitled) missing.push("subscription");

  const daysSinceCreation =
    (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation < MIN_ACCOUNT_DAYS) missing.push("account_age");

  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(receiptsTable)
    .where(eq(receiptsTable.userId, userId));
  if ((countRow?.count ?? 0) < MIN_UPLOADS) missing.push("upload_count");

  return { eligible: missing.length === 0, missingRequirements: missing };
}

// GET /board — approved posts + caller's eligibility status
router.get("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { eligible, missingRequirements } = await checkBoardEligibility(userId, !!req.isAdmin);

  if (!eligible) {
    res.json({ eligible: false, missingRequirements, posts: [] });
    return;
  }

  const posts = await db
    .select({
      id: boardPostsTable.id,
      content: boardPostsTable.content,
      createdAt: boardPostsTable.createdAt,
    })
    .from(boardPostsTable)
    .where(eq(boardPostsTable.status, "approved"))
    .orderBy(desc(boardPostsTable.approvedAt));

  res.json({ eligible: true, missingRequirements: [], posts });
});

// POST /board — submit a post for admin approval (anonymous — no author exposed)
router.post("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { eligible, missingRequirements } = await checkBoardEligibility(userId, !!req.isAdmin);

  if (!eligible) {
    res.status(403).json({ error: "board_ineligible", missingRequirements });
    return;
  }

  const { content } = req.body as { content?: string };
  const trimmed = content?.trim() ?? "";
  if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `Content must be 1–${MAX_CONTENT_LENGTH} characters` });
    return;
  }

  const [post] = await db
    .insert(boardPostsTable)
    .values({ userId, content: trimmed, status: "pending" })
    .returning({ id: boardPostsTable.id });

  res.status(201).json({ id: post!.id, status: "pending" });
});

// GET /board/admin/pending — admin moderation queue
router.get("/admin/pending", requireAdmin, async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(boardPostsTable)
    .where(eq(boardPostsTable.status, "pending"))
    .orderBy(boardPostsTable.createdAt);

  res.json(posts);
});

// POST /board/admin/:id/approve
router.post("/admin/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(boardPostsTable)
    .set({ status: "approved", approvedAt: new Date(), approvedBy: req.userId! })
    .where(and(eq(boardPostsTable.id, id), eq(boardPostsTable.status, "pending")));

  res.json({ success: true });
});

// POST /board/admin/:id/reject
router.post("/admin/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(boardPostsTable)
    .set({ status: "rejected", approvedBy: req.userId! })
    .where(and(eq(boardPostsTable.id, id), eq(boardPostsTable.status, "pending")));

  res.json({ success: true });
});

export default router;
