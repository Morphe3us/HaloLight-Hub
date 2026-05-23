import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, supportTickets, supportTicketReplies, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `TKT-${year}-${rand}`;
}

// GET /support/tickets
router.get("/support/tickets", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { status, priority, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const isAdmin = user.role === "admin";
  const conditions = isAdmin ? [] : [eq(supportTickets.userId, user.id)];
  if (status) conditions.push(eq(supportTickets.status, status as typeof supportTickets.status._.data));
  if (priority) conditions.push(eq(supportTickets.priority, priority as typeof supportTickets.priority._.data));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRow] = await Promise.all([
    db.select().from(supportTickets).where(whereClause).orderBy(desc(supportTickets.updatedAt)).limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)::int` }).from(supportTickets).where(whereClause),
  ]);

  res.json({ items: rows, total: countRow[0]?.count ?? 0 });
});

// POST /support/tickets
router.post("/support/tickets", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { title, description, priority, category } = req.body as {
    title: string; description: string;
    priority?: typeof supportTickets.priority._.data;
    category?: typeof supportTickets.category._.data;
  };
  if (!title || !description) { res.status(400).json({ error: "title and description required" }); return; }

  const [ticket] = await db.insert(supportTickets).values({
    userId: user.id,
    ticketNumber: generateTicketNumber(),
    title,
    description,
    priority: priority ?? "medium",
    category: category ?? "general",
  }).returning();

  res.status(201).json(ticket);
});

// GET /support/tickets/:id
router.get("/support/tickets/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const isAdmin = user.role === "admin";
  const conditions = [eq(supportTickets.id, id)];
  if (!isAdmin) conditions.push(eq(supportTickets.userId, user.id));

  const [ticket] = await db.select().from(supportTickets).where(and(...conditions));
  if (!ticket) { res.status(404).json({ error: "Not found" }); return; }

  const replies = await db.select({
    id: supportTicketReplies.id,
    ticketId: supportTicketReplies.ticketId,
    userId: supportTicketReplies.userId,
    content: supportTicketReplies.content,
    isStaff: supportTicketReplies.isStaff,
    createdAt: supportTicketReplies.createdAt,
    updatedAt: supportTicketReplies.updatedAt,
    userName: usersTable.fullName,
    userRole: usersTable.role,
  }).from(supportTicketReplies)
    .leftJoin(usersTable, eq(supportTicketReplies.userId, usersTable.id))
    .where(eq(supportTicketReplies.ticketId, id))
    .orderBy(supportTicketReplies.createdAt);

  res.json({ ...ticket, replies });
});

// PUT /support/tickets/:id
router.put("/support/tickets/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const isAdmin = user.role === "admin";
  const conditions = [eq(supportTickets.id, id)];
  if (!isAdmin) conditions.push(eq(supportTickets.userId, user.id));

  const [existing] = await db.select().from(supportTickets).where(and(...conditions));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { title, description, priority, category } = req.body as {
    title?: string; description?: string;
    priority?: typeof supportTickets.priority._.data;
    category?: typeof supportTickets.category._.data;
  };

  const [updated] = await db.update(supportTickets).set({
    title: title ?? existing.title,
    description: description ?? existing.description,
    priority: priority ?? existing.priority,
    category: category ?? existing.category,
    updatedAt: new Date(),
  }).where(eq(supportTickets.id, id)).returning();

  res.json(updated);
});

// POST /support/tickets/:id/replies
router.post("/support/tickets/:id/replies", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const isAdmin = user.role === "admin";
  const conditions = [eq(supportTickets.id, id)];
  if (!isAdmin) conditions.push(eq(supportTickets.userId, user.id));

  const [ticket] = await db.select().from(supportTickets).where(and(...conditions));
  if (!ticket) { res.status(404).json({ error: "Not found" }); return; }

  const { content, isStaff } = req.body as { content: string; isStaff?: number };
  if (!content) { res.status(400).json({ error: "content required" }); return; }

  const [reply] = await db.insert(supportTicketReplies).values({
    ticketId: id,
    userId: user.id,
    content,
    isStaff: isAdmin && isStaff ? 1 : 0,
  }).returning();

  await db.update(supportTickets).set({
    status: ticket.status === "waiting_on_client" && !isAdmin ? "open" : ticket.status,
    updatedAt: new Date(),
  }).where(eq(supportTickets.id, id));

  res.status(201).json(reply);
});

// PATCH /support/tickets/:id/status
router.patch("/support/tickets/:id/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const isAdmin = user.role === "admin";
  const conditions = [eq(supportTickets.id, id)];
  if (!isAdmin) conditions.push(eq(supportTickets.userId, user.id));

  const [existing] = await db.select().from(supportTickets).where(and(...conditions));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { status } = req.body as { status: typeof supportTickets.status._.data };
  if (!status) { res.status(400).json({ error: "status required" }); return; }

  const extra: { resolvedAt?: Date; closedAt?: Date } = {};
  if (status === "resolved") extra.resolvedAt = new Date();
  if (status === "closed") extra.closedAt = new Date();

  const [updated] = await db.update(supportTickets).set({ status, ...extra, updatedAt: new Date() }).where(eq(supportTickets.id, id)).returning();
  res.json(updated);
});

export default router;
