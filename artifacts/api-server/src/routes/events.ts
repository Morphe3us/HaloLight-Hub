import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, count, gte } from "drizzle-orm";
import { db, events } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /events
router.get("/events", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const limit = Number(req.query.limit ?? 20);
  const offset = Number(req.query.offset ?? 0);
  const status = req.query.status as string | undefined;

  const now = new Date();
  let query = db
    .select()
    .from(events)
    .where(
      status
        ? and(
            eq(events.userId, user.id),
            eq(events.status, status as "upcoming" | "active" | "completed" | "cancelled"),
            // Upcoming filter only returns future events
            status === "upcoming" ? gte(events.eventDate, now) : undefined
          )
        : eq(events.userId, user.id)
    )
    .orderBy(desc(events.eventDate))
    .limit(limit)
    .offset(offset);

  const items = await query;

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(events)
    .where(eq(events.userId, user.id));

  res.json({
    items: items.map(formatEvent),
    total,
  });
});

// POST /events
router.post("/events", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { title, description, eventDate, location, type, notes } = req.body as {
    title: string;
    description?: string;
    eventDate: string;
    location?: string;
    type?: string;
    notes?: string;
  };

  const [event] = await db
    .insert(events)
    .values({
      userId: user.id,
      title,
      description,
      eventDate: new Date(eventDate),
      location,
      type,
      notes,
    })
    .returning();

  res.status(201).json(formatEvent(event));
});

// GET /events/:id
router.get("/events/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, user.id)));

  if (!event) { res.status(404).json({ error: "Event not found" }); return; }

  res.json(formatEvent(event));
});

// PATCH /events/:id
router.patch("/events/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [existing] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, user.id)));

  if (!existing) { res.status(404).json({ error: "Event not found" }); return; }

  const { title, description, eventDate, location, type, status, notes, revenue, currency } = req.body as {
    title?: string;
    description?: string;
    eventDate?: string;
    location?: string;
    type?: string;
    status?: "upcoming" | "active" | "completed" | "cancelled";
    notes?: string;
    revenue?: string;
    currency?: string;
  };

  const [updated] = await db
    .update(events)
    .set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(eventDate !== undefined && { eventDate: new Date(eventDate) }),
      ...(location !== undefined && { location }),
      ...(type !== undefined && { type }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
      ...(revenue !== undefined && { revenue }),
      ...(currency !== undefined && { currency }),
      updatedAt: new Date(),
    })
    .where(and(eq(events.id, eventId), eq(events.userId, user.id)))
    .returning();

  res.json(formatEvent(updated));
});

// DELETE /events/:id
router.delete("/events/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  await db.delete(events).where(and(eq(events.id, eventId), eq(events.userId, user.id)));

  res.status(204).end();
});

function formatEvent(e: typeof events.$inferSelect) {
  const now = new Date();
  // Auto-classify: if stored as "upcoming" but the event date has passed, show as "completed"
  let status = e.status;
  if (status === "upcoming" && e.eventDate < now) {
    status = "completed";
  }
  return {
    id: e.id,
    userId: e.userId,
    title: e.title,
    description: e.description ?? null,
    eventDate: e.eventDate.toISOString(),
    location: e.location ?? null,
    type: e.type ?? null,
    status,
    notes: e.notes ?? null,
    contractId: e.contractId ?? null,
    leadId: e.leadId ?? null,
    quoteId: e.quoteId ?? null,
    revenue: e.revenue ?? null,
    currency: e.currency ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export default router;
