import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, quotes, quoteItems, leads } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `Q-${year}-${rand}`;
}

function calcTotals(items: Array<{ quantity: string; unitPrice: string }>, taxRate: string) {
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.unitPrice), 0);
  const taxAmount = subtotal * (parseFloat(taxRate || "0") / 100);
  const total = subtotal + taxAmount;
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
}

async function updateLeadPipelineStage(leadId: string | null | undefined, stage: string, userId: string) {
  if (!leadId) return;
  await db.update(leads).set({ pipelineStage: stage, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)));
}

// GET /quotes
router.get("/quotes", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { status, leadId, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const conditions = [eq(quotes.userId, user.id)];
  if (status) conditions.push(eq(quotes.status, status as typeof quotes.status._.data));
  if (leadId) conditions.push(sql`${quotes.leadId} = ${leadId}`);

  const [rows, countRow] = await Promise.all([
    db.select().from(quotes).where(and(...conditions)).orderBy(desc(quotes.updatedAt)).limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)::int` }).from(quotes).where(and(...conditions)),
  ]);

  res.json({ items: rows, total: countRow[0]?.count ?? 0 });
});

// POST /quotes
router.post("/quotes", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    leadId, title, clientName, clientEmail, clientPhone, clientCompany, clientAddress,
    eventType, eventDate, eventLocation, currency, language,
    taxRate = "0", notes, terms, validUntil, items = [],
  } = req.body as {
    leadId?: string; title: string; clientName: string; clientEmail?: string; clientPhone?: string;
    clientCompany?: string; clientAddress?: string; eventType?: string; eventDate?: string;
    eventLocation?: string; currency?: string; language?: string;
    taxRate?: string; notes?: string; terms?: string; validUntil?: string;
    items?: Array<{ description: string; quantity: string; unitPrice: string; order?: number }>;
  };
  if (!title || !clientName) { res.status(400).json({ error: "title and clientName required" }); return; }

  // Auto-fill from lead if provided
  let resolvedClientName = clientName;
  let resolvedClientEmail = clientEmail;
  let resolvedClientPhone = clientPhone;
  let resolvedClientCompany = clientCompany;
  let resolvedClientAddress = clientAddress;
  let resolvedEventType = eventType;
  let resolvedEventDate = eventDate;

  if (leadId) {
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, user.id)));
    if (lead) {
      resolvedClientName = clientName || lead.contactName;
      resolvedClientEmail = clientEmail ?? lead.email ?? undefined;
      resolvedClientPhone = clientPhone ?? lead.phone ?? undefined;
      resolvedClientCompany = clientCompany ?? lead.companyName;
      resolvedClientAddress = clientAddress ?? lead.address ?? undefined;
      resolvedEventType = eventType ?? lead.eventType ?? undefined;
      resolvedEventDate = eventDate ?? (lead.expectedEventDate ? lead.expectedEventDate.toISOString() : undefined);
    }
  }

  const totals = calcTotals(items ?? [], taxRate);

  const [quote] = await db.insert(quotes).values({
    userId: user.id,
    leadId: leadId ?? null,
    quoteNumber: generateQuoteNumber(),
    title,
    clientName: resolvedClientName,
    clientEmail: resolvedClientEmail ?? null,
    clientPhone: resolvedClientPhone ?? null,
    clientCompany: resolvedClientCompany ?? null,
    clientAddress: resolvedClientAddress ?? null,
    eventType: resolvedEventType ?? null,
    eventDate: resolvedEventDate ? new Date(resolvedEventDate) : null,
    eventLocation: eventLocation ?? null,
    currency: currency ?? null,
    language: language ?? null,
    taxRate,
    ...totals,
    notes: notes ?? null,
    terms: terms ?? null,
    validUntil: validUntil ? new Date(validUntil) : null,
  }).returning();

  // Update lead pipeline stage
  if (leadId) await updateLeadPipelineStage(leadId, "quote_created", user.id);

  const itemRows = (items ?? []).length > 0 ? await db.insert(quoteItems).values(
    (items ?? []).map((item, i) => ({
      quoteId: quote.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: (parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2),
      order: item.order ?? i,
    }))
  ).returning() : [];

  res.status(201).json({ ...quote, items: itemRows });
});

// GET /quotes/:id
router.get("/quotes/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
  if (!quote) { res.status(404).json({ error: "Not found" }); return; }

  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(quoteItems.order);
  res.json({ ...quote, items });
});

// PUT /quotes/:id
router.put("/quotes/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const {
    leadId, title, clientName, clientEmail, clientPhone, clientCompany, clientAddress,
    eventType, eventDate, eventLocation, currency, language,
    taxRate, notes, terms, validUntil, items,
  } = req.body as {
    leadId?: string | null; title?: string; clientName?: string; clientEmail?: string | null;
    clientPhone?: string | null; clientCompany?: string | null; clientAddress?: string | null;
    eventType?: string | null; eventDate?: string | null; eventLocation?: string | null;
    currency?: string | null; language?: string | null;
    taxRate?: string; notes?: string | null; terms?: string | null;
    validUntil?: string; items?: Array<{ description: string; quantity: string; unitPrice: string; order?: number }>;
  };

  const newTaxRate = taxRate ?? existing.taxRate;
  const newItems = items ?? [];
  const totals = items ? calcTotals(newItems, newTaxRate) : { subtotal: existing.subtotal, taxAmount: existing.taxAmount, total: existing.total };

  const [updated] = await db.update(quotes).set({
    leadId: leadId !== undefined ? (leadId ?? null) : existing.leadId,
    title: title ?? existing.title,
    clientName: clientName ?? existing.clientName,
    clientEmail: clientEmail !== undefined ? clientEmail : existing.clientEmail,
    clientPhone: clientPhone !== undefined ? clientPhone : existing.clientPhone,
    clientCompany: clientCompany !== undefined ? clientCompany : existing.clientCompany,
    clientAddress: clientAddress !== undefined ? clientAddress : existing.clientAddress,
    eventType: eventType !== undefined ? eventType : existing.eventType,
    eventDate: eventDate !== undefined ? (eventDate ? new Date(eventDate) : null) : existing.eventDate,
    eventLocation: eventLocation !== undefined ? eventLocation : existing.eventLocation,
    currency: currency !== undefined ? currency : existing.currency,
    language: language !== undefined ? language : existing.language,
    taxRate: newTaxRate,
    ...totals,
    notes: notes !== undefined ? notes : existing.notes,
    terms: terms !== undefined ? terms : existing.terms,
    validUntil: validUntil ? new Date(validUntil) : existing.validUntil,
    updatedAt: new Date(),
  }).where(eq(quotes.id, id)).returning();

  if (items) {
    await db.delete(quoteItems).where(eq(quoteItems.quoteId, id));
    if (newItems.length > 0) {
      await db.insert(quoteItems).values(
        newItems.map((item, i) => ({
          quoteId: updated.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: (parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2),
          order: item.order ?? i,
        }))
      );
    }
  }

  const itemRows = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(quoteItems.order);
  res.json({ ...updated, items: itemRows });
});

// DELETE /quotes/:id
router.delete("/quotes/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(quotes).where(eq(quotes.id, id));
  res.status(204).send();
});

// PATCH /quotes/:id/status
router.patch("/quotes/:id/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { status } = req.body as { status: typeof quotes.status._.data };
  if (!status) { res.status(400).json({ error: "status required" }); return; }

  const extra: { sentAt?: Date; acceptedAt?: Date } = {};
  if (status === "sent") extra.sentAt = new Date();
  if (status === "accepted") extra.acceptedAt = new Date();

  const [updated] = await db.update(quotes).set({ status, ...extra, updatedAt: new Date() }).where(eq(quotes.id, id)).returning();

  // Update lead pipeline stage
  if (existing.leadId) {
    if (status === "sent") await updateLeadPipelineStage(existing.leadId, "quote_sent", user.id);
    else if (status === "accepted") await updateLeadPipelineStage(existing.leadId, "quote_accepted", user.id);
    else if (status === "declined") await updateLeadPipelineStage(existing.leadId, "lost", user.id);
  }

  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(quoteItems.order);
  res.json({ ...updated, items });
});

export default router;
