import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import { isBootstrapAdminEmail } from "../lib/adminBootstrap";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      isAdmin?: boolean;
    }
  }
}

async function ensureUser(userId: string): Promise<User> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (existing) return existing;

  let email: string | null = null;
  let emailVerified = false;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const primary =
      clerkUser.primaryEmailAddress ?? clerkUser.emailAddresses[0] ?? null;
    email = primary?.emailAddress ?? null;
    emailVerified = primary?.verification?.status === "verified";
  } catch {
    // Email is best-effort; proceed without it.
  }

  // Create the user as a normal (non-admin) account first. Idempotent.
  await db
    .insert(usersTable)
    .values({
      id: userId,
      email,
      isAdmin: false,
      // Notifications are opt-IN: new users start with every reminder type OFF,
      // independent of any drifted DB column default.
      notifyPaymentReminders: false,
      notifyListExport: false,
      notifyReceiptReminders: false,
      notifySpendSummary: false,
    })
    .onConflictDoNothing();

  // Trusted admin bootstrap. Admin is NEVER granted just for being the first
  // (or any) public sign-up. We only promote a brand-new user when BOTH:
  //   1. their primary email is verified AND listed in ADMIN_BOOTSTRAP_EMAILS
  //      (a deployer-controlled allowlist — the trust anchor), and
  //   2. no admin currently exists (the NOT EXISTS guard; the partial unique
  //      index on is_admin = true is the concurrency backstop — a losing race
  //      raises a unique violation which we swallow so the user stays general).
  // With no allowlist configured, the app deliberately stays admin-less.
  if (email && emailVerified && isBootstrapAdminEmail(email)) {
    try {
      await db
        .update(usersTable)
        .set({ isAdmin: true, role: "master_admin" })
        .where(
          and(
            eq(usersTable.id, userId),
            sql`NOT EXISTS (SELECT 1 FROM users u WHERE u.is_admin = true)`,
          ),
        );
    } catch {
      // Lost the admin race or hit the single-admin index — stay general.
    }
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const user = await ensureUser(userId);
    req.userId = user.id;
    req.isAdmin = user.isAdmin;
    next();
  } catch (err) {
    req.log?.error({ err }, "Failed to resolve authenticated user");
    res.status(500).json({ error: "Failed to resolve user" });
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
