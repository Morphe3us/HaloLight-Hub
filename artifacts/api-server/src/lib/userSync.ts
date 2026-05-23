import { getAuth } from "@clerk/express";
import { type Request } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Get or create a local user record from the authenticated Clerk session.
 * Performs just-in-time (JIT) provisioning on first login.
 */
export async function getOrCreateUser(req: Request) {
  const auth = getAuth(req);
  if (!auth?.userId) return null;

  const clerkId = auth.userId;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));

  if (existing) return existing;

  // JIT provision: extract email from session claims
  const email =
    (auth.sessionClaims?.email as string) ||
    (auth.sessionClaims?.["primary_email_address"] as string) ||
    `${clerkId}@placeholder.com`;

  const fullName =
    (auth.sessionClaims?.name as string) ||
    (auth.sessionClaims?.["full_name"] as string) ||
    null;

  const [created] = await db
    .insert(usersTable)
    .values({ clerkId, email, fullName })
    .returning();

  logger.info({ clerkId, userId: created.id }, "JIT provisioned new user");
  return created;
}
