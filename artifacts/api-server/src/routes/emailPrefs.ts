// Public (unauthenticated) email-preference endpoints.
//
// Mounted before requireAuth — the HMAC token in the link is the authorization,
// so a recipient can unsubscribe straight from their inbox without logging in.
// Turns OFF all reminder-email types for the user; they can re-enable any of
// them from the in-app notification settings.
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { verifyUnsubToken } from "../lib/email/unsubscribe";
import { logger } from "../lib/logger";

const router = Router();
const WEB = (process.env.WEB_BASE_URL || "https://5to9shopping.com").replace(/\/+$/, "");

async function unsubscribeAll(userId: string): Promise<boolean> {
  const rows = await db
    .update(usersTable)
    .set({
      notifyPaymentReminders: false,
      notifyListExport: false,
      notifyReceiptReminders: false,
      notifySpendSummary: false,
    })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id });
  return rows.length > 0;
}

function confirmationPage(ok: boolean): string {
  const title = ok ? "You're unsubscribed" : "Link expired or invalid";
  const message = ok
    ? "You won't receive reminder emails from TimetoPay anymore. You can turn any of them back on anytime from the app's notification settings."
    : "We couldn't verify this unsubscribe link. Please open the app and manage your email preferences from the account screen.";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:480px;margin:48px auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f766e;">${title}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${message}</p>
    <a href="${WEB}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:10px;">Open TimetoPay</a>
  </div>
</body></html>`;
}

// RFC 8058 one-click: email clients POST here automatically from the
// List-Unsubscribe-Post header. Always 200 on a valid token.
router.post("/unsubscribe", async (req, res): Promise<void> => {
  const userId = String(req.query.u ?? "");
  const token = String(req.query.t ?? "");
  if (!verifyUnsubToken(userId, token)) {
    res.status(400).end();
    return;
  }
  try {
    await unsubscribeAll(userId);
  } catch (err) {
    logger.error({ err, userId }, "One-click unsubscribe failed");
  }
  res.status(200).end();
});

// Human click from the footer link — flips the flags and shows a confirmation.
router.get("/unsubscribe", async (req, res): Promise<void> => {
  const userId = String(req.query.u ?? "");
  const token = String(req.query.t ?? "");
  const valid = verifyUnsubToken(userId, token);
  if (valid) {
    try {
      await unsubscribeAll(userId);
    } catch (err) {
      logger.error({ err, userId }, "Unsubscribe failed");
    }
  }
  res.status(valid ? 200 : 400).type("html").send(confirmationPage(valid));
});

export default router;
