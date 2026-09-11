import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { parsePreferenceUpdate, preferenceResponse } from "../lib/notificationPreferences";

const router: IRouter = Router();
router.use("/notifications", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

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

  const [prefs] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, user.id));

  res.json(preferenceResponse(user.id, prefs));
});

// PUT /notifications/preferences
router.put("/notifications/preferences", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const updates = parsePreferenceUpdate(req.body);
  if (!updates) {
    res.status(400).json({ error: "Invalid notification preferences" });
    return;
  }
  const [result] = await db.insert(notificationPreferencesTable)
    .values({ userId: user.id, ...updates })
    .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { userId: user.id, ...updates } })
    .returning();
  res.json(preferenceResponse(user.id, result));
});

export default router;
