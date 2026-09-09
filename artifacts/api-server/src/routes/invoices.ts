import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import {
  db,
  invoices,
  invoiceItems,
  leads,
  quotes,
  quoteItems,
  contracts,
  events,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { validateOwnedLinks } from "../lib/ownership";
import { getOrCreateUser } from "../lib/userSync";
import { calculateQuoteTotals } from "../lib/quotePricing";
import { nextInvoiceNumber } from "../lib/documentNumberQueries";
import { parseOptionalDateInput } from "../lib/dateInput";

const router: IRouter = Router();

type InvoiceItemInput = {
  description: string;
  quantity: string;
  unitPrice: string;
  order?: number;
};

type InvoicePricingFields = {
  rentalPrice?: string | null;
  optionsPrice?: string | null;
  deliveryFees?: string | null;
  discountAmount?: string | null;
};

function parseFiniteAmount(value: string, field: string): number | string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${field} must be a valid number`;
  return parsed;
}

function validateInvoiceItems(items: InvoiceItemInput[]): string | null {
  for (const [index, item] of items.entries()) {
    if (!item.description?.trim()) {
      return `items[${index}].description is required`;
    }

    const quantity = parseFiniteAmount(
      item.quantity,
      `items[${index}].quantity`,
    );
    if (typeof quantity === "string") return quantity;
    if (quantity <= 0) return `items[${index}].quantity must be greater than 0`;

    const unitPrice = parseFiniteAmount(
      item.unitPrice,
      `items[${index}].unitPrice`,
    );
    if (typeof unitPrice === "string") return unitPrice;
    if (unitPrice < 0) return `items[${index}].unitPrice cannot be negative`;
  }

  return null;
}

function invoiceItemRowsForInsert(invoiceId: string, items: InvoiceItemInput[]) {
  return items.map((item, i) => ({
    invoiceId,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: (Number(item.quantity) * Number(item.unitPrice)).toFixed(2),
    order: item.order ?? i,
  }));
}

function calculateInvoiceTotals(
  items: InvoiceItemInput[],
  pricing: InvoicePricingFields,
  taxRate: string | null | undefined,
) {
  return calculateQuoteTotals(items, pricing, taxRate);
}

function conflictingSourceLink(
  provided: string | null | undefined,
  source: string | null | undefined,
  field: string,
): string | null {
  if (!provided) return null;
  if (source && provided === source) return null;
  return `${field} does not match the selected source document`;
}

/**
 * When an invoice is marked paid, create or update a linked event.
 * Deduplication priority:
 *   1. invoiceId match
 *   2. contractId match
 *   3. quoteId match
 *   4. clientEmail + eventDate match (within same day)
 */
async function upsertEventFromInvoice(
  inv: typeof invoices.$inferSelect,
  userId: string,
) {
  if (!inv.eventDate) return; // no date = can't create a meaningful event

  const linkValidation = await validateOwnedLinks(userId, {
    leadId: inv.leadId,
    quoteId: inv.quoteId,
    contractId: inv.contractId,
    invoiceId: inv.id,
    equipmentIds: inv.equipmentIds ?? null,
  });
  if (!linkValidation.ok) {
    throw new Error(`Invalid invoice event links: ${linkValidation.error}`);
  }

  const eventTitle =
    [inv.clientName, inv.eventType, inv.packageName]
      .filter(Boolean)
      .join(" — ") || inv.title;

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
  const [byInvoice] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(eq(events.userId, userId), sql`${events.invoiceId} = ${inv.id}`),
    );
  if (byInvoice) {
    existingId = byInvoice.id;
  }

  // 2. By contractId
  if (!existingId && inv.contractId) {
    const [byContract] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          sql`${events.contractId} = ${inv.contractId}`,
        ),
      );
    if (byContract) {
      existingId = byContract.id;
    }
  }

  // 3. By quoteId
  if (!existingId && inv.quoteId) {
    const [byQuote] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(eq(events.userId, userId), sql`${events.quoteId} = ${inv.quoteId}`),
      );
    if (byQuote) {
      existingId = byQuote.id;
    }
  }

  // 4. By clientEmail + eventDate (same calendar day)
  if (!existingId && inv.clientEmail && inv.eventDate) {
    const dayStart = new Date(inv.eventDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(inv.eventDate);
    dayEnd.setHours(23, 59, 59, 999);
    const [byEmailDate] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          sql`${events.clientEmail} = ${inv.clientEmail}`,
          gte(events.eventDate, dayStart),
          sql`${events.eventDate} <= ${dayEnd}`,
        ),
      );
    if (byEmailDate) {
      existingId = byEmailDate.id;
    }
  }

  if (existingId) {
    // Update existing event — only overwrite non-null incoming values
    await db
      .update(events)
      .set({
        ...(serviceData.clientName && { clientName: serviceData.clientName }),
        ...(serviceData.clientEmail && {
          clientEmail: serviceData.clientEmail,
        }),
        ...(serviceData.clientPhone && {
          clientPhone: serviceData.clientPhone,
        }),
        ...(serviceData.clientCompany && {
          clientCompany: serviceData.clientCompany,
        }),
        ...(serviceData.packageName && {
          packageName: serviceData.packageName,
        }),
        ...(serviceData.rentalDuration && {
          rentalDuration: serviceData.rentalDuration,
        }),
        ...(serviceData.includedPrints && {
          includedPrints: serviceData.includedPrints,
        }),
        ...(serviceData.equipmentIds?.length && {
          equipmentIds: serviceData.equipmentIds,
        }),
        ...(serviceData.equipmentDescription && {
          equipmentDescription: serviceData.equipmentDescription,
        }),
        ...(serviceData.optionsList && {
          optionsList: serviceData.optionsList,
        }),
        ...(serviceData.eventStartTime && {
          eventStartTime: serviceData.eventStartTime,
        }),
        ...(serviceData.eventEndTime && {
          eventEndTime: serviceData.eventEndTime,
        }),
        revenue: inv.total,
        currency: inv.currency ?? undefined,
        paymentStatus: "paid",
        leadId: inv.leadId ?? null,
        quoteId: inv.quoteId ?? null,
        contractId: inv.contractId ?? null,
        invoiceId: inv.id,
        equipmentIds: (inv.equipmentIds as string[] | null) ?? null,
        updatedAt: new Date(),
      })
      .where(eq(events.id, existingId));
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
router.get(
  "/invoices",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      status,
      limit = "50",
      offset = "0",
    } = req.query as Record<string, string>;

    const conditions = [eq(invoices.userId, user.id)];
    if (status)
      conditions.push(
        eq(invoices.status, status as typeof invoices.status._.data),
      );

    const [rows, countRow] = await Promise.all([
      db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.updatedAt))
        .limit(Number(limit))
        .offset(Number(offset)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(...conditions)),
    ]);

    res.json({ items: rows, total: countRow[0]?.count ?? 0 });
  },
);

// POST /invoices
router.post(
  "/invoices",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      leadId,
      quoteId,
      contractId,
      title,
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      clientAddress,
      eventType,
      eventDate,
      eventLocation,
      currency,
      language,
      eventStartTime,
      eventEndTime,
      packageName,
      rentalDuration,
      includedPrints,
      digitalGallery,
      customTemplate,
      deliveryIncluded,
      setupIncluded,
      operatorIncluded,
      equipmentIds,
      equipmentDescription,
      optionsList,
      rentalPrice,
      optionsPrice,
      deliveryFees,
      discountAmount,
      taxRate,
      notes,
      terms,
      dueDate,
      items,
    } = req.body as {
      leadId?: string;
      quoteId?: string;
      contractId?: string;
      title?: string;
      clientName: string;
      clientEmail?: string;
      clientPhone?: string;
      clientCompany?: string;
      clientAddress?: string;
      eventType?: string;
      eventDate?: string;
      eventLocation?: string;
      currency?: string;
      language?: string;
      eventStartTime?: string;
      eventEndTime?: string;
      packageName?: string;
      rentalDuration?: string;
      includedPrints?: string;
      digitalGallery?: boolean;
      customTemplate?: boolean;
      deliveryIncluded?: boolean;
      setupIncluded?: boolean;
      operatorIncluded?: boolean;
      equipmentIds?: string[];
      equipmentDescription?: string;
      optionsList?: string;
      rentalPrice?: string;
      optionsPrice?: string;
      deliveryFees?: string;
      discountAmount?: string;
      taxRate?: string;
      notes?: string;
      terms?: string;
      dueDate?: string;
      items?: InvoiceItemInput[];
    };
    if (!clientName) {
      res.status(400).json({ error: "clientName required" });
      return;
    }

    const incomingLinksValidation = await validateOwnedLinks(user.id, {
      leadId,
      quoteId,
      contractId,
      equipmentIds,
    });
    if (!incomingLinksValidation.ok) {
      res
        .status(incomingLinksValidation.status)
        .json({ error: incomingLinksValidation.error });
      return;
    }

    let lineItems = items;

    // Start with form values
    let r = {
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      clientAddress,
      eventType,
      eventDate,
      eventLocation,
      currency,
      language,
      eventStartTime,
      eventEndTime,
      packageName,
      rentalDuration,
      includedPrints,
      digitalGallery: digitalGallery ?? false,
      customTemplate: customTemplate ?? false,
      deliveryIncluded: deliveryIncluded ?? false,
      setupIncluded: setupIncluded ?? false,
      operatorIncluded: operatorIncluded ?? false,
      equipmentIds,
      equipmentDescription,
      optionsList,
      rentalPrice,
      optionsPrice,
      deliveryFees,
      discountAmount,
      leadId,
      quoteId,
      taxRate,
    };

    // Auto-fill from contract → quote → lead (most authoritative source first)
    if (contractId) {
      const [contract] = await db
        .select()
        .from(contracts)
        .where(
          and(eq(contracts.id, contractId), eq(contracts.userId, user.id)),
        );
      if (contract) {
        const leadConflict = conflictingSourceLink(
          leadId,
          contract.leadId,
          "leadId",
        );
        const quoteConflict = conflictingSourceLink(
          quoteId,
          contract.quoteId,
          "quoteId",
        );
        if (leadConflict || quoteConflict) {
          res.status(400).json({ error: leadConflict ?? quoteConflict });
          return;
        }

        r.clientName = clientName || contract.clientName;
        r.clientEmail = clientEmail ?? contract.clientEmail ?? undefined;
        r.clientPhone = clientPhone ?? contract.clientPhone ?? undefined;
        r.clientCompany = clientCompany ?? contract.clientCompany ?? undefined;
        r.clientAddress = clientAddress ?? contract.clientAddress ?? undefined;
        r.eventType = eventType ?? contract.eventType ?? undefined;
        r.eventDate =
          eventDate ??
          (contract.eventDate ? contract.eventDate.toISOString() : undefined);
        r.currency = currency ?? contract.currency ?? undefined;
        r.language = language ?? contract.language ?? undefined;
        r.leadId = leadId ?? contract.leadId ?? undefined;
        r.quoteId = quoteId ?? contract.quoteId ?? undefined;
        r.equipmentIds =
          equipmentIds ??
          (contract.equipmentIds as string[] | null) ??
          undefined;
        // Create a single line item from contract value if none provided
        if (!lineItems || lineItems.length === 0) {
          lineItems = [
            {
              description: contract.title,
              quantity: "1",
              unitPrice: contract.value,
            },
          ];
        }
      }
    } else if (quoteId) {
      const [quote] = await db
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, quoteId), eq(quotes.userId, user.id)));
      if (quote) {
        const leadConflict = conflictingSourceLink(
          leadId,
          quote.leadId,
          "leadId",
        );
        if (leadConflict) {
          res.status(400).json({ error: leadConflict });
          return;
        }

        r.clientName = clientName || quote.clientName;
        r.clientEmail = clientEmail ?? quote.clientEmail ?? undefined;
        r.clientPhone = clientPhone ?? quote.clientPhone ?? undefined;
        r.clientCompany = clientCompany ?? quote.clientCompany ?? undefined;
        r.clientAddress = clientAddress ?? quote.clientAddress ?? undefined;
        r.eventType = eventType ?? quote.eventType ?? undefined;
        r.eventDate =
          eventDate ??
          (quote.eventDate ? quote.eventDate.toISOString() : undefined);
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
        r.equipmentIds =
          equipmentIds ?? (quote.equipmentIds as string[] | null) ?? undefined;
        r.equipmentDescription =
          equipmentDescription ?? quote.equipmentDescription ?? undefined;
        r.optionsList = optionsList ?? quote.optionsList ?? undefined;
        r.rentalPrice = rentalPrice ?? quote.rentalPrice ?? undefined;
        r.optionsPrice = optionsPrice ?? quote.optionsPrice ?? undefined;
        r.deliveryFees = deliveryFees ?? quote.deliveryFees ?? undefined;
        r.discountAmount = discountAmount ?? quote.discountAmount ?? undefined;
        r.currency = currency ?? quote.currency ?? undefined;
        r.language = language ?? quote.language ?? undefined;
        r.leadId = leadId ?? quote.leadId ?? undefined;
        r.taxRate = taxRate ?? quote.taxRate;

        if (!lineItems || lineItems.length === 0) {
          const sourceItems = await db
            .select()
            .from(quoteItems)
            .where(eq(quoteItems.quoteId, quote.id))
            .orderBy(quoteItems.order);
          lineItems = sourceItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            order: item.order,
          }));
        }
      }
    } else if (leadId) {
      const [lead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.userId, user.id)));
      if (lead) {
        r.clientName = clientName || lead.contactName;
        r.clientEmail = clientEmail ?? lead.email ?? undefined;
        r.clientPhone = clientPhone ?? lead.phone ?? undefined;
        r.clientCompany = clientCompany ?? lead.companyName;
        r.eventType = eventType ?? lead.eventType ?? undefined;
        r.eventDate =
          eventDate ??
          (lead.expectedEventDate
            ? lead.expectedEventDate.toISOString()
            : undefined);
      }
    }

    const resolvedLinksValidation = await validateOwnedLinks(user.id, {
      leadId: r.leadId ?? null,
      quoteId: r.quoteId ?? null,
      contractId: contractId ?? null,
      equipmentIds: r.equipmentIds ?? null,
    });
    if (!resolvedLinksValidation.ok) {
      res
        .status(resolvedLinksValidation.status)
        .json({ error: resolvedLinksValidation.error });
      return;
    }

    const resolvedItems = lineItems ?? [];
    const itemValidationError = validateInvoiceItems(resolvedItems);
    if (itemValidationError) {
      res.status(400).json({ error: itemValidationError });
      return;
    }
    const totals = calculateInvoiceTotals(
      resolvedItems,
      {
        rentalPrice: r.rentalPrice ?? null,
        optionsPrice: r.optionsPrice ?? null,
        deliveryFees: r.deliveryFees ?? null,
        discountAmount: r.discountAmount ?? null,
      },
      r.taxRate ?? "0",
    );

    const autoTitle =
      (title ?? "").trim() ||
      [r.clientName, r.eventType || null].filter(Boolean).join(" — ") ||
      "Invoice";

    const eventDateInput = parseOptionalDateInput("eventDate", r.eventDate);
    const dueDateInput = parseOptionalDateInput("dueDate", dueDate);
    for (const parsed of [eventDateInput, dueDateInput]) {
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
    }

    const { invoice, itemRows } = await db.transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(user.id, tx);
      const [createdInvoice] = await tx
        .insert(invoices)
        .values({
          userId: user.id,
          leadId: r.leadId ?? null,
          quoteId: r.quoteId ?? null,
          contractId: contractId ?? null,
          invoiceNumber,
          title: autoTitle,
          clientName: r.clientName,
          clientEmail: r.clientEmail ?? null,
          clientPhone: r.clientPhone ?? null,
          clientCompany: r.clientCompany ?? null,
          clientAddress: r.clientAddress ?? null,
          eventType: r.eventType ?? null,
          eventDate: eventDateInput.ok ? eventDateInput.value : null,
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
          dueDate: dueDateInput.ok ? dueDateInput.value : null,
        })
        .returning();

      if (!createdInvoice) throw new Error("Invoice creation failed");

      if (r.leadId) {
        await tx
          .update(leads)
          .set({ pipelineStage: "invoice_created", updatedAt: new Date() })
          .where(and(eq(leads.id, r.leadId), eq(leads.userId, user.id)));
      }

      const createdItems =
        resolvedItems.length > 0
          ? await tx
              .insert(invoiceItems)
              .values(invoiceItemRowsForInsert(createdInvoice.id, resolvedItems))
              .returning()
          : [];

      return { invoice: createdInvoice, itemRows: createdItems };
    });

    res.status(201).json({ ...invoice, items: itemRows });
  },
);

// GET /invoices/:id
router.get(
  "/invoices/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = String(req.params.id);

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
    if (!invoice) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(invoiceItems.order);
    res.json({ ...invoice, items });
  },
);

// PUT /invoices/:id
router.put(
  "/invoices/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = String(req.params.id);

    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const {
      leadId,
      quoteId,
      contractId,
      title,
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      clientAddress,
      eventType,
      eventDate,
      eventLocation,
      currency,
      language,
      eventStartTime,
      eventEndTime,
      packageName,
      rentalDuration,
      includedPrints,
      digitalGallery,
      customTemplate,
      deliveryIncluded,
      setupIncluded,
      operatorIncluded,
      equipmentIds,
      equipmentDescription,
      optionsList,
      rentalPrice,
      optionsPrice,
      deliveryFees,
      discountAmount,
      taxRate,
      notes,
      terms,
      dueDate,
      items,
    } = req.body as {
      leadId?: string | null;
      quoteId?: string | null;
      contractId?: string | null;
      title?: string;
      clientName?: string;
      clientEmail?: string | null;
      clientPhone?: string | null;
      clientCompany?: string | null;
      clientAddress?: string | null;
      eventType?: string | null;
      eventDate?: string | null;
      eventLocation?: string | null;
      currency?: string | null;
      language?: string | null;
      eventStartTime?: string | null;
      eventEndTime?: string | null;
      packageName?: string | null;
      rentalDuration?: string | null;
      includedPrints?: string | null;
      digitalGallery?: boolean;
      customTemplate?: boolean;
      deliveryIncluded?: boolean;
      setupIncluded?: boolean;
      operatorIncluded?: boolean;
      equipmentIds?: string[] | null;
      equipmentDescription?: string | null;
      optionsList?: string | null;
      rentalPrice?: string | null;
      optionsPrice?: string | null;
      deliveryFees?: string | null;
      discountAmount?: string | null;
      taxRate?: string;
      notes?: string | null;
      terms?: string | null;
      dueDate?: string;
      items?: InvoiceItemInput[];
    };

    if (items) {
      const itemValidationError = validateInvoiceItems(items);
      if (itemValidationError) {
        res.status(400).json({ error: itemValidationError });
        return;
      }
    }

    const effectiveLeadId = leadId !== undefined ? leadId : existing.leadId;
    const effectiveQuoteId = quoteId !== undefined ? quoteId : existing.quoteId;
    const effectiveContractId =
      contractId !== undefined ? contractId : existing.contractId;
    const effectiveEquipmentIds =
      equipmentIds !== undefined ? equipmentIds : existing.equipmentIds;
    const linkValidation = await validateOwnedLinks(user.id, {
      leadId: effectiveLeadId,
      quoteId: effectiveQuoteId,
      contractId: effectiveContractId,
      equipmentIds: effectiveEquipmentIds,
    });
    if (!linkValidation.ok) {
      res.status(linkValidation.status).json({ error: linkValidation.error });
      return;
    }

    const eventDateInput = parseOptionalDateInput("eventDate", eventDate);
    const dueDateInput = parseOptionalDateInput("dueDate", dueDate);
    for (const parsed of [eventDateInput, dueDateInput]) {
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
    }

    const { updated, itemRows } = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM invoices WHERE id = ${id} AND user_id = ${user.id} FOR UPDATE`,
      );

      const [lockedExisting] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
      if (!lockedExisting) throw new Error("Invoice update failed");

      const existingItems = await tx
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, id))
        .orderBy(invoiceItems.order);
      const newTaxRate = taxRate ?? lockedExisting.taxRate;
      const newItems = items ?? existingItems;
      const effectivePricing = {
        rentalPrice:
          rentalPrice !== undefined ? rentalPrice : lockedExisting.rentalPrice,
        optionsPrice:
          optionsPrice !== undefined ? optionsPrice : lockedExisting.optionsPrice,
        deliveryFees:
          deliveryFees !== undefined ? deliveryFees : lockedExisting.deliveryFees,
        discountAmount:
          discountAmount !== undefined
            ? discountAmount
            : lockedExisting.discountAmount,
      };
      const totals = calculateInvoiceTotals(
        newItems,
        effectivePricing,
        newTaxRate,
      );

      const [updatedInvoice] = await tx
        .update(invoices)
        .set({
          leadId: effectiveLeadId ?? null,
          quoteId: effectiveQuoteId ?? null,
          contractId: effectiveContractId ?? null,
          title: title ?? lockedExisting.title,
          clientName: clientName ?? lockedExisting.clientName,
          clientEmail:
            clientEmail !== undefined ? clientEmail : lockedExisting.clientEmail,
          clientPhone:
            clientPhone !== undefined ? clientPhone : lockedExisting.clientPhone,
          clientCompany:
            clientCompany !== undefined
              ? clientCompany
              : lockedExisting.clientCompany,
          clientAddress:
            clientAddress !== undefined
              ? clientAddress
              : lockedExisting.clientAddress,
          eventType:
            eventType !== undefined ? eventType : lockedExisting.eventType,
          eventDate:
            eventDate !== undefined
              ? eventDateInput.ok
                ? eventDateInput.value
                : null
              : lockedExisting.eventDate,
          eventLocation:
            eventLocation !== undefined
              ? eventLocation
              : lockedExisting.eventLocation,
          eventStartTime:
            eventStartTime !== undefined
              ? eventStartTime
              : lockedExisting.eventStartTime,
          eventEndTime:
            eventEndTime !== undefined
              ? eventEndTime
              : lockedExisting.eventEndTime,
          packageName:
            packageName !== undefined ? packageName : lockedExisting.packageName,
          rentalDuration:
            rentalDuration !== undefined
              ? rentalDuration
              : lockedExisting.rentalDuration,
          includedPrints:
            includedPrints !== undefined
              ? includedPrints
              : lockedExisting.includedPrints,
          digitalGallery:
            digitalGallery !== undefined
              ? digitalGallery
              : lockedExisting.digitalGallery,
          customTemplate:
            customTemplate !== undefined
              ? customTemplate
              : lockedExisting.customTemplate,
          deliveryIncluded:
            deliveryIncluded !== undefined
              ? deliveryIncluded
              : lockedExisting.deliveryIncluded,
          setupIncluded:
            setupIncluded !== undefined
              ? setupIncluded
              : lockedExisting.setupIncluded,
          operatorIncluded:
            operatorIncluded !== undefined
              ? operatorIncluded
              : lockedExisting.operatorIncluded,
          equipmentIds: effectiveEquipmentIds ?? null,
          equipmentDescription:
            equipmentDescription !== undefined
              ? equipmentDescription
              : lockedExisting.equipmentDescription,
          optionsList:
            optionsList !== undefined ? optionsList : lockedExisting.optionsList,
          rentalPrice:
            rentalPrice !== undefined ? rentalPrice : lockedExisting.rentalPrice,
          optionsPrice:
            optionsPrice !== undefined
              ? optionsPrice
              : lockedExisting.optionsPrice,
          deliveryFees:
            deliveryFees !== undefined
              ? deliveryFees
              : lockedExisting.deliveryFees,
          discountAmount:
            discountAmount !== undefined
              ? discountAmount
              : lockedExisting.discountAmount,
          currency: currency !== undefined ? currency : lockedExisting.currency,
          language: language !== undefined ? language : lockedExisting.language,
          taxRate: newTaxRate,
          ...totals,
          notes: notes !== undefined ? notes : lockedExisting.notes,
          terms: terms !== undefined ? terms : lockedExisting.terms,
          dueDate:
            dueDateInput.ok && dueDateInput.value
              ? dueDateInput.value
              : lockedExisting.dueDate,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id))
        .returning();

      if (!updatedInvoice) throw new Error("Invoice update failed");

      if (items) {
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
        if (items.length > 0) {
          await tx
            .insert(invoiceItems)
            .values(invoiceItemRowsForInsert(updatedInvoice.id, items));
        }
      }

      const rows = await tx
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, id))
        .orderBy(invoiceItems.order);

      return { updated: updatedInvoice, itemRows: rows };
    });

    res.json({ ...updated, items: itemRows });
  },
);

// DELETE /invoices/:id
router.delete(
  "/invoices/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = String(req.params.id);

    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(invoices).where(eq(invoices.id, id));
    res.status(204).send();
  },
);

// PATCH /invoices/:id/status
router.patch(
  "/invoices/:id/status",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = String(req.params.id);

    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { status, paidAmount, paymentMethod, paymentReference } =
      req.body as {
        status: typeof invoices.status._.data;
        paidAmount?: string;
        paymentMethod?: string;
        paymentReference?: string;
      };
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }

    const extra: {
      sentAt?: Date;
      paidAt?: Date;
      paidAmount?: string;
      paymentMethod?: string;
      paymentReference?: string;
    } = {};
    if (status === "sent") extra.sentAt = new Date();
    if (status === "paid") {
      extra.paidAt = new Date();
      if (paidAmount) extra.paidAmount = paidAmount;
      if (paymentMethod) extra.paymentMethod = paymentMethod;
      if (paymentReference) extra.paymentReference = paymentReference;
    }

    const [updated] = await db
      .update(invoices)
      .set({ status, ...extra, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();

    // Update lead pipeline on payment
    if (existing.leadId && status === "paid") {
      await db
        .update(leads)
        .set({
          pipelineStage: "won",
          status: "won",
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, existing.leadId), eq(leads.userId, user.id)));
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

    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(invoiceItems.order);
    res.json({ ...updated, items });
  },
);

export default router;
