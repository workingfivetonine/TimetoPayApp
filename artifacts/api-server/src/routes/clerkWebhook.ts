import type { Request, Response } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { sendAccountDeletedEmail } from "../lib/email/transactional";
import { logger } from "../lib/logger";

// Verify a Clerk (Svix) webhook signature without the svix dependency.
// Svix signs `${id}.${timestamp}.${rawBody}` with HMAC-SHA256 over the
// base64-decoded portion of the `whsec_...` secret; the svix-signature header is
// a space-separated list of `v1,<base64sig>` entries.
function verifySignature(secret: string, headers: Request["headers"], rawBody: Buffer): boolean {
  const id = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signature = headers["svix-signature"];
  if (typeof id !== "string" || typeof timestamp !== "string" || typeof signature !== "string") {
    return false;
  }
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody.toString("utf8")}`;
  const expected = Buffer.from(
    crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64"),
  );
  return signature.split(" ").some((part) => {
    const value = part.split(",")[1];
    if (!value) return false;
    const valueBuf = Buffer.from(value);
    return valueBuf.length === expected.length && crypto.timingSafeEqual(valueBuf, expected);
  });
}

// Public, Svix-signed Clerk webhook. The raw body (Buffer) is provided by the
// express.raw parser registered in app.ts. We act on `user.deleted`: email the
// dashboard-deleted user a confirmation and remove their data. Idempotent — if
// our app already deleted
// the row (it deletes the Clerk user too, which re-fires this event), the lookup
// finds nothing and we no-op.
export async function clerkWebhookHandler(req: Request, res: Response): Promise<void> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("CLERK_WEBHOOK_SECRET is not set — rejecting Clerk webhook");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody) || !verifySignature(secret, req.headers, rawBody)) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  let evt: { type?: string; data?: { id?: string } };
  try {
    evt = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  if (evt.type === "user.deleted" && evt.data?.id) {
    const userId = evt.data.id;
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (user) {
        await db.delete(usersTable).where(eq(usersTable.id, userId));
        if (user.email) void sendAccountDeletedEmail(user.email);
        logger.info({ userId }, "Clerk user.deleted: removed user data");
      }
    } catch (err) {
      logger.error({ err, userId }, "Clerk user.deleted handling failed");
    }
  }

  res.json({ received: true });
}
