import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { db, invoices, invoiceItems, leads, quotes, contracts, events } from "@workspace/db";
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

/**
 * When an invoice is marked paid, create or update a linked event.
 * Deduplication priority:
 *   1. invoiceId match
 *   2. contractId match
 *   3. quoteId match
 *   4. clientEmail + eventDate match (within same day)
 */
async function upsertEventFromInvoice(inv: typeof invoices.$inferSelect, userId: string) {
  if (!inv.eventDate) return; // no date = can't create a meaningful event

  const eventTitle = [inv.clientName, inv.eventType, inv.packageName]
    .filter(Boolean).join(" — ") || inv.title;

  const serviceData = {
    clientName: inv.clientName,
    clientEmail: inv.clientEmail ?? undefined,
    clientPhone: inv.clientPhone ?? undefined,
    clientCompany: inv.clientCompany ?? undefined,
    eventStartTime: inv.eventStartTime ?? undefined,
    eventEndTime: inv.eventEndTime ?? undefined,
    packageName: inv.packageName ?? undefined,
    rentalDuration: inv.rentalDuration ?? undefined,
    includedPrints: inv.includedPrints ?? undefined,
    equipmentIds: (inv.equipmentIds as string[] | null) ?? undefined,
    equipmentDescription: inv.equipmentDescription ?? undefined,
    optionsList: inv.optionsList ?? undefined,
    revenue: inv.total,
    currency: inv.currency ?? undefined,
    paymentStatus: "paid",
    invoiceId: inv.id,
    contractId: inv.contractId ?? undefined,
    quoteId: inv.quoteId ?? undefined,
    leadId: inv.leadId ?? undefined,
  };

  // Find existing event by deduplication
  let existingId: string | null = null;

  // 1. By invoiceId
  const [byInvoice] = await db.select({ id: events.id })
    .from(events)
    .where(and(eq(events.userId, userId), sql`${events.invoiceId} = ${inv.id}`));
  if (byInvoice) { existingId = byInvoice.id; }

  // 2. By contractId
  if (!existingId && inv.contractId) {
    const [byContract] = await db.select({ id: events.id })
      .from(events)
      .where(and(eq(events.userId, userId), sql`${events.contractId} = ${inv.contractId}`));
    if (byContract) { existingId = byContract.id; }
  }

  // 3. By quoteId
  if (!existingId && inv.quoteId) {
    const [byQuote] = await db.select({ id: events.id })
      .from(events)
      .where(and(eq(events.userId, userId), sql`${events.quoteId} = ${inv.quoteId}`));
    if (byQuote) { existingId = byQuote.id; }
  }

  // 4. By clientEmail + eventDate (same calendar day)
  if (!existingId && inv.clientEmail && inv.eventDate) {
    const dayStart = new Date(inv.eventDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(inv.eventDate);
    dayEnd.setHours(23, 59, 59, 999);
    const [byEmailDate] = await db.select({ id: events.id })
      .from(events)
      .where(and(
        eq(events.userId, userId),
        sql`${events.clientEmail} = ${inv.clientEmail}`,
        gte(events.eventDate, dayStart),
        sql`${events.eventDate} <= ${dayEnd}`,
      ));
    if (byEmailDate) { existingId = byEmailDate.id; }
  }

  if (existingId) {
    // Update existing event — only overwrite non-null incoming values
    await db.update(events).set({
      ...(serviceData.clientName && { clientName: serviceData.clientName }),
      ...(serviceData.clientEmail && { clientEmail: serviceData.clientEmail }),
      ...(serviceData.clientPhone && { clientPhone: serviceData.clientPhone }),
      ...(serviceData.clientCompany && { clientCompany: serviceData.clientCompany }),
      ...(serviceData.packageName && { packageName: serviceData.packageName }),
      ...(serviceData.rentalDuration && { rentalDuration: serviceData.rentalDuration }),
      ...(serviceData.includedPrints && { includedPrints: serviceData.includedPrints }),
      ...(serviceData.equipmentIds?.length && { equipmentIds: serviceData.equipmentIds }),
      ...(serviceData.equipmentDescription && { equipmentDescription: serviceData.equipmentDescription }),
      ...(serviceData.optionsList && { optionsList: serviceData.optionsList }),
      ...(serviceData.eventStartTime && { eventStartTime: serviceData.eventStartTime }),
      ...(serviceData.eventEndTime && { eventEndTime: serviceData.eventEndTime }),
      revenue: inv.total,
      currency: inv.currency ?? undefined,
      paymentStatus: "paid",
      invoiceId: inv.id,
      updatedAt: new Date(),
    }).where(eq(events.id, existingId));
  } else {
    // Create new event
    await db.insert(events).values({
      userId,
      title: eventTitle,
      eventDate: inv.eventDate,
      location: inv.eventLocation ?? null,
      type: inv.eventType ?? null,
      status: "upcoming",
      ...serviceData,
    } as typeof events.$inferInsert);
  }
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
    leadId, quoteId, contractId, title, clientName, clientEmail, clientPhone, clientCompany, clientAddress,
    eventType, eventDate, eventLocation, currency, language,
    eventStartTime, eventEndTime, packageName, rentalDuration, includedPrints,
    digitalGallery, customTemplate, deliveryIncluded, setupIncluded, operatorIncluded,
    equipmentIds, equipmentDescription, optionsList,
    rentalPrice, optionsPrice, deliveryFees, discountAmount,
    taxRate = "0", notes, terms, dueDate, items,
  } = req.body as {
    leadId?: string; quoteId?: string; contractId?: string;
    title?: string; clientName: string; clientEmail?: string; clientPhone?: string;
    clientCompany?: string; clientAddress?: string;
    eventType?: string; eventDate?: string; eventLocation?: string;
    currency?: string; language?: string;
    eventStartTime?: string; eventEndTime?: string;
    packageName?: string; rentalDuration?: string; includedPrints?: string;
    digitalGallery?: boolean; customTemplate?: boolean; deliveryIncluded?: boolean;
    setupIncluded?: boolean; operatorIncluded?: boolean;
    equipmentIds?: string[]; equipmentDescription?: string; optionsList?: string;
    rentalPrice?: string; optionsPrice?: string; deliveryFees?: string; discountAmount?: string;
    taxRate?: string; notes?: string; terms?: string; dueDate?: string;
    items?: Array<{ description: string; quantity: string; unitPrice: string; order?: number }>;
  };
  if (!clientName) { res.status(400).json({ error: "clientName required" }); return; }

  let lineItems = items as Array<{ description: string; quantity: string; unitPrice: string; order?: number }> | undefined;

  // Start with form values
  let r = {
    clientName, clientEmail, clientPhone, clientCompany, clientAddress,
    eventType, eventDate, eventLocation, currency, language,
    eventStartTime, eventEndTime, packageName, rentalDuration, includedPrints,
    digitalGallery: digitalGallery ?? false,
    customTemplate: customTemplate ?? false,
    deliveryIncluded: deliveryIncluded ?? false,
    setupIncluded: setupIncluded ?? false,
    operatorIncluded: operatorIncluded ?? false,
    equipmentIds, equipmentDescription, optionsList,
    rentalPrice, optionsPrice, deliveryFees, discountAmount,
    leadId, quoteId, taxRate,
  };

  // Auto-fill from contract → quote → lead (most authoritative source first)
  if (contractId) {
    const [contract] = await db.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.userId, user.id)));
    if (contract) {
      r.clientName = clientName || contract.clientName;
      r.clientEmail = clientEmail ?? contract.clientEmail ?? undefined;
      r.clientPhone = clientPhone ?? contract.clientPhone ?? undefined;
      r.clientCompany = clientCompany ?? contract.clientCompany ?? undefined;
      r.clientAddress = clientAddress ?? contract.clientAddress ?? undefined;
      r.eventType = eventType ?? contract.eventType ?? undefined;
      r.eventDate = eventDate ?? (contract.eventDate ? contract.eventDate.toISOString() : undefined);
      r.currency = currency ?? contract.currency ?? undefined;
      r.language = language ?? contract.language ?? undefined;
      r.leadId = leadId ?? contract.leadId ?? undefined;
      r.quoteId = quoteId ?? contract.quoteId ?? undefined;
      r.equipmentIds = equipmentIds ?? (contract.equipmentIds as string[] | null) ?? undefined;
      // Create a single line item from contract value if none provided
      if (!lineItems || lineItems.length === 0) {
        lineItems = [{ description: contract.title, quantity: "1", unitPrice: contract.value }];
      }
    }
  } else if (quoteId) {
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, user.id)));
    if (quote) {
      r.clientName = clientName || quote.clientName;
      r.clientEmail = clientEmail ?? quote.clientEmail ?? undefined;
      r.clientPhone = clientPhone ?? quote.clientPhone ?? undefined;
      r.clientCompany = clientCompany ?? quote.clientCompany ?? undefined;
      r.clientAddress = clientAddress ?? quote.clientAddress ?? undefined;
      r.eventType = eventType ?? quote.eventType ?? undefined;
      r.eventDate = eventDate ?? (quote.eventDate ? quote.eventDate.toISOString() : undefined);
      r.eventLocation = eventLocation ?? quote.eventLocation ?? undefined;
      r.eventStartTime = eventStartTime ?? quote.eventStartTime ?? undefined;
      r.eventEndTime = eventEndTime ?? quote.eventEndTime ?? undefined;
      r.packageName = packageName ?? quote.packageName ?? undefined;
      r.rentalDuration = rentalDuration ?? quote.rentalDuration ?? undefined;
      r.includedPrints = includedPrints ?? quote.includedPrints ?? undefined;
      r.digitalGallery = digitalGallery ?? quote.digitalGallery;
      r.customTemplate = customTemplate ?? quote.customTemplate;
      r.deliveryIncluded = deliveryIncluded ?? quote.deliveryIncluded;
      r.setupIncluded = setupIncluded ?? quote.setupIncluded;
      r.operatorIncluded = operatorIncluded ?? quote.operatorIncluded;
      r.equipmentIds = equipmentIds ?? (quote.equipmentIds as string[] | null) ?? undefined;
      r.equipmentDescription = equipmentDescription ?? quote.equipmentDescription ?? undefined;
      r.optionsList = optionsList ?? quote.optionsList ?? undefined;
      r.rentalPrice = rentalPrice ?? quote.rentalPrice ?? undefined;
      r.optionsPrice = optionsPrice ?? quote.optionsPrice ?? undefined;
      r.deliveryFees = deliveryFees ?? quote.deliveryFees ?? undefined;
      r.discountAmount = discountAmount ?? quote.discountAmount ?? undefined;
      r.currency = currency ?? quote.currency ?? undefined;
      r.language = language ?? quote.language ?? undefined;
      r.leadId = leadId ?? quote.leadId ?? undefined;
      r.taxRate = taxRate ?? quote.taxRate;
    }
  } else if (leadId) {
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, user.id)));
    if (lead) {
      r.clientName = clientName || lead.contactName;
      r.clientEmail = clientEmail ?? lead.email ?? undefined;
      r.clientPhone = clientPhone ?? lead.phone ?? undefined;
      r.clientCompany = clientCompany ?? lead.companyName;
      r.eventType = eventType ?? lead.eventType ?? undefined;
      r.eventDate = eventDate ?? (lead.expectedEventDate ? lead.expectedEventDate.toISOString() : undefined);
    }
  }

  const resolvedItems = (lineItems ?? []) as Array<{ description: string; quantity: string; unitPrice: string; order?: number }>;
  const totals = calcTotals(resolvedItems, r.taxRate ?? "0");

  const autoTitle = (title ?? "").trim() ||
    [r.clientName, r.eventType || null].filter(Boolean).join(" — ") ||
    "Invoice";

  const [invoice] = await db.insert(invoices).values({
    userId: user.id,
    leadId: r.leadId ?? null,
    quoteId: quoteId ?? null,
    contractId: contractId ?? null,
    invoiceNumber: generateInvoiceNumber(),
    title: autoTitle,
    clientName: r.clientName,
    clientEmail: r.clientEmail ?? null,
    clientPhone: r.clientPhone ?? null,
    clientCompany: r.clientCompany ?? null,
    clientAddress: r.clientAddress ?? null,
    eventType: r.eventType ?? null,
    eventDate: r.eventDate ? new Date(r.eventDate) : null,
    eventLocation: r.eventLocation ?? null,
    eventStartTime: r.eventStartTime ?? null,
    eventEndTime: r.eventEndTime ?? null,
    packageName: r.packageName ?? null,
    rentalDuration: r.rentalDuration ?? null,
    includedPrints: r.includedPrints ?? null,
    digitalGallery: r.digitalGallery,
    customTemplate: r.customTemplate,
    deliveryIncluded: r.deliveryIncluded,
    setupIncluded: r.setupIncluded,
    operatorIncluded: r.operatorIncluded,
    equipmentIds: r.equipmentIds ?? null,
    equipmentDescription: r.equipmentDescription ?? null,
    optionsList: r.optionsList ?? null,
    rentalPrice: r.rentalPrice ?? null,
    optionsPrice: r.optionsPrice ?? null,
    deliveryFees: r.deliveryFees ?? null,
    discountAmount: r.discountAmount ?? null,
    currency: r.currency ?? null,
    language: r.language ?? null,
    taxRate: r.taxRate ?? "0",
    ...totals,
    notes: notes ?? null,
    terms: terms ?? null,
    dueDate: dueDate ? new Date(dueDate) : null,
  }).returning();

  if (r.leadId) await updateLeadPipelineStage(r.leadId, "invoice_created", user.id);

  const itemRows = resolvedItems.length > 0 ? await db.insert(invoiceItems).values(
    resolvedItems.map((item, i) => ({
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
    leadId, quoteId, contractId, title, clientName, clientEmail, clientPhone, clientCompany, clientAddress,
    eventType, eventDate, eventLocation, currency, language,
    eventStartTime, eventEndTime, packageName, rentalDuration, includedPrints,
    digitalGallery, customTemplate, deliveryIncluded, setupIncluded, operatorIncluded,
    equipmentIds, equipmentDescription, optionsList,
    rentalPrice, optionsPrice, deliveryFees, discountAmount,
    taxRate, notes, terms, dueDate, items,
  } = req.body as {
    leadId?: string | null; quoteId?: string | null; contractId?: string | null;
    title?: string; clientName?: string; clientEmail?: string | null; clientPhone?: string | null;
    clientCompany?: string | null; clientAddress?: string | null;
    eventType?: string | null; eventDate?: string | null; eventLocation?: string | null;
    currency?: string | null; language?: string | null;
    eventStartTime?: string | null; eventEndTime?: string | null;
    packageName?: string | null; rentalDuration?: string | null; includedPrints?: string | null;
    digitalGallery?: boolean; customTemplate?: boolean; deliveryIncluded?: boolean;
    setupIncluded?: boolean; operatorIncluded?: boolean;
    equipmentIds?: string[] | null; equipmentDescription?: string | null; optionsList?: string | null;
    rentalPrice?: string | null; optionsPrice?: string | null; deliveryFees?: string | null; discountAmount?: string | null;
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
    clientAddress: clientAddress !== undefined ? clientAddress : existing.clientAddress,
    eventType: eventType !== undefined ? eventType : existing.eventType,
    eventDate: eventDate !== undefined ? (eventDate ? new Date(eventDate) : null) : existing.eventDate,
    eventLocation: eventLocation !== undefined ? eventLocation : existing.eventLocation,
    eventStartTime: eventStartTime !== undefined ? eventStartTime : existing.eventStartTime,
    eventEndTime: eventEndTime !== undefined ? eventEndTime : existing.eventEndTime,
    packageName: packageName !== undefined ? packageName : existing.packageName,
    rentalDuration: rentalDuration !== undefined ? rentalDuration : existing.rentalDuration,
    includedPrints: includedPrints !== undefined ? includedPrints : existing.includedPrints,
    digitalGallery: digitalGallery !== undefined ? digitalGallery : existing.digitalGallery,
    customTemplate: customTemplate !== undefined ? customTemplate : existing.customTemplate,
    deliveryIncluded: deliveryIncluded !== undefined ? deliveryIncluded : existing.deliveryIncluded,
    setupIncluded: setupIncluded !== undefined ? setupIncluded : existing.setupIncluded,
    operatorIncluded: operatorIncluded !== undefined ? operatorIncluded : existing.operatorIncluded,
    equipmentIds: equipmentIds !== undefined ? equipmentIds : existing.equipmentIds,
    equipmentDescription: equipmentDescription !== undefined ? equipmentDescription : existing.equipmentDescription,
    optionsList: optionsList !== undefined ? optionsList : existing.optionsList,
    rentalPrice: rentalPrice !== undefined ? rentalPrice : existing.rentalPrice,
    optionsPrice: optionsPrice !== undefined ? optionsPrice : existing.optionsPrice,
    deliveryFees: deliveryFees !== undefined ? deliveryFees : existing.deliveryFees,
    discountAmount: discountAmount !== undefined ? discountAmount : existing.discountAmount,
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

  // Update lead pipeline on payment
  if (existing.leadId && status === "paid") {
    await db.update(leads).set({
      pipelineStage: "won",
      status: "won",
      updatedAt: new Date(),
    }).where(and(eq(leads.id, existing.leadId), eq(leads.userId, user.id)));
  }

  // Auto-create or update event when invoice is paid
  if (status === "paid") {
    try {
      await upsertEventFromInvoice(updated, user.id);
    } catch (err) {
      // Non-fatal: log but don't fail the invoice update
      req.log?.warn({ err }, "Failed to upsert event from paid invoice");
    }
  }

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(invoiceItems.order);
  res.json({ ...updated, items });
});

export default router;
