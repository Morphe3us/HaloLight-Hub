import { eq } from "drizzle-orm";
import { db, notificationsTable, notificationPreferencesTable } from "@workspace/db";

// Only ordinary in-app alerts belong here, never security alerts or ticket mail.
export async function createOrdinaryNotification(notification: typeof notificationsTable.$inferInsert): Promise<boolean> {
  const [prefs] = await db.select({ inAppEnabled: notificationPreferencesTable.inAppEnabled })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, notification.userId));
  if (prefs?.inAppEnabled === false) return false;
  await db.insert(notificationsTable).values(notification);
  return true;
}
