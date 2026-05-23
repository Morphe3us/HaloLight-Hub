import { Router, type IRouter, type Request, type Response } from "express";
import { eq, ilike, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /users/me
router.get("/users/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(user);
});

// PATCH /users/me
router.patch("/users/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { fullName, companyName, phone, language } = req.body;
  const updates: Partial<typeof usersTable.$inferInsert> = {};

  if (fullName !== undefined) updates.fullName = fullName;
  if (companyName !== undefined) updates.companyName = companyName;
  if (phone !== undefined) updates.phone = phone;
  if (language !== undefined) updates.language = language;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json(updated);
});

// GET /users (admin only — role check deferred to future middleware, basic auth check here)
router.get("/users", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const currentUser = await getOrCreateUser(req);
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const role = req.query.role as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  let query = db.select().from(usersTable);
  if (role) {
    query = query.where(eq(usersTable.role, role as typeof usersTable.$inferSelect.role)) as typeof query;
  }

  const items = await query.limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);

  res.json({ items, total: Number(count) });
});

// GET /users/:id (admin only)
router.get("/users/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const currentUser = await getOrCreateUser(req);
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

export default router;
