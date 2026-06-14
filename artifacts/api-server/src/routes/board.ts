import { Router } from "express";
import { eq, and, desc, sql, gt, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  boardPostsTable,
  boardRepliesTable,
  boardAgreesTable,
  receiptsTable,
  usersTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { computeEntitlement } from "../lib/billing/entitlement";

const router = Router();

const MIN_ACCOUNT_DAYS = 14;
const MIN_UPLOADS = 2;
const MAX_CONTENT_LENGTH = 500;

const VALID_TAGS = new Set(["recipe", "advice", "cool_idea", "other"]);

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  NZ: "New Zealand", IE: "Ireland", IL: "Israel", ZA: "South Africa",
  DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands",
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", CH: "Switzerland",
  AT: "Austria", BE: "Belgium", PL: "Poland", PT: "Portugal", MX: "Mexico",
  BR: "Brazil", AR: "Argentina", IN: "India", SG: "Singapore", JP: "Japan",
  KR: "South Korea", CN: "China", HK: "Hong Kong", MY: "Malaysia",
  PH: "Philippines", TH: "Thailand", AE: "United Arab Emirates",
};

function buildRegion(countryCode: string | null, stateCode: string | null): string | null {
  if (!countryCode) return null;
  const name = COUNTRY_NAMES[countryCode] ?? countryCode;
  if (countryCode === "US" && stateCode) return `${name} · ${stateCode}`;
  return name;
}

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

// GET /board — approved posts with agree/reply counts, caller eligibility, and unread count
router.get("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { eligible, missingRequirements } = await checkBoardEligibility(userId, !!req.isAdmin);

  if (!eligible) {
    res.json({ eligible: false, missingRequirements, posts: [], newCount: 0 });
    return;
  }

  // Read current lastSeen before we update it, so newCount reflects what was new THIS visit
  const [userRow] = await db
    .select({ boardLastSeenAt: usersTable.boardLastSeenAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const prevLastSeen = userRow?.boardLastSeenAt ?? null;

  // Update boardLastSeenAt to now (fire-and-forget; don't block the response)
  db.update(usersTable)
    .set({ boardLastSeenAt: new Date() })
    .where(eq(usersTable.id, userId))
    .catch(() => {/* non-fatal */});

  const posts = await db
    .select({
      id: boardPostsTable.id,
      content: boardPostsTable.content,
      tag: boardPostsTable.tag,
      region: boardPostsTable.region,
      agreeCount: boardPostsTable.agreeCount,
      replyCount: boardPostsTable.replyCount,
      createdAt: boardPostsTable.createdAt,
      approvedAt: boardPostsTable.approvedAt,
    })
    .from(boardPostsTable)
    .where(eq(boardPostsTable.status, "approved"))
    .orderBy(desc(boardPostsTable.approvedAt));

  // Which posts has this user agreed with?
  const postIds = posts.map((p) => p.id);
  const agreedSet = new Set<number>();
  if (postIds.length > 0) {
    const agreed = await db
      .select({ postId: boardAgreesTable.postId })
      .from(boardAgreesTable)
      .where(and(eq(boardAgreesTable.userId, userId), inArray(boardAgreesTable.postId, postIds)));
    for (const r of agreed) agreedSet.add(r.postId);
  }

  // Count new items since user's previous visit
  let newCount = 0;
  if (prevLastSeen) {
    newCount = posts.filter(
      (p) => p.approvedAt && p.approvedAt > prevLastSeen,
    ).length;
  }

  res.json({
    eligible: true,
    missingRequirements: [],
    newCount,
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      tag: p.tag,
      region: p.region,
      agreeCount: p.agreeCount,
      replyCount: p.replyCount,
      userAgreed: agreedSet.has(p.id),
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

// POST /board — submit a post for approval
router.post("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { eligible, missingRequirements } = await checkBoardEligibility(userId, !!req.isAdmin);

  if (!eligible) {
    res.status(403).json({ error: "board_ineligible", missingRequirements });
    return;
  }

  const { content, tag } = req.body as { content?: string; tag?: string };
  const trimmed = content?.trim() ?? "";
  if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `Content must be 1–${MAX_CONTENT_LENGTH} characters` });
    return;
  }

  const resolvedTag = tag && VALID_TAGS.has(tag) ? tag : null;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const region = buildRegion(user?.countryCode ?? null, user?.stateCode ?? null);

  const [post] = await db
    .insert(boardPostsTable)
    .values({ userId, content: trimmed, tag: resolvedTag, region, status: "pending" })
    .returning({ id: boardPostsTable.id });

  res.status(201).json({ id: post!.id, status: "pending" });
});

// POST /board/:id/agree — toggle agree on a post
router.post("/:id/agree", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const postId = parseInt(req.params.id as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Only allow agreeing on approved posts
  const [post] = await db
    .select({ id: boardPostsTable.id })
    .from(boardPostsTable)
    .where(and(eq(boardPostsTable.id, postId), eq(boardPostsTable.status, "approved")));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  // Check if already agreed
  const [existing] = await db
    .select({ id: boardAgreesTable.id })
    .from(boardAgreesTable)
    .where(and(eq(boardAgreesTable.postId, postId), eq(boardAgreesTable.userId, userId)));

  let agreed: boolean;
  if (existing) {
    await db
      .delete(boardAgreesTable)
      .where(and(eq(boardAgreesTable.postId, postId), eq(boardAgreesTable.userId, userId)));
    await db
      .update(boardPostsTable)
      .set({ agreeCount: sql`greatest(0, agree_count - 1)` })
      .where(eq(boardPostsTable.id, postId));
    agreed = false;
  } else {
    await db.insert(boardAgreesTable).values({ postId, userId });
    await db
      .update(boardPostsTable)
      .set({ agreeCount: sql`agree_count + 1` })
      .where(eq(boardPostsTable.id, postId));
    agreed = true;
  }

  const [updated] = await db
    .select({ agreeCount: boardPostsTable.agreeCount })
    .from(boardPostsTable)
    .where(eq(boardPostsTable.id, postId));

  res.json({ agreed, agreeCount: updated?.agreeCount ?? 0 });
});

// GET /board/:id/replies — approved replies for a post
router.get("/:id/replies", async (req, res): Promise<void> => {
  const postId = parseInt(req.params.id as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const replies = await db
    .select({
      id: boardRepliesTable.id,
      content: boardRepliesTable.content,
      region: boardRepliesTable.region,
      createdAt: boardRepliesTable.createdAt,
    })
    .from(boardRepliesTable)
    .where(and(eq(boardRepliesTable.postId, postId), eq(boardRepliesTable.status, "approved")))
    .orderBy(boardRepliesTable.createdAt);

  res.json(replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// POST /board/:id/replies — submit a reply
router.post("/:id/replies", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const postId = parseInt(req.params.id as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { eligible } = await checkBoardEligibility(userId, !!req.isAdmin);
  if (!eligible) { res.status(403).json({ error: "board_ineligible" }); return; }

  const [post] = await db
    .select({ id: boardPostsTable.id })
    .from(boardPostsTable)
    .where(and(eq(boardPostsTable.id, postId), eq(boardPostsTable.status, "approved")));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const { content } = req.body as { content?: string };
  const trimmed = content?.trim() ?? "";
  if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `Content must be 1–${MAX_CONTENT_LENGTH} characters` });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const region = buildRegion(user?.countryCode ?? null, user?.stateCode ?? null);

  const [reply] = await db
    .insert(boardRepliesTable)
    .values({ postId, userId, content: trimmed, region, status: "pending" })
    .returning({ id: boardRepliesTable.id });

  res.status(201).json({ id: reply!.id, status: "pending" });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

// GET /board/admin/pending — posts AND replies pending moderation
router.get("/admin/pending", requireAdmin, async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(boardPostsTable)
    .where(eq(boardPostsTable.status, "pending"))
    .orderBy(boardPostsTable.createdAt);

  const replies = await db
    .select()
    .from(boardRepliesTable)
    .where(eq(boardRepliesTable.status, "pending"))
    .orderBy(boardRepliesTable.createdAt);

  res.json({
    posts: posts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), type: "post" })),
    replies: replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), type: "reply" })),
  });
});

router.post("/admin/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(boardPostsTable)
    .set({ status: "approved", approvedAt: new Date(), approvedBy: req.userId! })
    .where(and(eq(boardPostsTable.id, id), eq(boardPostsTable.status, "pending")));

  res.json({ success: true });
});

router.post("/admin/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(boardPostsTable)
    .set({ status: "rejected", approvedBy: req.userId! })
    .where(and(eq(boardPostsTable.id, id), eq(boardPostsTable.status, "pending")));

  res.json({ success: true });
});

router.post("/admin/reply/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [reply] = await db
    .update(boardRepliesTable)
    .set({ status: "approved", approvedAt: new Date(), approvedBy: req.userId! })
    .where(and(eq(boardRepliesTable.id, id), eq(boardRepliesTable.status, "pending")))
    .returning({ postId: boardRepliesTable.postId });

  if (reply) {
    await db
      .update(boardPostsTable)
      .set({ replyCount: sql`reply_count + 1` })
      .where(eq(boardPostsTable.id, reply.postId));
  }

  res.json({ success: true });
});

router.post("/admin/reply/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(boardRepliesTable)
    .set({ status: "rejected", approvedBy: req.userId! })
    .where(and(eq(boardRepliesTable.id, id), eq(boardRepliesTable.status, "pending")));

  res.json({ success: true });
});

export default router;
