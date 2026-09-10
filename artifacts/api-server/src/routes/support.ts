import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, supportTickets, supportTicketReplies, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { decodeTicketAttachments, publicTicketAttachments, removeTicketAttachments, saveTicketAttachments, ticketAttachmentStorage } from "../lib/supportAttachments";
import { dispatchTicketMail, enqueueTicketMail, ticketMailHistory } from "../lib/mail/ticketOutbox";

const router: IRouter = Router();
const priorities = ["low", "medium", "high", "urgent"];
const categories = ["billing", "technical", "general", "feature_request", "bug_report"];
const statuses = ["open", "in_progress", "waiting_on_client", "resolved", "closed"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param("id", (_req, res, next, value) => {
  if (!uuid.test(value)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }
  next();
});

function publicTicket(ticket: typeof supportTickets.$inferSelect) {
  return { ...ticket, attachments: publicTicketAttachments(ticket.id, ticket.attachments ?? []) };
}

function validTicketInput(body: unknown, partial = false): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const data = body as Record<string, unknown>;
  for (const [key, max] of [["title", 250], ["description", 20000], ["equipmentModel", 200], ["serialNumber", 200]] as const) {
    const value = data[key];
    const required = !partial && (key === "title" || key === "description");
    if ((required && (typeof value !== "string" || !value.trim())) ||
      (value !== undefined && value !== null && (typeof value !== "string" || value.length > max || !value.trim())) ||
      (value === null && (key === "title" || key === "description"))) return false;
  }
  return (data.priority === undefined || priorities.includes(data.priority as string)) &&
    (data.category === undefined || categories.includes(data.category as string));
}

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const rand = randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
  return `TKT-${year}-${rand}`;
}

// GET /support/tickets
router.get("/support/tickets", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { status, priority, limit = "50", offset = "0" } = req.query as Record<string, string>;
  if ((status && !statuses.includes(status)) || (priority && !priorities.includes(priority)) ||
    typeof limit !== "string" || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 ||
    typeof offset !== "string" || !/^\d+$/.test(offset) || Number(offset) > 1000000) {
    res.status(400).json({ error: "Invalid ticket query" }); return;
  }

  const isAdmin = user.role === "admin";
  const conditions = isAdmin ? [] : [eq(supportTickets.userId, user.id)];
  if (status) conditions.push(eq(supportTickets.status, status as typeof supportTickets.status._.data));
  if (priority) conditions.push(eq(supportTickets.priority, priority as typeof supportTickets.priority._.data));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRow] = await Promise.all([
    db.select().from(supportTickets).where(whereClause).orderBy(desc(supportTickets.updatedAt)).limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)::int` }).from(supportTickets).where(whereClause),
  ]);

  res.json({ items: rows.map(publicTicket), total: countRow[0]?.count ?? 0 });
});

// POST /support/tickets
router.post("/support/tickets", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!validTicketInput(req.body)) { res.status(400).json({ error: "Invalid ticket fields" }); return; }
  const { title, description, priority, category, equipmentModel, serialNumber } = req.body as {
    title: string; description: string;
    priority?: typeof supportTickets.priority._.data;
    category?: typeof supportTickets.category._.data;
    equipmentModel?: string | null; serialNumber?: string | null;
  };
  let files: ReturnType<typeof decodeTicketAttachments>;
  try { files = decodeTicketAttachments(req.body.attachments); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const id = randomUUID();
  let storage: ReturnType<typeof ticketAttachmentStorage> | undefined;
  let attachments: Awaited<ReturnType<typeof saveTicketAttachments>> = [];
  try {
    if (files.length) {
      storage = ticketAttachmentStorage();
      attachments = await saveTicketAttachments(id, files, storage);
    }
  } catch { res.status(503).json({ error: "Private attachment storage is unavailable" }); return; }
  let ticket: typeof supportTickets.$inferSelect;
  try {
    ticket = await db.transaction(async tx => {
      const [created] = await tx.insert(supportTickets).values({
        id, userId: user.id, ticketNumber: generateTicketNumber(), title: title.trim(), description: description.trim(),
        priority: priority ?? "medium", category: category ?? "general", equipmentModel: equipmentModel?.trim() || null,
        serialNumber: serialNumber?.trim() || null, attachments,
      }).returning();
      await enqueueTicketMail(tx, created!, user);
      return created!;
    });
  } catch {
    // A lost COMMIT acknowledgement is not proof of rollback. Never delete bytes
    // belonging to a committed ticket or when the database cannot resolve it.
    try {
      const [committed] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
      if (committed) ticket = committed;
      else {
        if (storage) await removeTicketAttachments(attachments, storage);
        res.status(503).json({ error: "Ticket creation failed" }); return;
      }
    } catch { res.status(503).json({ error: "Ticket creation could not be confirmed" }); return; }
  }
  // The durable worker retries failures; delivery must never turn a committed ticket into an HTTP error.
  void dispatchTicketMail(ticket.id).catch(() => undefined);
  res.status(201).json(publicTicket(ticket));
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

  res.json({ ...publicTicket(ticket), replies, ...await ticketMailHistory(id) });
});

router.get("/support/tickets/:id/attachments/:attachmentId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);
  const attachmentId = String(req.params.attachmentId);
  if (!uuid.test(attachmentId)) { res.status(400).json({ error: "Invalid attachment ID" }); return; }
  const [ticket] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id),
    user.role === "admin" ? undefined : eq(supportTickets.userId, user.id)));
  const file = ticket?.attachments?.find(item => item.id === attachmentId);
  if (!file) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const stream = await ticketAttachmentStorage().openReadStream!(file.key);
    res.type(file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/'/g, "%27")}`);
    await pipeline(stream, res);
  } catch {
    if (!res.headersSent && !res.destroyed) res.status(404).json({ error: "Attachment unavailable" });
  }
});

router.post("/support/tickets/:id/email/retry", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params.id);
  const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, id));
  if (!ticket) { res.status(404).json({ error: "Not found" }); return; }
  await dispatchTicketMail(id);
  res.json(await ticketMailHistory(id));
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

  if (!validTicketInput(req.body, true) || req.body.attachments !== undefined) { res.status(400).json({ error: "Invalid ticket update" }); return; }
  const { title, description, priority, category, equipmentModel, serialNumber } = req.body as {
    title?: string; description?: string;
    priority?: typeof supportTickets.priority._.data;
    category?: typeof supportTickets.category._.data;
    equipmentModel?: string | null; serialNumber?: string | null;
  };

  const [updated] = await db.update(supportTickets).set({
    title: title ?? existing.title,
    description: description ?? existing.description,
    priority: priority ?? existing.priority,
    category: category ?? existing.category,
    ...(equipmentModel === undefined ? {} : { equipmentModel }),
    ...(serialNumber === undefined ? {} : { serialNumber }),
    updatedAt: new Date(),
  }).where(eq(supportTickets.id, id)).returning();

  res.json(publicTicket(updated!));
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

  const { content, isStaff } = (req.body ?? {}) as { content: string; isStaff?: number };
  if (typeof content !== "string" || !content.trim() || content.length > 20000) { res.status(400).json({ error: "Invalid reply content" }); return; }

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

  const { status } = (req.body ?? {}) as { status: typeof supportTickets.status._.data };
  if (!statuses.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }

  const extra: { resolvedAt?: Date; closedAt?: Date } = {};
  if (status === "resolved") extra.resolvedAt = new Date();
  if (status === "closed") extra.closedAt = new Date();

  const [updated] = await db.update(supportTickets).set({ status, ...extra, updatedAt: new Date() }).where(eq(supportTickets.id, id)).returning();
  res.json(publicTicket(updated!));
});

export default router;
