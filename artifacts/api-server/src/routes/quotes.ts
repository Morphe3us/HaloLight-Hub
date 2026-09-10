import { validPaymentMethod } from "../lib/paymentMethod.js";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, quotes, quoteItems, leads } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { validateOwnedLinks } from "../lib/ownership";
import { getOrCreateUser } from "../lib/userSync";
import { buildQuoteMailto } from "../lib/quoteMailto";
import { calculateQuoteTotals } from "../lib/quotePricing";
import { nextQuoteNumber } from "../lib/documentNumberQueries";
import { parseOptionalDateInput } from "../lib/dateInput";

const router: IRouter = Router();

async function updateLeadPipelineStage(
  leadId: string | null | undefined,
  stage: string,
  userId: string,
) {
  if (!leadId) return;
  await db
    .update(leads)
    .set({ pipelineStage: stage, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)));
}

type ServiceFields = {
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
};

type QuoteItemInput = {
  description: string;
  quantity: string;
  unitPrice: string;
  order?: number;
};

function parseFiniteAmount(value: string, field: string): number | string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${field} must be a valid number`;
  return parsed;
}

function validateQuoteItems(items: QuoteItemInput[]): string | null {
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

function quoteItemRowsForInsert(quoteId: string, items: QuoteItemInput[]) {
  return items.map((item, i) => ({
    quoteId,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: (Number(item.quantity) * Number(item.unitPrice)).toFixed(2),
    order: item.order ?? i,
  }));
}

// GET /quotes
router.get(
  "/quotes",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      status,
      leadId,
      limit = "50",
      offset = "0",
    } = req.query as Record<string, string>;

    const conditions = [eq(quotes.userId, user.id)];
    if (status)
      conditions.push(eq(quotes.status, status as typeof quotes.status._.data));
    if (leadId) conditions.push(sql`${quotes.leadId} = ${leadId}`);

    const [rows, countRow] = await Promise.all([
      db
        .select()
        .from(quotes)
        .where(and(...conditions))
        .orderBy(desc(quotes.updatedAt))
        .limit(Number(limit))
        .offset(Number(offset)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(quotes)
        .where(and(...conditions)),
    ]);

    res.json({ items: rows, total: countRow[0]?.count ?? 0 });
  },
);

// POST /quotes
router.post(
  "/quotes",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      leadId,
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
      taxRate = "0",
      notes,
      terms,
      paymentMethod,
      validUntil,
      items = [],
    } = req.body as {
      leadId?: string;
      title: string;
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
      paymentMethod?: string | null;
      validUntil?: string;
      items?: QuoteItemInput[];
    };
    if (!clientName) {
      res.status(400).json({ error: "clientName required" });
      return;
    }

    const linkValidation = await validateOwnedLinks(user.id, {
      leadId,
      equipmentIds,
    });
    if (!linkValidation.ok) {
      res.status(linkValidation.status).json({ error: linkValidation.error });
      return;
    }

    let resolvedClientName = clientName;
    let resolvedClientEmail = clientEmail;
    let resolvedClientPhone = clientPhone;
    let resolvedClientCompany = clientCompany;
    let resolvedClientAddress = clientAddress;
    let resolvedEventType = eventType;
    let resolvedEventDate = eventDate;

    if (leadId) {
      const [lead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.userId, user.id)));
      if (lead) {
        resolvedClientName = clientName || lead.contactName;
        resolvedClientEmail = clientEmail ?? lead.email ?? undefined;
        resolvedClientPhone = clientPhone ?? lead.phone ?? undefined;
        resolvedClientCompany = clientCompany ?? lead.companyName;
        resolvedClientAddress = clientAddress ?? lead.address ?? undefined;
        resolvedEventType = eventType ?? lead.eventType ?? undefined;
        resolvedEventDate =
          eventDate ??
          (lead.expectedEventDate
            ? lead.expectedEventDate.toISOString()
            : undefined);
      }
    }

    const autoTitle =
      (title ?? "").trim() ||
      [
        resolvedClientName.trim(),
        resolvedEventType?.trim() || resolvedEventDate || null,
      ]
        .filter(Boolean)
        .join(" — ") ||
      "Quote";

    const quoteItemsInput = items ?? [];
    const itemValidationError = validateQuoteItems(quoteItemsInput);
    if (itemValidationError) {
      res.status(400).json({ error: itemValidationError });
      return;
    }

    const totals = calculateQuoteTotals(
      quoteItemsInput,
      { rentalPrice, optionsPrice, deliveryFees, discountAmount },
      taxRate,
    );

    const eventDateInput = parseOptionalDateInput(
      "eventDate",
      resolvedEventDate,
    );
    if (!validPaymentMethod(paymentMethod)) {
      res.status(400).json({ error: "Invalid paymentMethod" });
      return;
    }
    const validUntilInput = parseOptionalDateInput("validUntil", validUntil);
    for (const parsed of [eventDateInput, validUntilInput]) {
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
    }

    const { quote, itemRows } = await db.transaction(async (tx) => {
      const quoteNumber = await nextQuoteNumber(user.id, tx);
      const [createdQuote] = await tx
        .insert(quotes)
        .values({
          userId: user.id,
          leadId: leadId ?? null,
          quoteNumber,
          title: autoTitle,
          clientName: resolvedClientName,
          clientEmail: resolvedClientEmail ?? null,
          clientPhone: resolvedClientPhone ?? null,
          clientCompany: resolvedClientCompany ?? null,
          clientAddress: resolvedClientAddress ?? null,
          eventType: resolvedEventType ?? null,
          eventDate: eventDateInput.ok ? eventDateInput.value : null,
          eventLocation: eventLocation ?? null,
          eventStartTime: eventStartTime ?? null,
          eventEndTime: eventEndTime ?? null,
          packageName: packageName ?? null,
          rentalDuration: rentalDuration ?? null,
          includedPrints: includedPrints ?? null,
          digitalGallery: digitalGallery ?? false,
          customTemplate: customTemplate ?? false,
          deliveryIncluded: deliveryIncluded ?? false,
          setupIncluded: setupIncluded ?? false,
          operatorIncluded: operatorIncluded ?? false,
          equipmentIds: equipmentIds ?? null,
          equipmentDescription: equipmentDescription ?? null,
          optionsList: optionsList ?? null,
          rentalPrice: rentalPrice ?? null,
          optionsPrice: optionsPrice ?? null,
          deliveryFees: deliveryFees ?? null,
          discountAmount: discountAmount ?? null,
          currency: currency ?? null,
          language: language ?? null,
          taxRate,
          ...totals,
          notes: notes ?? null,
          terms: terms ?? null,
          paymentMethod: paymentMethod?.trim() || null,
          validUntil: validUntilInput.ok ? validUntilInput.value : null,
        })
        .returning();

      if (!createdQuote) throw new Error("Quote creation failed");

      const createdItems =
        quoteItemsInput.length > 0
          ? await tx
              .insert(quoteItems)
              .values(quoteItemRowsForInsert(createdQuote.id, quoteItemsInput))
              .returning()
          : [];

      if (leadId) {
        await tx
          .update(leads)
          .set({ pipelineStage: "quote_created", updatedAt: new Date() })
          .where(and(eq(leads.id, leadId), eq(leads.userId, user.id)));
      }

      return { quote: createdQuote, itemRows: createdItems };
    });

    res.status(201).json({ ...quote, items: itemRows });
  },
);

// GET /quotes/:id
router.get(
  "/quotes/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = String(req.params.id);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
    if (!quote) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const items = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(quoteItems.order);
    res.json({ ...quote, items });
  },
);

// PUT /quotes/:id
router.put(
  "/quotes/:id",
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
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const {
      leadId,
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
      paymentMethod,
      validUntil,
      items,
    } = req.body as {
      leadId?: string | null;
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
      paymentMethod?: string | null;
      validUntil?: string;
      items?: QuoteItemInput[];
    } & ServiceFields;

    if (items) {
      const itemValidationError = validateQuoteItems(items);
      if (itemValidationError) {
        res.status(400).json({ error: itemValidationError });
        return;
      }
    }

    const eventDateInput = parseOptionalDateInput("eventDate", eventDate);
    if (!validPaymentMethod(paymentMethod)) {
      res.status(400).json({ error: "Invalid paymentMethod" });
      return;
    }
    const validUntilInput = parseOptionalDateInput("validUntil", validUntil);
    for (const parsed of [eventDateInput, validUntilInput]) {
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
    }

    const effectiveLeadId = leadId !== undefined ? leadId : existing.leadId;
    const effectiveEquipmentIds =
      equipmentIds !== undefined ? equipmentIds : existing.equipmentIds;
    const linkValidation = await validateOwnedLinks(user.id, {
      leadId: effectiveLeadId,
      equipmentIds: effectiveEquipmentIds,
    });
    if (!linkValidation.ok) {
      res.status(linkValidation.status).json({ error: linkValidation.error });
      return;
    }

    const { updated, itemRows } = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM quotes WHERE id = ${id} AND user_id = ${user.id} FOR UPDATE`,
      );

      const [lockedExisting] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
      if (!lockedExisting) throw new Error("Quote update failed");

      const existingItems = await tx
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, id))
        .orderBy(quoteItems.order);
      const newTaxRate = taxRate ?? lockedExisting.taxRate;
      const newItems = items ?? existingItems;
      const effectivePricing = {
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
      };
      const totals = calculateQuoteTotals(
        newItems,
        effectivePricing,
        newTaxRate,
      );

      const [updatedQuote] = await tx
        .update(quotes)
        .set({
          leadId: effectiveLeadId ?? null,
          title: title ?? lockedExisting.title,
          clientName: clientName ?? lockedExisting.clientName,
          clientEmail:
            clientEmail !== undefined
              ? clientEmail
              : lockedExisting.clientEmail,
          clientPhone:
            clientPhone !== undefined
              ? clientPhone
              : lockedExisting.clientPhone,
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
            packageName !== undefined
              ? packageName
              : lockedExisting.packageName,
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
            optionsList !== undefined
              ? optionsList
              : lockedExisting.optionsList,
          rentalPrice:
            rentalPrice !== undefined
              ? rentalPrice
              : lockedExisting.rentalPrice,
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
          paymentMethod: paymentMethod === undefined ? lockedExisting.paymentMethod : paymentMethod?.trim() || null,
          validUntil:
            validUntilInput.ok && validUntilInput.value
              ? validUntilInput.value
              : lockedExisting.validUntil,
          updatedAt: new Date(),
        })
        .where(eq(quotes.id, id))
        .returning();

      if (!updatedQuote) throw new Error("Quote update failed");

      if (items) {
        await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
        if (newItems.length > 0) {
          await tx
            .insert(quoteItems)
            .values(quoteItemRowsForInsert(updatedQuote.id, newItems));
        }
      }

      const rows = await tx
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, id))
        .orderBy(quoteItems.order);

      return { updated: updatedQuote, itemRows: rows };
    });
    res.json({ ...updated, items: itemRows });
  },
);

// DELETE /quotes/:id
router.delete(
  "/quotes/:id",
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
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(quotes).where(eq(quotes.id, id));
    res.status(204).send();
  },
);

// PATCH /quotes/:id/status
router.patch(
  "/quotes/:id/status",
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
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { status } = req.body as { status: typeof quotes.status._.data };
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }

    const extra: { sentAt?: Date; acceptedAt?: Date } = {};
    if (status === "sent") extra.sentAt = new Date();
    if (status === "accepted") extra.acceptedAt = new Date();

    const [updated] = await db
      .update(quotes)
      .set({ status, ...extra, updatedAt: new Date() })
      .where(eq(quotes.id, id))
      .returning();

    if (existing.leadId) {
      if (status === "sent")
        await updateLeadPipelineStage(existing.leadId, "quote_sent", user.id);
      else if (status === "accepted")
        await updateLeadPipelineStage(
          existing.leadId,
          "quote_accepted",
          user.id,
        );
      else if (status === "declined")
        await updateLeadPipelineStage(existing.leadId, "lost", user.id);
    }

    const items = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(quoteItems.order);
    res.json({ ...updated, items });
  },
);

// POST /quotes/:id/send
router.post(
  "/quotes/:id/send",
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
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!existing.clientEmail) {
      res.status(400).json({ error: "Quote has no client email" });
      return;
    }

    const items = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(quoteItems.order);
    const { subject, mailtoUrl } = buildQuoteMailto({
      quote: existing,
      appUrl: process.env.APP_PUBLIC_URL,
      companyName: user.companyName || user.fullName,
      language: existing.language ?? user.language,
    });

    res.json({
      quote: { ...existing, items },
      mailtoUrl,
      clientEmail: existing.clientEmail,
      subject,
    });
  },
);

export default router;
