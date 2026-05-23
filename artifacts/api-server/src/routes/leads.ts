import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import { db, leads, leadActivities } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /leads
router.get("/leads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { status, search, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const conditions = [eq(leads.userId, user.id)];
  if (status) conditions.push(eq(leads.status, status as typeof leads.status._.data));
  if (search) {
    conditions.push(
      or(
        ilike(leads.companyName, `%${search}%`),
        ilike(leads.contactName, `%${search}%`),
        ilike(leads.email!, `%${search}%`)
      )!
    );
  }

  const [rows, countRow] = await Promise.all([
    db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.updatedAt)).limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(and(...conditions)),
  ]);

  res.json({ items: rows, total: countRow[0]?.count ?? 0 });
});

// POST /leads
router.post("/leads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { companyName, contactName, email, phone, source, status, value, notes, address, eventType, expectedEventDate } = req.body as {
    companyName: string; contactName: string; email?: string; phone?: string; source?: string;
    status?: string; value?: string; notes?: string; address?: string; eventType?: string; expectedEventDate?: string;
  };
  if (!companyName || !contactName) { res.status(400).json({ error: "companyName and contactName required" }); return; }

  const [lead] = await db.insert(leads).values({
    userId: user.id,
    companyName,
    contactName,
    email: email ?? null,
    phone: phone ?? null,
    source: (source as typeof leads.source._.data) ?? "other",
    status: (status as typeof leads.status._.data) ?? "new",
    value: value ?? "0",
    notes: notes ?? null,
    address: address ?? null,
    eventType: eventType ?? null,
    expectedEventDate: expectedEventDate ? new Date(expectedEventDate) : null,
  }).returning();

  res.status(201).json(lead);
});

// GET /leads/:id
router.get("/leads/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, user.id)));
  if (!lead) { res.status(404).json({ error: "Not found" }); return; }

  const activities = await db.select().from(leadActivities).where(eq(leadActivities.leadId, id)).orderBy(desc(leadActivities.createdAt));
  res.json({ ...lead, activities });
});

// PUT /leads/:id
router.put("/leads/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { companyName, contactName, email, phone, source, status, value, notes, address, eventType, expectedEventDate } = req.body as {
    companyName?: string; contactName?: string; email?: string | null; phone?: string | null;
    source?: string; status?: string; value?: string; notes?: string | null; address?: string | null;
    eventType?: string | null; expectedEventDate?: string;
  };

  const [updated] = await db.update(leads).set({
    companyName: companyName ?? existing.companyName,
    contactName: contactName ?? existing.contactName,
    email: email !== undefined ? email : existing.email,
    phone: phone !== undefined ? phone : existing.phone,
    source: source ? (source as typeof leads.source._.data) : existing.source,
    status: status ? (status as typeof leads.status._.data) : existing.status,
    value: value ?? existing.value,
    notes: notes !== undefined ? notes : existing.notes,
    address: address !== undefined ? address : existing.address,
    eventType: eventType !== undefined ? eventType : existing.eventType,
    expectedEventDate: expectedEventDate ? new Date(expectedEventDate) : existing.expectedEventDate,
    updatedAt: new Date(),
  }).where(eq(leads.id, id)).returning();

  res.json(updated);
});

// DELETE /leads/:id
router.delete("/leads/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(leads).where(eq(leads.id, id));
  res.status(204).send();
});

// POST /leads/:id/activities
router.post("/leads/:id/activities", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, user.id)));
  if (!lead) { res.status(404).json({ error: "Not found" }); return; }

  const { type, title, description } = req.body as {
    type: typeof leadActivities.type._.data; title: string; description?: string;
  };
  if (!type || !title) { res.status(400).json({ error: "type and title required" }); return; }

  const [activity] = await db.insert(leadActivities).values({
    leadId: id,
    userId: user.id,
    type,
    title,
    description: description ?? null,
  }).returning();

  res.status(201).json(activity);
});

export default router;
