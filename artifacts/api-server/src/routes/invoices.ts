import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, invoices, invoiceItems, leads, quotes, contracts } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${year}-${rand}`;
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

// GET /invoices
router.get("/invoices", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const conditions = [eq(invoices.userId, user.id)];
  if (status) conditions.push(eq(invoices.status, status as typeof invoices.status._.data));

  const [rows, countRow] = await Promise.all([
    db.select().from(invoices).where(and(...conditions)).orderBy(desc(invoices.updatedAt)).limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(and(...conditions)),
  ]);

  res.json({ items: rows, total: countRow[0]?.count ?? 0 });
});

// POST /invoices
router.post("/invoices", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    leadId, quoteId, contractId, title, clientName, clientEmail, clientPhone, clientCompany,
    eventType, eventDate, currency, language,
    taxRate = "0", notes, terms, dueDate, items = [],
  } = req.body as {
    leadId?: string; quoteId?: string; contractId?: string; title: string; clientName: string;
    clientEmail?: string; clientPhone?: string; clientCompany?: string;
    eventType?: string; eventDate?: string; currency?: string; language?: string;
    taxRate?: string; notes?: string; terms?: string; dueDate?: string;
    items?: Array<{ description: string; quantity: string; unitPrice: string; order?: number }>;
  };
  if (!title || !clientName) { res.status(400).json({ error: "title and clientName required" }); return; }

  // Auto-fill from contract → quote → lead
  let resolvedClientName = clientName;
  let resolvedClientEmail = clientEmail;
  let resolvedClientPhone = clientPhone;
  let resolvedClientCompany = clientCompany;
  let resolvedEventType = eventType;
  let resolvedEventDate = eventDate;
  let resolvedLeadId = leadId;
  let resolvedQuoteId = quoteId;
  let resolvedCurrency = currency;
  let resolvedLanguage = language;
  let resolvedItems = items;
  let resolvedTaxRate = taxRate;

  if (contractId) {
    const [contract] = await db.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.userId, user.id)));
    if (contract) {
      resolvedClientName = clientName || contract.clientName;
      resolvedClientEmail = clientEmail ?? contract.clientEmail ?? undefined;
      resolvedClientPhone = clientPhone ?? contract.clientPhone ?? undefined;
      resolvedClientCompany = clientCompany ?? contract.clientCompany ?? undefined;
      resolvedEventType = eventType ?? contract.eventType ?? undefined;
      resolvedEventDate = eventDate ?? (contract.eventDate ? contract.eventDate.toISOString() : undefined);
      resolvedLeadId = leadId ?? contract.leadId ?? undefined;
      resolvedQuoteId = quoteId ?? contract.quoteId ?? undefined;
      resolvedCurrency = currency ?? contract.currency ?? undefined;
      resolvedLanguage = language ?? contract.language ?? undefined;
      // If no items provided, create a single line item from contract value
      if (!items || items.length === 0) {
        resolvedItems = [{ description: contract.title, quantity: "1", unitPrice: contract.value }];
      }
    }
  } else if (quoteId) {
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, user.id)));
    if (quote) {
      resolvedClientName = clientName || quote.clientName;
      resolvedClientEmail = clientEmail ?? quote.clientEmail ?? undefined;
      resolvedClientPhone = clientPhone ?? quote.clientPhone ?? undefined;
      resolvedClientCompany = clientCompany ?? quote.clientCompany ?? undefined;
      resolvedEventType = eventType ?? quote.eventType ?? undefined;
      resolvedEventDate = eventDate ?? (quote.eventDate ? quote.eventDate.toISOString() : undefined);
      resolvedLeadId = leadId ?? quote.leadId ?? undefined;
      resolvedCurrency = currency ?? quote.currency ?? undefined;
      resolvedLanguage = language ?? quote.language ?? undefined;
      resolvedTaxRate = taxRate ?? quote.taxRate;
    }
  } else if (leadId) {
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, user.id)));
    if (lead) {
      resolvedClientName = clientName || lead.contactName;
      resolvedClientEmail = clientEmail ?? lead.email ?? undefined;
      resolvedClientPhone = clientPhone ?? lead.phone ?? undefined;
      resolvedClientCompany = clientCompany ?? lead.companyName;
      resolvedEventType = eventType ?? lead.eventType ?? undefined;
      resolvedEventDate = eventDate ?? (lead.expectedEventDate ? lead.expectedEventDate.toISOString() : undefined);
    }
  }

  const totals = calcTotals(resolvedItems ?? [], resolvedTaxRate);

  const [invoice] = await db.insert(invoices).values({
    userId: user.id,
    leadId: resolvedLeadId ?? null,
    quoteId: resolvedQuoteId ?? null,
    contractId: contractId ?? null,
    invoiceNumber: generateInvoiceNumber(),
    title,
    clientName: resolvedClientName,
    clientEmail: resolvedClientEmail ?? null,
    clientPhone: resolvedClientPhone ?? null,
    clientCompany: resolvedClientCompany ?? null,
    eventType: resolvedEventType ?? null,
    eventDate: resolvedEventDate ? new Date(resolvedEventDate) : null,
    currency: resolvedCurrency ?? null,
    language: resolvedLanguage ?? null,
    taxRate: resolvedTaxRate,
    ...totals,
    notes: notes ?? null,
    terms: terms ?? null,
    dueDate: dueDate ? new Date(dueDate) : null,
  }).returning();

  // Update lead pipeline stage
  if (resolvedLeadId) await updateLeadPipelineStage(resolvedLeadId, "invoice_created", user.id);

  const itemRows = (resolvedItems ?? []).length > 0 ? await db.insert(invoiceItems).values(
    (resolvedItems ?? []).map((item, i) => ({
      invoiceId: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: (parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2),
      order: i,
    }))
  ).returning() : [];

  res.status(201).json({ ...invoice, items: itemRows });
});

// GET /invoices/:id
router.get("/invoices/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
  if (!invoice) { res.status(404).json({ error: "Not found" }); return; }

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(invoiceItems.order);
  res.json({ ...invoice, items });
});

// PUT /invoices/:id
router.put("/invoices/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const {
    leadId, quoteId, contractId, title, clientName, clientEmail, clientPhone, clientCompany,
    eventType, eventDate, currency, language,
    taxRate, notes, terms, dueDate, items,
  } = req.body as {
    leadId?: string | null; quoteId?: string | null; contractId?: string | null;
    title?: string; clientName?: string; clientEmail?: string | null; clientPhone?: string | null;
    clientCompany?: string | null; eventType?: string | null; eventDate?: string | null;
    currency?: string | null; language?: string | null;
    taxRate?: string; notes?: string | null; terms?: string | null; dueDate?: string;
    items?: Array<{ description: string; quantity: string; unitPrice: string; order?: number }>;
  };

  const newTaxRate = taxRate ?? existing.taxRate;
  const newItems = items ?? [];
  const totals = items ? calcTotals(newItems, newTaxRate) : { subtotal: existing.subtotal, taxAmount: existing.taxAmount, total: existing.total };

  const [updated] = await db.update(invoices).set({
    leadId: leadId !== undefined ? (leadId ?? null) : existing.leadId,
    quoteId: quoteId !== undefined ? (quoteId ?? null) : existing.quoteId,
    contractId: contractId !== undefined ? (contractId ?? null) : existing.contractId,
    title: title ?? existing.title,
    clientName: clientName ?? existing.clientName,
    clientEmail: clientEmail !== undefined ? clientEmail : existing.clientEmail,
    clientPhone: clientPhone !== undefined ? clientPhone : existing.clientPhone,
    clientCompany: clientCompany !== undefined ? clientCompany : existing.clientCompany,
    eventType: eventType !== undefined ? eventType : existing.eventType,
    eventDate: eventDate !== undefined ? (eventDate ? new Date(eventDate) : null) : existing.eventDate,
    currency: currency !== undefined ? currency : existing.currency,
    language: language !== undefined ? language : existing.language,
    taxRate: newTaxRate,
    ...totals,
    notes: notes !== undefined ? notes : existing.notes,
    terms: terms !== undefined ? terms : existing.terms,
    dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
    updatedAt: new Date(),
  }).where(eq(invoices.id, id)).returning();

  if (items) {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    if (newItems.length > 0) {
      await db.insert(invoiceItems).values(
        newItems.map((item, i) => ({
          invoiceId: updated.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: (parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2),
          order: item.order ?? i,
        }))
      );
    }
  }

  const itemRows = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(invoiceItems.order);
  res.json({ ...updated, items: itemRows });
});

// DELETE /invoices/:id
router.delete("/invoices/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(invoices).where(eq(invoices.id, id));
  res.status(204).send();
});

// PATCH /invoices/:id/status
router.patch("/invoices/:id/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { status, paidAmount, paymentMethod, paymentReference } = req.body as {
    status: typeof invoices.status._.data;
    paidAmount?: string; paymentMethod?: string; paymentReference?: string;
  };
  if (!status) { res.status(400).json({ error: "status required" }); return; }

  const extra: { sentAt?: Date; paidAt?: Date; paidAmount?: string; paymentMethod?: string; paymentReference?: string } = {};
  if (status === "sent") extra.sentAt = new Date();
  if (status === "paid") {
    extra.paidAt = new Date();
    if (paidAmount) extra.paidAmount = paidAmount;
    if (paymentMethod) extra.paymentMethod = paymentMethod;
    if (paymentReference) extra.paymentReference = paymentReference;
  }

  const [updated] = await db.update(invoices).set({ status, ...extra, updatedAt: new Date() }).where(eq(invoices.id, id)).returning();

  // Update lead pipeline stage and status on payment
  if (existing.leadId) {
    if (status === "paid") {
      await db.update(leads).set({
        pipelineStage: "won",
        status: "won",
        updatedAt: new Date(),
      }).where(and(eq(leads.id, existing.leadId), eq(leads.userId, user.id)));
    }
  }

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(invoiceItems.order);
  res.json({ ...updated, items });
});

export default router;
