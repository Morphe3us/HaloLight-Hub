import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, contracts, contractTemplates, leads, quotes, invoices, events } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { DEFAULT_CONTRACT_TEMPLATES } from "../lib/defaultContractTemplates";

const router: IRouter = Router();

function generateContractNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `CON-${year}-${rand}`;
}

async function updateLeadPipelineStage(leadId: string | null | undefined, stage: string, userId: string) {
  if (!leadId) return;
  await db.update(leads).set({ pipelineStage: stage, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)));
}

function fillContractVariables(
  template: string,
  data: {
    contractNumber: string;
    clientName?: string | null;
    clientEmail?: string | null;
    clientPhone?: string | null;
    clientCompany?: string | null;
    clientAddress?: string | null;
    eventType?: string | null;
    eventDate?: Date | null;
    eventLocation?: string | null;
    eventStartTime?: string | null;
    eventEndTime?: string | null;
    packageName?: string | null;
    rentalDuration?: string | null;
    includedPrints?: string | null;
    rentalPrice?: string | null;
    optionsPrice?: string | null;
    deliveryFees?: string | null;
    discountAmount?: string | null;
    equipmentDescription?: string | null;
    digitalGallery?: boolean | null;
    customTemplate?: boolean | null;
    deliveryIncluded?: boolean | null;
    setupIncluded?: boolean | null;
    operatorIncluded?: boolean | null;
    optionsList?: string | null;
    currency?: string | null;
    language?: string | null;
    value?: string | null;
  }
): string {
  const HIDE = "\x00HIDE_LINE\x00";
  const lang = data.language ?? "en";

  const INCLUDED: Record<string, string> = {
    en: "Included", fr: "Inclus", es: "Incluido", de: "Inklusive",
    it: "Incluso", nl: "Inbegrepen", pl: "W zestawie", pt: "Incluído",
  };
  const included = (flag: boolean | null | undefined) => flag ? (INCLUDED[lang] ?? "Included") : HIDE;

  const fmt = (v: string | null | undefined) => v?.trim() || HIDE;

  const fmtDate = (d: Date | null | undefined) => {
    if (!d) return HIDE;
    return d.toLocaleDateString(lang, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };

  const fmtAmount = (v: string | null | undefined) => {
    if (!v || Number(v) === 0) return HIDE;
    return `${Number(v).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.currency ?? "€"}`;
  };

  const nameParts = (data.clientName ?? "").split(" ");
  const firstName = fmt(nameParts[0]);
  const lastName = nameParts.length > 1 ? fmt(nameParts.slice(1).join(" ")) : HIDE;

  const equipList = data.equipmentDescription
    ? data.equipmentDescription.split(",").map(e => e.trim()).filter(Boolean).join("\n")
    : HIDE;

  let result = template
    .replace(/\{\{contract_number\}\}/g, data.contractNumber)
    .replace(/\{\{client_name\}\}/g, fmt(data.clientName))
    .replace(/\{\{client_first_name\}\}/g, firstName)
    .replace(/\{\{client_last_name\}\}/g, lastName)
    .replace(/\{\{client_email\}\}/g, fmt(data.clientEmail))
    .replace(/\{\{client_phone\}\}/g, fmt(data.clientPhone))
    .replace(/\{\{client_company_name\}\}/g, fmt(data.clientCompany))
    .replace(/\{\{client_address\}\}/g, fmt(data.clientAddress))
    .replace(/\{\{event_type\}\}/g, fmt(data.eventType))
    .replace(/\{\{event_date\}\}/g, fmtDate(data.eventDate))
    .replace(/\{\{event_start_time\}\}/g, fmt(data.eventStartTime))
    .replace(/\{\{event_end_time\}\}/g, fmt(data.eventEndTime))
    .replace(/\{\{event_location\}\}/g, fmt(data.eventLocation))
    .replace(/\{\{package_name\}\}/g, fmt(data.packageName))
    .replace(/\{\{rental_duration\}\}/g, fmt(data.rentalDuration))
    .replace(/\{\{included_prints\}\}/g, fmt(data.includedPrints))
    .replace(/\{\{equipment_list\}\}/g, equipList)
    .replace(/\{\{digital_gallery\}\}/g, included(data.digitalGallery))
    .replace(/\{\{custom_template\}\}/g, included(data.customTemplate))
    .replace(/\{\{delivery_included\}\}/g, included(data.deliveryIncluded))
    .replace(/\{\{setup_included\}\}/g, included(data.setupIncluded))
    .replace(/\{\{operator_included\}\}/g, included(data.operatorIncluded))
    .replace(/\{\{options_list\}\}/g, fmt(data.optionsList))
    .replace(/\{\{rental_price\}\}/g, fmtAmount(data.rentalPrice))
    .replace(/\{\{options_price\}\}/g, fmtAmount(data.optionsPrice))
    .replace(/\{\{delivery_fees\}\}/g, fmtAmount(data.deliveryFees))
    .replace(/\{\{discount_amount\}\}/g, fmtAmount(data.discountAmount))
    .replace(/\{\{contract_value\}\}/g, fmtAmount(data.value))
    .replace(/\{\{currency\}\}/g, "")
    // Provider fields — user fills in settings
    .replace(/\{\{rental_company_name\}\}/g, HIDE)
    .replace(/\{\{rental_company_representative\}\}/g, HIDE)
    .replace(/\{\{rental_company_address\}\}/g, HIDE)
    .replace(/\{\{rental_company_email\}\}/g, HIDE)
    .replace(/\{\{rental_company_phone\}\}/g, HIDE)
    .replace(/\{\{rental_company_website\}\}/g, HIDE)
    .replace(/\{\{rental_company_vat\}\}/g, HIDE)
    // Optional fields not in form
    .replace(/\{\{setup_time\}\}/g, HIDE)
    .replace(/\{\{pickup_time\}\}/g, HIDE)
    .replace(/\{\{deposit_amount\}\}/g, HIDE)
    .replace(/\{\{deposit_method\}\}/g, HIDE)
    .replace(/\{\{deposit_conditions\}\}/g, HIDE)
    .replace(/\{\{deposit_return\}\}/g, HIDE)
    .replace(/\{\{cancellation_terms\}\}/g, HIDE)
    .replace(/\{\{payment_terms\}\}/g, HIDE)
    .replace(/\{\{signature_place\}\}/g, HIDE)
    .replace(/\{\{provider_signature\}\}/g, HIDE)
    .replace(/\{\{provider_signer_title\}\}/g, HIDE)
    // Catch-all for any remaining {{...}} except contract_number (already replaced above)
    .replace(/\{\{(?!contract_number\}\})[^}]+\}\}/g, HIDE);

  // Filter lines with HIDE marker, then collapse excess blank lines
  const lines = result.split("\n");
  const filtered = lines.filter(line => !line.includes("\x00HIDE_LINE\x00"));
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of filtered) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun <= 2) collapsed.push(line);
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }
  return collapsed.join("\n");
}

// GET /contracts
router.get("/contracts", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;
  const conditions = [eq(contracts.userId, user.id)];
  if (status) conditions.push(eq(contracts.status, status as typeof contracts.status._.data));
  const [rows, countRow] = await Promise.all([
    db.select().from(contracts).where(and(...conditions)).orderBy(desc(contracts.updatedAt)).limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)::int` }).from(contracts).where(and(...conditions)),
  ]);
  res.json({ items: rows, total: countRow[0]?.count ?? 0 });
});

// POST /contracts
router.post("/contracts", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    leadId, quoteId, invoiceId, templateId, title, clientName, clientEmail, clientPhone, clientCompany, clientAddress,
    content, value, startDate, endDate, notes, eventType, eventDate, currency, language,
    eventLocation, eventStartTime, eventEndTime, packageName, rentalDuration, includedPrints,
    rentalPrice, optionsPrice, deliveryFees, discountAmount, equipmentDescription,
    digitalGallery, customTemplate, deliveryIncluded, setupIncluded, operatorIncluded, optionsList,
    equipmentIds,
  } = req.body as {
    leadId?: string; quoteId?: string; invoiceId?: string; templateId?: string; title: string; clientName: string;
    clientEmail?: string; clientPhone?: string; clientCompany?: string; clientAddress?: string;
    content?: string; value?: string; startDate?: string; endDate?: string; notes?: string;
    eventType?: string; eventDate?: string; currency?: string; language?: string;
    eventLocation?: string; eventStartTime?: string; eventEndTime?: string;
    packageName?: string; rentalDuration?: string; includedPrints?: string;
    rentalPrice?: string; optionsPrice?: string; deliveryFees?: string; discountAmount?: string;
    equipmentDescription?: string; digitalGallery?: boolean; customTemplate?: boolean;
    deliveryIncluded?: boolean; setupIncluded?: boolean; operatorIncluded?: boolean; optionsList?: string;
    equipmentIds?: string[];
  };
  if (!title || !clientName) { res.status(400).json({ error: "title and clientName required" }); return; }

  // Resolved fields — will be populated from source record (invoice/quote/lead)
  let resolvedClientName = clientName;
  let resolvedClientEmail = clientEmail;
  let resolvedClientPhone = clientPhone;
  let resolvedClientCompany = clientCompany;
  let resolvedClientAddress = clientAddress;
  let resolvedEventType = eventType;
  let resolvedEventDate = eventDate;
  let resolvedEventLocation = eventLocation;
  let resolvedEventStartTime = eventStartTime;
  let resolvedEventEndTime = eventEndTime;
  let resolvedPackageName = packageName;
  let resolvedRentalDuration = rentalDuration;
  let resolvedIncludedPrints = includedPrints;
  let resolvedRentalPrice = rentalPrice;
  let resolvedOptionsPrice = optionsPrice;
  let resolvedDeliveryFees = deliveryFees;
  let resolvedDiscountAmount = discountAmount;
  let resolvedEquipmentDescription = equipmentDescription;
  let resolvedDigitalGallery = digitalGallery;
  let resolvedCustomTemplate = customTemplate;
  let resolvedDeliveryIncluded = deliveryIncluded;
  let resolvedSetupIncluded = setupIncluded;
  let resolvedOperatorIncluded = operatorIncluded;
  let resolvedOptionsList = optionsList;
  let resolvedValue = value;
  let resolvedLeadId = leadId;
  let resolvedQuoteId = quoteId;
  let resolvedCurrency = currency;
  let resolvedLanguage = language;
  let resolvedEquipmentIds = equipmentIds;

  // Source: Invoice
  if (invoiceId) {
    const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id)));
    if (inv) {
      resolvedClientName = clientName || inv.clientName;
      resolvedClientEmail = clientEmail ?? inv.clientEmail ?? undefined;
      resolvedClientPhone = clientPhone ?? inv.clientPhone ?? undefined;
      resolvedClientCompany = clientCompany ?? inv.clientCompany ?? undefined;
      resolvedClientAddress = clientAddress ?? inv.clientAddress ?? undefined;
      resolvedEventType = eventType ?? inv.eventType ?? undefined;
      resolvedEventDate = eventDate ?? (inv.eventDate ? inv.eventDate.toISOString() : undefined);
      resolvedEventLocation = eventLocation ?? inv.eventLocation ?? undefined;
      resolvedEventStartTime = eventStartTime ?? inv.eventStartTime ?? undefined;
      resolvedEventEndTime = eventEndTime ?? inv.eventEndTime ?? undefined;
      resolvedPackageName = packageName ?? inv.packageName ?? undefined;
      resolvedRentalDuration = rentalDuration ?? inv.rentalDuration ?? undefined;
      resolvedIncludedPrints = includedPrints ?? inv.includedPrints ?? undefined;
      resolvedRentalPrice = rentalPrice ?? inv.rentalPrice ?? undefined;
      resolvedOptionsPrice = optionsPrice ?? inv.optionsPrice ?? undefined;
      resolvedDeliveryFees = deliveryFees ?? inv.deliveryFees ?? undefined;
      resolvedDiscountAmount = discountAmount ?? inv.discountAmount ?? undefined;
      resolvedEquipmentDescription = equipmentDescription ?? inv.equipmentDescription ?? undefined;
      resolvedDigitalGallery = digitalGallery ?? inv.digitalGallery ?? undefined;
      resolvedCustomTemplate = customTemplate ?? inv.customTemplate ?? undefined;
      resolvedDeliveryIncluded = deliveryIncluded ?? inv.deliveryIncluded ?? undefined;
      resolvedSetupIncluded = setupIncluded ?? inv.setupIncluded ?? undefined;
      resolvedOperatorIncluded = operatorIncluded ?? inv.operatorIncluded ?? undefined;
      resolvedOptionsList = optionsList ?? inv.optionsList ?? undefined;
      resolvedValue = value ?? inv.total ?? undefined;
      resolvedLeadId = leadId ?? inv.leadId ?? undefined;
      resolvedQuoteId = quoteId ?? inv.quoteId ?? undefined;
      resolvedCurrency = currency ?? inv.currency ?? undefined;
      resolvedLanguage = language ?? inv.language ?? undefined;
    }
  // Source: Quote
  } else if (quoteId) {
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, user.id)));
    if (quote) {
      resolvedClientName = clientName || quote.clientName;
      resolvedClientEmail = clientEmail ?? quote.clientEmail ?? undefined;
      resolvedClientPhone = clientPhone ?? quote.clientPhone ?? undefined;
      resolvedClientCompany = clientCompany ?? quote.clientCompany ?? undefined;
      resolvedClientAddress = clientAddress ?? quote.clientAddress ?? undefined;
      resolvedEventType = eventType ?? quote.eventType ?? undefined;
      resolvedEventDate = eventDate ?? (quote.eventDate ? quote.eventDate.toISOString() : undefined);
      resolvedEventLocation = eventLocation ?? quote.eventLocation ?? undefined;
      resolvedEventStartTime = eventStartTime ?? quote.eventStartTime ?? undefined;
      resolvedEventEndTime = eventEndTime ?? quote.eventEndTime ?? undefined;
      resolvedPackageName = packageName ?? quote.packageName ?? undefined;
      resolvedRentalDuration = rentalDuration ?? quote.rentalDuration ?? undefined;
      resolvedIncludedPrints = includedPrints ?? quote.includedPrints ?? undefined;
      resolvedRentalPrice = rentalPrice ?? quote.rentalPrice ?? undefined;
      resolvedOptionsPrice = optionsPrice ?? quote.optionsPrice ?? undefined;
      resolvedDeliveryFees = deliveryFees ?? quote.deliveryFees ?? undefined;
      resolvedDiscountAmount = discountAmount ?? quote.discountAmount ?? undefined;
      resolvedEquipmentDescription = equipmentDescription ?? quote.equipmentDescription ?? undefined;
      resolvedDigitalGallery = digitalGallery ?? quote.digitalGallery ?? undefined;
      resolvedCustomTemplate = customTemplate ?? quote.customTemplate ?? undefined;
      resolvedDeliveryIncluded = deliveryIncluded ?? quote.deliveryIncluded ?? undefined;
      resolvedSetupIncluded = setupIncluded ?? quote.setupIncluded ?? undefined;
      resolvedOperatorIncluded = operatorIncluded ?? quote.operatorIncluded ?? undefined;
      resolvedOptionsList = optionsList ?? quote.optionsList ?? undefined;
      resolvedValue = value ?? quote.total ?? undefined;
      resolvedLeadId = leadId ?? quote.leadId ?? undefined;
      resolvedCurrency = currency ?? quote.currency ?? undefined;
      resolvedLanguage = language ?? quote.language ?? undefined;
    }
  // Source: Lead
  } else if (leadId) {
    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, user.id)));
    if (lead) {
      resolvedClientName = clientName || lead.contactName;
      resolvedClientEmail = clientEmail ?? lead.email ?? undefined;
      resolvedClientPhone = clientPhone ?? lead.phone ?? undefined;
      resolvedClientCompany = clientCompany ?? lead.companyName;
      resolvedClientAddress = clientAddress ?? lead.address ?? undefined;
      resolvedEventType = eventType ?? lead.eventType ?? undefined;
      resolvedEventDate = eventDate ?? (lead.expectedEventDate ? lead.expectedEventDate.toISOString() : undefined);
      resolvedValue = value ?? lead.value;
    }
  }

  // Resolve template content
  let finalContent = content ?? "";
  if (!finalContent) {
    if (templateId) {
      const [tpl] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, templateId));
      if (tpl) finalContent = tpl.content;
    }
    // Auto-select default template by language if still empty
    if (!finalContent) {
      const lang = resolvedLanguage ?? "en";
      const [dbTpl] = await db.select().from(contractTemplates)
        .where(and(eq(contractTemplates.language, lang), eq(contractTemplates.isDefault, true)));
      if (dbTpl) {
        finalContent = dbTpl.content;
      } else {
        const bundled = DEFAULT_CONTRACT_TEMPLATES.find(t => t.language === lang) ?? DEFAULT_CONTRACT_TEMPLATES.find(t => t.language === "en");
        if (bundled) finalContent = bundled.content;
      }
    }
  }

  // Generate contract number and fill all template variables
  const contractNumber = generateContractNumber();
  const resolvedEventDateObj = resolvedEventDate ? new Date(resolvedEventDate) : null;

  const processedContent = fillContractVariables(finalContent, {
    contractNumber,
    clientName: resolvedClientName,
    clientEmail: resolvedClientEmail,
    clientPhone: resolvedClientPhone,
    clientCompany: resolvedClientCompany,
    clientAddress: resolvedClientAddress,
    eventType: resolvedEventType,
    eventDate: resolvedEventDateObj,
    eventLocation: resolvedEventLocation,
    eventStartTime: resolvedEventStartTime,
    eventEndTime: resolvedEventEndTime,
    packageName: resolvedPackageName,
    rentalDuration: resolvedRentalDuration,
    includedPrints: resolvedIncludedPrints,
    rentalPrice: resolvedRentalPrice,
    optionsPrice: resolvedOptionsPrice,
    deliveryFees: resolvedDeliveryFees,
    discountAmount: resolvedDiscountAmount,
    equipmentDescription: resolvedEquipmentDescription,
    digitalGallery: resolvedDigitalGallery,
    customTemplate: resolvedCustomTemplate,
    deliveryIncluded: resolvedDeliveryIncluded,
    setupIncluded: resolvedSetupIncluded,
    operatorIncluded: resolvedOperatorIncluded,
    optionsList: resolvedOptionsList,
    currency: resolvedCurrency,
    language: resolvedLanguage,
    value: resolvedValue,
  });

  const [contract] = await db.insert(contracts).values({
    userId: user.id,
    leadId: resolvedLeadId ?? null,
    quoteId: resolvedQuoteId ?? null,
    contractNumber,
    title,
    clientName: resolvedClientName,
    clientEmail: resolvedClientEmail ?? null,
    clientPhone: resolvedClientPhone ?? null,
    clientCompany: resolvedClientCompany ?? null,
    clientAddress: resolvedClientAddress ?? null,
    eventType: resolvedEventType ?? null,
    eventDate: resolvedEventDateObj,
    eventLocation: resolvedEventLocation ?? null,
    eventStartTime: resolvedEventStartTime ?? null,
    eventEndTime: resolvedEventEndTime ?? null,
    packageName: resolvedPackageName ?? null,
    rentalDuration: resolvedRentalDuration ?? null,
    includedPrints: resolvedIncludedPrints ?? null,
    rentalPrice: resolvedRentalPrice ?? null,
    optionsPrice: resolvedOptionsPrice ?? null,
    deliveryFees: resolvedDeliveryFees ?? null,
    discountAmount: resolvedDiscountAmount ?? null,
    equipmentDescription: resolvedEquipmentDescription ?? null,
    digitalGallery: resolvedDigitalGallery ?? false,
    customTemplate: resolvedCustomTemplate ?? false,
    deliveryIncluded: resolvedDeliveryIncluded ?? false,
    setupIncluded: resolvedSetupIncluded ?? false,
    operatorIncluded: resolvedOperatorIncluded ?? false,
    optionsList: resolvedOptionsList ?? null,
    currency: resolvedCurrency ?? null,
    language: resolvedLanguage ?? null,
    content: processedContent,
    value: resolvedValue ?? "0",
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    notes: notes ?? null,
    equipmentIds: resolvedEquipmentIds ?? null,
  }).returning();

  // Update lead pipeline stage
  if (resolvedLeadId) await updateLeadPipelineStage(resolvedLeadId, "contract_created", user.id);

  res.status(201).json(contract);
});

// GET /contracts/:id
router.get("/contracts/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [contract] = await db.select().from(contracts).where(and(eq(contracts.id, String(req.params.id)), eq(contracts.userId, user.id)));
  if (!contract) { res.status(404).json({ error: "Not found" }); return; }
  res.json(contract);
});

// PUT /contracts/:id
router.put("/contracts/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);
  const [existing] = await db.select().from(contracts).where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const {
    leadId, quoteId, title, clientName, clientEmail, clientPhone, clientCompany, clientAddress,
    content, value, startDate, endDate, notes, eventType, eventDate, currency, language,
  } = req.body as {
    leadId?: string | null; quoteId?: string | null; title?: string; clientName?: string;
    clientEmail?: string | null; clientPhone?: string | null; clientCompany?: string | null; clientAddress?: string | null;
    content?: string; value?: string; startDate?: string; endDate?: string; notes?: string | null;
    eventType?: string | null; eventDate?: string | null; currency?: string | null; language?: string | null;
  };

  const [updated] = await db.update(contracts).set({
    leadId: leadId !== undefined ? (leadId ?? null) : existing.leadId,
    quoteId: quoteId !== undefined ? (quoteId ?? null) : existing.quoteId,
    title: title ?? existing.title,
    clientName: clientName ?? existing.clientName,
    clientEmail: clientEmail !== undefined ? clientEmail : existing.clientEmail,
    clientPhone: clientPhone !== undefined ? clientPhone : existing.clientPhone,
    clientCompany: clientCompany !== undefined ? clientCompany : existing.clientCompany,
    clientAddress: clientAddress !== undefined ? clientAddress : existing.clientAddress,
    eventType: eventType !== undefined ? eventType : existing.eventType,
    eventDate: eventDate !== undefined ? (eventDate ? new Date(eventDate) : null) : existing.eventDate,
    currency: currency !== undefined ? currency : existing.currency,
    language: language !== undefined ? language : existing.language,
    content: content ?? existing.content,
    value: value ?? existing.value,
    startDate: startDate ? new Date(startDate) : existing.startDate,
    endDate: endDate ? new Date(endDate) : existing.endDate,
    notes: notes !== undefined ? notes : existing.notes,
    updatedAt: new Date(),
  }).where(eq(contracts.id, id)).returning();
  res.json(updated);
});

// DELETE /contracts/:id
router.delete("/contracts/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);
  const [existing] = await db.select().from(contracts).where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(contracts).where(eq(contracts.id, id));
  res.status(204).send();
});

// PATCH /contracts/:id/status
router.patch("/contracts/:id/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);
  const [existing] = await db.select().from(contracts).where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const { status } = req.body as { status: typeof contracts.status._.data };
  if (!status) { res.status(400).json({ error: "status required" }); return; }
  const extra: { sentAt?: Date; signedAt?: Date } = {};
  if (status === "sent") extra.sentAt = new Date();
  if (status === "signed") extra.signedAt = new Date();
  const [updated] = await db.update(contracts).set({ status, ...extra, updatedAt: new Date() }).where(eq(contracts.id, id)).returning();

  // Update lead pipeline stage
  if (existing.leadId) {
    if (status === "signed") await updateLeadPipelineStage(existing.leadId, "contract_signed", user.id);
    else if (status === "cancelled") await updateLeadPipelineStage(existing.leadId, "lost", user.id);
  }

  // Auto-create or update linked event when contract is signed
  if (status === "signed" && existing.eventDate) {
    const eventTitle = existing.eventType
      ? `${existing.clientName} — ${existing.eventType}`
      : existing.clientName;
    const [linked] = await db.select().from(events)
      .where(and(eq(events.contractId, existing.id), eq(events.userId, user.id)));
    if (linked) {
      await db.update(events).set({
        title: eventTitle,
        type: existing.eventType ?? linked.type,
        eventDate: existing.eventDate,
        revenue: existing.value,
        currency: existing.currency ?? linked.currency,
        leadId: existing.leadId ?? linked.leadId,
        quoteId: existing.quoteId ?? linked.quoteId,
        clientName: existing.clientName ?? linked.clientName,
        clientEmail: existing.clientEmail ?? linked.clientEmail,
        clientPhone: existing.clientPhone ?? linked.clientPhone,
        clientCompany: existing.clientCompany ?? linked.clientCompany,
        location: existing.eventLocation ?? linked.location,
        packageName: existing.packageName ?? linked.packageName,
        rentalDuration: existing.rentalDuration ?? linked.rentalDuration,
        includedPrints: existing.includedPrints ?? linked.includedPrints,
        equipmentIds: existing.equipmentIds ?? linked.equipmentIds,
        equipmentDescription: existing.equipmentDescription ?? linked.equipmentDescription,
        updatedAt: new Date(),
      }).where(eq(events.id, linked.id));
    } else {
      await db.insert(events).values({
        userId: user.id,
        contractId: existing.id,
        leadId: existing.leadId ?? null,
        quoteId: existing.quoteId ?? null,
        title: eventTitle,
        type: existing.eventType ?? null,
        eventDate: existing.eventDate,
        revenue: existing.value,
        currency: existing.currency ?? null,
        status: "upcoming",
        clientName: existing.clientName ?? null,
        clientEmail: existing.clientEmail ?? null,
        clientPhone: existing.clientPhone ?? null,
        clientCompany: existing.clientCompany ?? null,
        location: existing.eventLocation ?? null,
        packageName: existing.packageName ?? null,
        rentalDuration: existing.rentalDuration ?? null,
        includedPrints: existing.includedPrints ?? null,
        equipmentIds: existing.equipmentIds ?? null,
        equipmentDescription: existing.equipmentDescription ?? null,
      });
    }
  }

  // Cancel linked event when contract is cancelled
  if (status === "cancelled") {
    await db.update(events).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(events.contractId, existing.id), eq(events.userId, user.id)));
  }

  res.json(updated);
});

// ─── Contract Templates ──────────────────────────────────────────────────────

// GET /contract-templates — list (with optional ?lang= filter)
router.get("/contract-templates", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { lang } = req.query as { lang?: string };
  const rows = lang
    ? await db.select().from(contractTemplates).where(eq(contractTemplates.language, lang)).orderBy(contractTemplates.createdAt)
    : await db.select().from(contractTemplates).orderBy(contractTemplates.createdAt);
  res.json({ items: rows });
});

// POST /contract-templates — create (admin)
router.post("/contract-templates", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const { language, title, content, category, isDefault } = req.body as {
    language: string; title: string; content: string; category?: string; isDefault?: boolean;
  };
  if (!language || !title || !content) { res.status(400).json({ error: "language, title and content required" }); return; }
  const [tpl] = await db.insert(contractTemplates).values({
    language, title, content, category: category ?? "general", isDefault: isDefault ?? false,
  }).returning();
  res.status(201).json(tpl);
});

// POST /contract-templates/reset — MUST come before /:id
router.post("/contract-templates/reset", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const { lang } = req.body as { lang?: string };
  const targets = lang
    ? DEFAULT_CONTRACT_TEMPLATES.filter((t) => t.language === lang)
    : DEFAULT_CONTRACT_TEMPLATES;
  let reset = 0;
  for (const tpl of targets) {
    const [existing] = await db.select().from(contractTemplates)
      .where(and(eq(contractTemplates.language, tpl.language), eq(contractTemplates.isDefault, true)));
    if (existing) {
      await db.update(contractTemplates).set({ title: tpl.title, content: tpl.content, updatedAt: new Date() }).where(eq(contractTemplates.id, existing.id));
    } else {
      await db.insert(contractTemplates).values({ language: tpl.language, title: tpl.title, content: tpl.content, isDefault: true });
    }
    reset++;
  }
  res.json({ reset });
});

// GET /contract-templates/default/:lang — MUST come before /:id
router.get("/contract-templates/default/:lang", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const lang = String(req.params.lang);
  const [tpl] = await db.select().from(contractTemplates)
    .where(and(eq(contractTemplates.language, lang), eq(contractTemplates.isDefault, true)));
  if (!tpl) {
    const hardcoded = DEFAULT_CONTRACT_TEMPLATES.find((t) => t.language === lang) ?? DEFAULT_CONTRACT_TEMPLATES[0];
    res.json({ id: "default", language: lang, title: hardcoded.title, content: hardcoded.content, isDefault: true, category: "general", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return;
  }
  res.json(tpl);
});

// PUT /contract-templates/:id — update (admin)
router.put("/contract-templates/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params.id);
  const { language, title, content, category, isDefault } = req.body as {
    language?: string; title?: string; content?: string; category?: string; isDefault?: boolean;
  };
  const [updated] = await db.update(contractTemplates).set({
    ...(language && { language }), ...(title && { title }),
    ...(content !== undefined && { content }), ...(category && { category }),
    ...(isDefault !== undefined && { isDefault }), updatedAt: new Date(),
  }).where(eq(contractTemplates.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// DELETE /contract-templates/:id — (admin)
router.delete("/contract-templates/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(contractTemplates).where(eq(contractTemplates.id, String(req.params.id)));
  res.status(204).send();
});

export default router;
