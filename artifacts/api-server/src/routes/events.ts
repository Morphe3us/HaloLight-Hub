import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, asc, desc, count, gte, sql } from "drizzle-orm";
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
  const items = await db
    .select()
    .from(events)
    .where(
      status
        ? and(
            eq(events.userId, user.id),
            eq(events.status, status as "upcoming" | "active" | "completed" | "cancelled"),
            status === "upcoming" ? gte(events.eventDate, now) : undefined
          )
        : eq(events.userId, user.id)
    )
    .orderBy(status === "upcoming" ? asc(events.eventDate) : desc(events.eventDate))
    .limit(limit)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(events)
    .where(eq(events.userId, user.id));

  res.json({ items: items.map(formatEvent), total });
});

// POST /events
router.post("/events", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    title, description, eventDate, location, type, notes,
    clientName, clientEmail, clientPhone, clientCompany,
    eventStartTime, eventEndTime, packageName, rentalDuration, includedPrints,
    equipmentIds, equipmentDescription, optionsList,
    revenue, currency, paymentStatus,
  } = req.body as {
    title: string; description?: string; eventDate: string;
    location?: string; type?: string; notes?: string;
    clientName?: string; clientEmail?: string; clientPhone?: string; clientCompany?: string;
    eventStartTime?: string; eventEndTime?: string;
    packageName?: string; rentalDuration?: string; includedPrints?: string;
    equipmentIds?: string[]; equipmentDescription?: string; optionsList?: string;
    revenue?: string; currency?: string; paymentStatus?: string;
  };

  const [event] = await db.insert(events).values({
    userId: user.id,
    title,
    description,
    eventDate: new Date(eventDate),
    location,
    type,
    notes,
    clientName: clientName ?? null,
    clientEmail: clientEmail ?? null,
    clientPhone: clientPhone ?? null,
    clientCompany: clientCompany ?? null,
    eventStartTime: eventStartTime ?? null,
    eventEndTime: eventEndTime ?? null,
    packageName: packageName ?? null,
    rentalDuration: rentalDuration ?? null,
    includedPrints: includedPrints ?? null,
    equipmentIds: equipmentIds ?? null,
    equipmentDescription: equipmentDescription ?? null,
    optionsList: optionsList ?? null,
    revenue: revenue ?? null,
    currency: currency ?? null,
    paymentStatus: paymentStatus ?? null,
  }).returning();

  res.status(201).json(formatEvent(event));
});

// GET /events/:id
router.get("/events/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [event] = await db.select().from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, user.id)));

  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(formatEvent(event));
});

// PATCH /events/:id
router.patch("/events/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [existing] = await db.select().from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, user.id)));

  if (!existing) { res.status(404).json({ error: "Event not found" }); return; }

  const {
    title, description, eventDate, location, type, status, notes,
    clientName, clientEmail, clientPhone, clientCompany,
    eventStartTime, eventEndTime, packageName, rentalDuration, includedPrints,
    equipmentIds, equipmentDescription, optionsList,
    revenue, currency, paymentStatus, invoiceId,
  } = req.body as {
    title?: string; description?: string; eventDate?: string;
    location?: string; type?: string;
    status?: "upcoming" | "active" | "completed" | "cancelled";
    notes?: string;
    clientName?: string; clientEmail?: string; clientPhone?: string; clientCompany?: string;
    eventStartTime?: string; eventEndTime?: string;
    packageName?: string; rentalDuration?: string; includedPrints?: string;
    equipmentIds?: string[]; equipmentDescription?: string; optionsList?: string;
    revenue?: string; currency?: string; paymentStatus?: string; invoiceId?: string;
  };

  const [updated] = await db.update(events).set({
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(eventDate !== undefined && { eventDate: new Date(eventDate) }),
    ...(location !== undefined && { location }),
    ...(type !== undefined && { type }),
    ...(status !== undefined && { status }),
    ...(notes !== undefined && { notes }),
    ...(clientName !== undefined && { clientName }),
    ...(clientEmail !== undefined && { clientEmail }),
    ...(clientPhone !== undefined && { clientPhone }),
    ...(clientCompany !== undefined && { clientCompany }),
    ...(eventStartTime !== undefined && { eventStartTime }),
    ...(eventEndTime !== undefined && { eventEndTime }),
    ...(packageName !== undefined && { packageName }),
    ...(rentalDuration !== undefined && { rentalDuration }),
    ...(includedPrints !== undefined && { includedPrints }),
    ...(equipmentIds !== undefined && { equipmentIds }),
    ...(equipmentDescription !== undefined && { equipmentDescription }),
    ...(optionsList !== undefined && { optionsList }),
    ...(revenue !== undefined && { revenue }),
    ...(currency !== undefined && { currency }),
    ...(paymentStatus !== undefined && { paymentStatus }),
    ...(invoiceId !== undefined && { invoiceId }),
    updatedAt: new Date(),
  }).where(and(eq(events.id, eventId), eq(events.userId, user.id))).returning();

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
  let status = e.status;
  if (status === "upcoming" && e.eventDate < now) status = "completed";

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
    leadId: e.leadId ?? null,
    quoteId: e.quoteId ?? null,
    contractId: e.contractId ?? null,
    invoiceId: e.invoiceId ?? null,
    clientName: e.clientName ?? null,
    clientEmail: e.clientEmail ?? null,
    clientPhone: e.clientPhone ?? null,
    clientCompany: e.clientCompany ?? null,
    eventStartTime: e.eventStartTime ?? null,
    eventEndTime: e.eventEndTime ?? null,
    packageName: e.packageName ?? null,
    rentalDuration: e.rentalDuration ?? null,
    includedPrints: e.includedPrints ?? null,
    equipmentIds: (e.equipmentIds as string[] | null) ?? null,
    equipmentDescription: e.equipmentDescription ?? null,
    optionsList: e.optionsList ?? null,
    revenue: e.revenue ?? null,
    currency: e.currency ?? null,
    paymentStatus: e.paymentStatus ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export default router;
