import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { loopsSendTransactional } from "../lib/email/loops";
import { logger } from "../lib/logger";

const router = Router();

const SUPPORT_EMAIL = "support@fivetoninesolutions.com";
const VALID_TYPES = new Set(["suggestion", "complaint", "comment"]);
const MAX_LEN = 2000;

router.post("/", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { type, message } = req.body as { type?: string; message?: string };

  const trimmed = message?.trim() ?? "";
  if (!trimmed || trimmed.length > MAX_LEN) {
    res.status(400).json({ error: `Message must be 1–${MAX_LEN} characters` });
    return;
  }

  const resolvedType = VALID_TYPES.has(type ?? "") ? type! : "comment";

  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const fromEmail = user?.email ?? "unknown";
  const typeLabel = resolvedType.charAt(0).toUpperCase() + resolvedType.slice(1);

  // Relay to the support inbox via a Loops transactional email. Create a
  // transactional in Loops (with {type}/{fromEmail}/{userId}/{message} data
  // variables) and set its ID as LOOPS_TRANSACTIONAL_SUPPORT_ID. No-op + log
  // when unset so the form still succeeds.
  const result = await loopsSendTransactional(
    SUPPORT_EMAIL,
    process.env.LOOPS_TRANSACTIONAL_SUPPORT_ID,
    { type: typeLabel, fromEmail, userId, message: trimmed },
  );
  if (!result.sent) {
    logger.warn({ userId, type: resolvedType, reason: result.reason }, "Support message not emailed");
  }

  res.json({ success: true });
});

export default router;
