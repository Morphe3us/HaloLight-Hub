import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /notifications
router.get("/notifications", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const unreadOnly = req.query.unread_only === "true";
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const conditions = [eq(notificationsTable.userId, user.id)];
  if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));

  const items = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notificationsTable)
    .where(and(...conditions));

  res.json({ items, total: Number(count) });
});

// GET /notifications/unread-count
router.get("/notifications/unread-count", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, user.id),
      eq(notificationsTable.isRead, false)
    ));

  res.json({ count: Number(count) });
});

// PATCH /notifications/read-all
router.patch("/notifications/read-all", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(
      eq(notificationsTable.userId, user.id),
      eq(notificationsTable.isRead, false)
    ))
    .returning();

  res.json({ updated: result.length });
});

// PATCH /notifications/:id/read
router.patch("/notifications/:id/read", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)))
    .returning();

  if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(notification);
});

// GET /notifications/preferences
router.get("/notifications/preferences", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  let [prefs] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, user.id));

  if (!prefs) {
    const [created] = await db
      .insert(notificationPreferencesTable)
      .values({ userId: user.id })
      .returning();
    prefs = created;
  }

  res.json({
    userId: prefs.userId,
    emailEnabled: prefs.emailEnabled,
    inAppEnabled: prefs.inAppEnabled,
    typeOverrides: JSON.parse(prefs.typeOverrides || "{}"),
  });
});

// PUT /notifications/preferences
router.put("/notifications/preferences", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { emailEnabled, inAppEnabled, typeOverrides } = req.body;
  const updates: Record<string, unknown> = {};
  if (emailEnabled !== undefined) updates.emailEnabled = emailEnabled;
  if (inAppEnabled !== undefined) updates.inAppEnabled = inAppEnabled;
  if (typeOverrides !== undefined) updates.typeOverrides = JSON.stringify(typeOverrides);

  const existing = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, user.id));

  let result;
  if (existing.length === 0) {
    [result] = await db
      .insert(notificationPreferencesTable)
      .values({ userId: user.id, ...updates as any })
      .returning();
  } else {
    [result] = await db
      .update(notificationPreferencesTable)
      .set(updates as any)
      .where(eq(notificationPreferencesTable.userId, user.id))
      .returning();
  }

  res.json({
    userId: result.userId,
    emailEnabled: result.emailEnabled,
    inAppEnabled: result.inAppEnabled,
    typeOverrides: JSON.parse(result.typeOverrides || "{}"),
  });
});

export default router;
