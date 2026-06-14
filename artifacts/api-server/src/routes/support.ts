import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { sendEmail, isResendConfigured } from "../lib/email/resendClient";
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
  const subject = `[TimetoPay] ${typeLabel} from ${fromEmail}`;
  const safeMsg = trimmed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<h3>${typeLabel}</h3><p><strong>From:</strong> ${fromEmail}</p><p><strong>User ID:</strong> ${userId}</p><hr/><p style="white-space:pre-wrap">${safeMsg}</p>`;
  const text = `${typeLabel}\nFrom: ${fromEmail}\nUser ID: ${userId}\n\n${trimmed}`;

  if (isResendConfigured()) {
    const result = await sendEmail({ to: SUPPORT_EMAIL, subject, html, text });
    if (!result.sent) {
      logger.warn({ userId, reason: result.reason }, "Support email failed to send");
    }
  } else {
    logger.info({ userId, type: resolvedType }, "Support message received (email not configured)");
  }

  res.json({ success: true });
});

export default router;
