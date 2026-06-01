import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

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
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;
  } catch {
    // Email is best-effort; proceed without it.
  }

  // Create the user as a normal (non-admin) account first. Idempotent.
  await db
    .insert(usersTable)
    .values({ id: userId, email, isAdmin: false })
    .onConflictDoNothing();

  // Atomically elect the first-ever admin. The NOT EXISTS guard avoids
  // contention once an admin exists; the partial unique index on
  // is_admin = true guarantees at most one admin even if two brand-new
  // users sign in concurrently (the loser's UPDATE raises a unique
  // violation, which we swallow so they remain a normal user).
  // The elected admin becomes the master_admin role. We deliberately do NOT
  // claim pre-existing ownerless data — the admin starts with a clean personal
  // account and only sees the cross-user admin views.
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
    // Lost the admin race — remain a normal user.
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
