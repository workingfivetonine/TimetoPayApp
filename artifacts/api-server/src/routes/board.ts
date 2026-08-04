import { Router } from "express";
import { eq, and, desc, sql, gt, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  boardPostsTable,
  boardRepliesTable,
  boardAgreesTable,
  boardThanksTable,
  receiptsTable,
  usersTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

const MIN_UPLOADS = 2;
const MAX_CONTENT_LENGTH = 500;

const VALID_TAGS = new Set(["recipe", "advice", "cool_idea", "hot_deal", "other"]);
const HOT_THRESHOLD = 5; // agrees in 24 h to be considered trending

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

  // Upload count is the only bar: contributing to the board means having
  // actually used the app, which is what this gate is for.
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
      userId: boardPostsTable.userId,
      content: boardPostsTable.content,
      tag: boardPostsTable.tag,
      region: boardPostsTable.region,
      agreeCount: boardPostsTable.agreeCount,
      thanksCount: boardPostsTable.thanksCount,
      replyCount: boardPostsTable.replyCount,
      createdAt: boardPostsTable.createdAt,
      approvedAt: boardPostsTable.approvedAt,
      authorUsername: usersTable.username,
      authorAvatar: usersTable.avatar,
    })
    .from(boardPostsTable)
    .leftJoin(usersTable, eq(usersTable.id, boardPostsTable.userId))
    .where(eq(boardPostsTable.status, "approved"))
    .orderBy(desc(boardPostsTable.approvedAt));

  const postIds = posts.map((p) => p.id);
  const agreedSet = new Set<number>();
  const thankedSet = new Set<number>();
  const hotSet = new Set<number>();

  if (postIds.length > 0) {
    // Which posts has this user agreed / thanked?
    const [agreed, thanked] = await Promise.all([
      db
        .select({ postId: boardAgreesTable.postId })
        .from(boardAgreesTable)
        .where(and(eq(boardAgreesTable.userId, userId), inArray(boardAgreesTable.postId, postIds))),
      db
        .select({ postId: boardThanksTable.postId })
        .from(boardThanksTable)
        .where(and(eq(boardThanksTable.userId, userId), inArray(boardThanksTable.postId, postIds))),
    ]);
    for (const r of agreed) agreedSet.add(r.postId);
    for (const r of thanked) thankedSet.add(r.postId);

    // Trending: posts that received HOT_THRESHOLD+ agrees in the last 24 h
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAgrees = await db
      .select({ postId: boardAgreesTable.postId, count: sql<number>`cast(count(*) as int)` })
      .from(boardAgreesTable)
      .where(and(inArray(boardAgreesTable.postId, postIds), gt(boardAgreesTable.createdAt, cutoff)))
      .groupBy(boardAgreesTable.postId);
    for (const r of recentAgrees) {
      if (r.count >= HOT_THRESHOLD) hotSet.add(r.postId);
    }
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
      thanksCount: p.thanksCount,
      replyCount: p.replyCount,
      userAgreed: agreedSet.has(p.id),
      userThanked: thankedSet.has(p.id),
      isOwn: p.userId === userId,
      isHot: hotSet.has(p.id),
      createdAt: p.createdAt.toISOString(),
      authorUsername: p.authorUsername ?? null,
      authorAvatar: p.authorAvatar ?? null,
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

  // Trusted posters (admin-flagged) and admins skip the moderation queue — their
  // posts go live immediately (status "approved", stamped as approved now).
  const autoApprove = !!req.isAdmin || !!user?.boardAutoApprove;
  const status = autoApprove ? "approved" : "pending";

  const [post] = await db
    .insert(boardPostsTable)
    .values({
      userId,
      content: trimmed,
      tag: resolvedTag,
      region,
      status,
      approvedAt: autoApprove ? new Date() : null,
      approvedBy: autoApprove ? userId : null,
    })
    .returning({ id: boardPostsTable.id });

  res.status(201).json({ id: post!.id, status });
});

// PATCH /board/:id — the post's author edits their own wording. Admins are not
// given edit rights on purpose: rewriting someone else's words under their name
// is a different power from removing a post, and moderation only needs removal.
//
// An edit by a user whose posts normally need approval sends the post back to the
// queue. Without that, "post something innocuous → get approved → rewrite it"
// would be a way straight past moderation.
router.patch("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const postId = parseInt(req.params.id as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { content, tag } = req.body as { content?: string; tag?: string };
  const trimmed = content?.trim() ?? "";
  if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `Content must be 1–${MAX_CONTENT_LENGTH} characters` });
    return;
  }

  const [post] = await db.select().from(boardPostsTable).where(eq(boardPostsTable.id, postId));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.userId !== userId) { res.status(403).json({ error: "Not your post" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const keepsApproval = !!req.isAdmin || !!user?.boardAutoApprove;
  const status = keepsApproval ? post.status : "pending";

  await db
    .update(boardPostsTable)
    .set({
      content: trimmed,
      // An explicit tag replaces the old one; omitting the field leaves it alone.
      ...(tag !== undefined ? { tag: tag && VALID_TAGS.has(tag) ? tag : null } : {}),
      status,
      ...(keepsApproval ? {} : { approvedAt: null, approvedBy: null }),
    })
    .where(eq(boardPostsTable.id, postId));

  res.json({ id: postId, status });
});

// DELETE /board/reply/:id — author removes their own reply, admin removes any.
// Declared before DELETE /:id so "reply" isn't swallowed as an id.
router.delete("/reply/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const replyId = parseInt(req.params.id as string);
  if (isNaN(replyId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [reply] = await db.select().from(boardRepliesTable).where(eq(boardRepliesTable.id, replyId));
  if (!reply) { res.status(404).json({ error: "Reply not found" }); return; }
  if (!req.isAdmin && reply.userId !== userId) {
    res.status(403).json({ error: "Not your reply" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(boardRepliesTable).where(eq(boardRepliesTable.id, replyId));
    // replyCount is a denormalised counter, so it has to be walked back by hand.
    // Only approved replies were ever counted (see the reply-approve path).
    if (reply.status === "approved") {
      await tx
        .update(boardPostsTable)
        .set({ replyCount: sql`GREATEST(${boardPostsTable.replyCount} - 1, 0)` })
        .where(eq(boardPostsTable.id, reply.postId));
    }
  });

  res.status(204).send();
});

// DELETE /board/:id — author removes their own post, admin removes any. Replies,
// agrees and thanks are cascade-deleted by their FKs.
router.delete("/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const postId = parseInt(req.params.id as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [post] = await db.select().from(boardPostsTable).where(eq(boardPostsTable.id, postId));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (!req.isAdmin && post.userId !== userId) {
    res.status(403).json({ error: "Not your post" });
    return;
  }

  await db.delete(boardPostsTable).where(eq(boardPostsTable.id, postId));
  res.status(204).send();
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

// POST /board/:id/thanks — toggle thanks on a post
router.post("/:id/thanks", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const postId = parseInt(req.params.id as string);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [post] = await db
    .select({ id: boardPostsTable.id })
    .from(boardPostsTable)
    .where(and(eq(boardPostsTable.id, postId), eq(boardPostsTable.status, "approved")));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const [existing] = await db
    .select({ id: boardThanksTable.id })
    .from(boardThanksTable)
    .where(and(eq(boardThanksTable.postId, postId), eq(boardThanksTable.userId, userId)));

  let thanked: boolean;
  if (existing) {
    await db
      .delete(boardThanksTable)
      .where(and(eq(boardThanksTable.postId, postId), eq(boardThanksTable.userId, userId)));
    await db
      .update(boardPostsTable)
      .set({ thanksCount: sql`greatest(0, thanks_count - 1)` })
      .where(eq(boardPostsTable.id, postId));
    thanked = false;
  } else {
    await db.insert(boardThanksTable).values({ postId, userId });
    await db
      .update(boardPostsTable)
      .set({ thanksCount: sql`thanks_count + 1` })
      .where(eq(boardPostsTable.id, postId));
    thanked = true;
  }

  const [updated] = await db
    .select({ thanksCount: boardPostsTable.thanksCount })
    .from(boardPostsTable)
    .where(eq(boardPostsTable.id, postId));

  res.json({ thanked, thanksCount: updated?.thanksCount ?? 0 });
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
      userId: boardRepliesTable.userId,
    })
    .from(boardRepliesTable)
    .where(and(eq(boardRepliesTable.postId, postId), eq(boardRepliesTable.status, "approved")))
    .orderBy(boardRepliesTable.createdAt);

  // Replies display anonymously, so `isOwn` is the only ownership signal sent —
  // it drives the author's delete control. The raw userId stays server-side.
  res.json(
    replies.map(({ userId, ...r }) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      isOwn: userId === req.userId,
    })),
  );
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

  // Trusted posters + admins skip moderation. An auto-approved reply is live at
  // once, so bump the parent post's reply count immediately (mirrors what the
  // admin reply-approve path does).
  const autoApprove = !!req.isAdmin || !!user?.boardAutoApprove;
  const status = autoApprove ? "approved" : "pending";

  const [reply] = await db
    .insert(boardRepliesTable)
    .values({
      postId,
      userId,
      content: trimmed,
      region,
      status,
      approvedAt: autoApprove ? new Date() : null,
      approvedBy: autoApprove ? userId : null,
    })
    .returning({ id: boardRepliesTable.id });

  if (autoApprove) {
    await db
      .update(boardPostsTable)
      .set({ replyCount: sql`reply_count + 1` })
      .where(eq(boardPostsTable.id, postId));
  }

  res.status(201).json({ id: reply!.id, status });
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

// Toggle a user's "post without review" trust flag. When enabled, that user's
// future posts + replies skip the moderation queue and go live immediately.
router.post("/admin/user/:userId/auto-approve", requireAdmin, async (req, res): Promise<void> => {
  const { userId } = req.params;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ boardAutoApprove: enabled })
    .where(eq(usersTable.id, userId as string))
    .returning({ id: usersTable.id, boardAutoApprove: usersTable.boardAutoApprove });

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ id: updated.id, boardAutoApprove: updated.boardAutoApprove });
});

export default router;
