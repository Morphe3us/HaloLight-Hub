import { and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { createOrdinaryNotification } from "./createOrdinaryNotification";
import { logger } from "./logger";

type PendingSignup = { id: string; email: string | null; fullName: string | null };

/** Tells every approved, active administrator that a new registration awaits review. */
export async function notifyAdminsOfPendingSignup(user: PendingSignup): Promise<void> {
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "admin"), eq(usersTable.isActive, true), eq(usersTable.accessStatus, "approved")));
    const who = [user.fullName?.trim(), user.email].filter(Boolean).join(" · ") || user.id;
    await Promise.all(admins.map((admin) => createOrdinaryNotification({
      userId: admin.id,
      type: "signup_pending",
      title: "Nouvelle inscription à valider",
      body: `${who} attend votre validation pour accéder au Hub.`,
      link: "/admin",
    })));
  } catch (error) {
    // A failed alert must never block the registration itself.
    logger.warn({ err: error, userId: user.id }, "Could not notify admins of pending signup");
  }
}
