import { Router } from "express";
import { eq, and, desc, sql, gt, inArray, notInArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  boardPostsTable,
  boardRepliesTable,
  boardAgreesTable,
  boardThanksTable,
  boardReportsTable,
  boardBlocksTable,
  receiptsTable,
  usersTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { screenContent } from "../lib/contentFilter";

const router = Router();

const MIN_UPLOADS = 2;
const MAX_CONTENT_LENGTH = 500;

const VALID_TAGS = new Set(["recipe", "advice", "cool_idea", "hot_deal", "other"]);
const HOT_THRESHOLD = 5; // agrees in 24 h to be considered trending

const VALID_REPORT_REASONS = new Set(["spam", "harassment", "hate", "sexual", "off_topic", "other"]);
const MAX_REPORT_DETAIL = 500;

/** IDs of everyone `userId` has blocked. A post/reply from any of these is
 * filtered out before it reaches the client — blocking is meant to feel like
 * the person's content stopped existing, not like it's merely marked. */
async function getBlockedUserIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ blockedId: boardBlocksTable.blockedId })
    .from(boardBlocksTable)
    .where(eq(boardBlocksTable.blockerId, userId));
  return rows.map((r) => r.blockedId);
}

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

  const blockedIds = await getBlockedUserIds(userId);

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
    .where(
      blockedIds.length
        ? and(eq(boardPostsTable.status, "approved"), notInArray(boardPostsTable.userId, blockedIds))
        : eq(boardPostsTable.status, "approved"),
    )
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

  // Objectionable-content screening (App Store Guideline 1.2). A "block" never
  // reaches the database; a "review" overrides auto-approve so a human sees it.
  const screening = screenContent(trimmed);
  if (screening.verdict === "block") {
    res.status(400).json({ error: screening.reason });
    return;
  }

  const resolvedTag = tag && VALID_TAGS.has(tag) ? tag : null;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const region = buildRegion(user?.countryCode ?? null, user?.stateCode ?? null);

  // Trusted posters (admin-flagged) and admins skip the moderation queue — their
  // posts go live immediately (status "approved", stamped as approved now).
  // Flagged wording is the one thing that pulls them back into it: auto-approve
  // is otherwise an unmoderated path straight to the live board.
  const autoApprove =
    (!!req.isAdmin || !!user?.boardAutoApprove) && screening.verdict !== "review";
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

  const screening = screenContent(trimmed);
  if (screening.verdict === "block") {
    res.status(400).json({ error: screening.reason });
    return;
  }

  const [post] = await db.select().from(boardPostsTable).where(eq(boardPostsTable.id, postId));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.userId !== userId) { res.status(403).json({ error: "Not your post" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const keepsApproval =
    (!!req.isAdmin || !!user?.boardAutoApprove) && screening.verdict !== "review";
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

  const blockedIds = await getBlockedUserIds(req.userId!);

  const replies = await db
    .select({
      id: boardRepliesTable.id,
      content: boardRepliesTable.content,
      region: boardRepliesTable.region,
      createdAt: boardRepliesTable.createdAt,
      userId: boardRepliesTable.userId,
    })
    .from(boardRepliesTable)
    .where(
      blockedIds.length
        ? and(
            eq(boardRepliesTable.postId, postId),
            eq(boardRepliesTable.status, "approved"),
            notInArray(boardRepliesTable.userId, blockedIds),
          )
        : and(eq(boardRepliesTable.postId, postId), eq(boardRepliesTable.status, "approved")),
    )
    .orderBy(boardRepliesTable.createdAt);

  // Replies display anonymously, so `isOwn` and `id` (for report/block targets)
  // are the only identity-adjacent signals sent — the raw userId stays server-side.
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

  const screening = screenContent(trimmed);
  if (screening.verdict === "block") {
    res.status(400).json({ error: screening.reason });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const region = buildRegion(user?.countryCode ?? null, user?.stateCode ?? null);

  // Trusted posters + admins skip moderation, unless the screening flagged the
  // wording. An auto-approved reply is live at once, so bump the parent post's
  // reply count immediately (mirrors what the admin reply-approve path does).
  const autoApprove =
    (!!req.isAdmin || !!user?.boardAutoApprove) && screening.verdict !== "review";
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

// ── Moderation: report + block ───────────────────────────────────────────────
// Required for any app with user-generated content (App Store Guideline 1.2):
// a way to report objectionable content, and a way to block the person who
// posted it. See lib/db/src/schema/boardModeration.ts for why the two are
// separate tables with different semantics.

// POST /board/report — flag a post or reply for a moderator. Exactly one of
// postId/replyId must be present; the target's author is resolved server-side
// so the client never needs to know who wrote it (replies are anonymous).
router.post("/report", async (req, res): Promise<void> => {
  const reporterId = req.userId!;
  const { postId, replyId, reason, detail } = req.body as {
    postId?: unknown;
    replyId?: unknown;
    reason?: unknown;
    detail?: unknown;
  };

  const hasPost = typeof postId === "number" && Number.isInteger(postId);
  const hasReply = typeof replyId === "number" && Number.isInteger(replyId);
  if (hasPost === hasReply) {
    res.status(400).json({ error: "Exactly one of postId or replyId is required" });
    return;
  }
  if (typeof reason !== "string" || !VALID_REPORT_REASONS.has(reason)) {
    res.status(400).json({ error: `reason must be one of: ${[...VALID_REPORT_REASONS].join(", ")}` });
    return;
  }
  const trimmedDetail =
    typeof detail === "string" && detail.trim() ? detail.trim().slice(0, MAX_REPORT_DETAIL) : null;

  // Confirm the target actually exists before recording a report against it —
  // otherwise a stale client could file reports against deleted content forever.
  if (hasPost) {
    const [post] = await db.select({ id: boardPostsTable.id }).from(boardPostsTable).where(eq(boardPostsTable.id, postId as number));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  } else {
    const [reply] = await db.select({ id: boardRepliesTable.id }).from(boardRepliesTable).where(eq(boardRepliesTable.id, replyId as number));
    if (!reply) { res.status(404).json({ error: "Reply not found" }); return; }
  }

  // Idempotent: reporting the same thing twice isn't a stronger signal, and the
  // unique index would otherwise turn a duplicate tap into a 500.
  await db
    .insert(boardReportsTable)
    .values({
      reporterId,
      postId: hasPost ? (postId as number) : null,
      replyId: hasReply ? (replyId as number) : null,
      reason,
      detail: trimmedDetail,
    })
    .onConflictDoNothing();

  res.status(201).json({ success: true });
});

// POST /board/block — hide everything from a post or reply's author, for the
// caller only, effective immediately. Resolves the author server-side for the
// same reason as report: the client never has to know who wrote a reply.
//
// Blocking also files a moderation report. Guideline 1.2 asks that blocking
// "notify the developer of the inappropriate content", not just hide it, so the
// block and the report are written together: someone reaching for Block has
// told us something is wrong here whether or not they also tapped Report.
router.post("/block", async (req, res): Promise<void> => {
  const blockerId = req.userId!;
  const { postId, replyId } = req.body as { postId?: unknown; replyId?: unknown };

  const hasPost = typeof postId === "number" && Number.isInteger(postId);
  const hasReply = typeof replyId === "number" && Number.isInteger(replyId);
  if (hasPost === hasReply) {
    res.status(400).json({ error: "Exactly one of postId or replyId is required" });
    return;
  }

  const [target] = hasPost
    ? await db.select({ userId: boardPostsTable.userId }).from(boardPostsTable).where(eq(boardPostsTable.id, postId as number))
    : await db.select({ userId: boardRepliesTable.userId }).from(boardRepliesTable).where(eq(boardRepliesTable.id, replyId as number));

  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  if (target.userId === blockerId) { res.status(400).json({ error: "You can't block yourself" }); return; }

  await db.transaction(async (tx) => {
    await tx
      .insert(boardBlocksTable)
      .values({ blockerId, blockedId: target.userId })
      .onConflictDoNothing();

    // onConflictDoNothing: if they already reported this exact item, that
    // report stands — a block on top of it is not a second signal.
    await tx
      .insert(boardReportsTable)
      .values({
        reporterId: blockerId,
        postId: hasPost ? (postId as number) : null,
        replyId: hasReply ? (replyId as number) : null,
        reason: "blocked_user",
        detail: null,
      })
      .onConflictDoNothing();
  });

  res.status(201).json({ success: true });
});

// GET /board/blocked — accounts the caller has blocked, for the "Blocked
// accounts" list in Account settings.
router.get("/blocked", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      userId: boardBlocksTable.blockedId,
      username: usersTable.username,
      avatar: usersTable.avatar,
      blockedAt: boardBlocksTable.createdAt,
    })
    .from(boardBlocksTable)
    .leftJoin(usersTable, eq(usersTable.id, boardBlocksTable.blockedId))
    .where(eq(boardBlocksTable.blockerId, req.userId!))
    .orderBy(desc(boardBlocksTable.createdAt));

  res.json(
    rows.map((r) => ({
      userId: r.userId,
      username: r.username ?? "Member",
      avatar: r.avatar ?? null,
      blockedAt: r.blockedAt.toISOString(),
    })),
  );
});

// DELETE /board/blocked/:userId — unblock. No-op (still 200) if they weren't
// blocked, so a client retry or a stale list can't produce a confusing error.
router.delete("/blocked/:userId", async (req, res): Promise<void> => {
  await db
    .delete(boardBlocksTable)
    .where(and(eq(boardBlocksTable.blockerId, req.userId!), eq(boardBlocksTable.blockedId, req.params.userId as string)));
  res.json({ success: true });
});

// GET /board/admin/reports — open reports, newest first, with a resolved
// snapshot of the reported content (posts/replies can be deleted out from
// under a report, so this reads what's still there rather than joining).
router.get("/admin/reports", requireAdmin, async (_req, res): Promise<void> => {
  const reports = await db
    .select()
    .from(boardReportsTable)
    .where(eq(boardReportsTable.status, "open"))
    .orderBy(desc(boardReportsTable.createdAt));

  const postIds = reports.filter((r) => r.postId != null).map((r) => r.postId as number);
  const replyIds = reports.filter((r) => r.replyId != null).map((r) => r.replyId as number);

  // The author comes back with the report so a moderator can act on the person,
  // not only the post — Guideline 1.2 asks for ejecting repeat offenders, and
  // that needs a name to click through to.
  const [posts, replies] = await Promise.all([
    postIds.length
      ? db
          .select({
            id: boardPostsTable.id,
            content: boardPostsTable.content,
            authorId: boardPostsTable.userId,
            authorUsername: usersTable.username,
          })
          .from(boardPostsTable)
          .leftJoin(usersTable, eq(usersTable.id, boardPostsTable.userId))
          .where(inArray(boardPostsTable.id, postIds))
      : Promise.resolve([]),
    replyIds.length
      ? db
          .select({
            id: boardRepliesTable.id,
            content: boardRepliesTable.content,
            authorId: boardRepliesTable.userId,
            authorUsername: usersTable.username,
          })
          .from(boardRepliesTable)
          .leftJoin(usersTable, eq(usersTable.id, boardRepliesTable.userId))
          .where(inArray(boardRepliesTable.id, replyIds))
      : Promise.resolve([]),
  ]);
  const byPost = new Map(posts.map((p) => [p.id, p]));
  const byReply = new Map(replies.map((r) => [r.id, r]));

  res.json(
    reports.map((r) => {
      // Null means the reported content was deleted since the report was filed.
      const target = r.postId != null ? byPost.get(r.postId) : byReply.get(r.replyId!);
      return {
        id: r.id,
        postId: r.postId,
        replyId: r.replyId,
        reason: r.reason,
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
        content: target?.content ?? null,
        authorId: target?.authorId ?? null,
        authorUsername: target?.authorUsername ?? null,
      };
    }),
  );
});

// POST /board/admin/reports/:id/resolve — mark a report reviewed. `action` is
// stored as the report's terminal status; deleting the reported content (if
// warranted) is a separate call to the existing delete endpoints.
router.post("/admin/reports/:id/resolve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { action } = req.body as { action?: unknown };
  if (action !== "actioned" && action !== "dismissed") {
    res.status(400).json({ error: 'action must be "actioned" or "dismissed"' });
    return;
  }

  await db
    .update(boardReportsTable)
    .set({ status: action, reviewedAt: new Date(), reviewedBy: req.userId! })
    .where(eq(boardReportsTable.id, id));

  res.json({ success: true });
});

export default router;
