import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  contracts,
  contractTemplates,
  leads,
  quotes,
  invoices,
  events,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { validateOwnedLinks } from "../lib/ownership";
import { getOrCreateUser } from "../lib/userSync";
import { DEFAULT_CONTRACT_TEMPLATES } from "../lib/defaultContractTemplates";
import { nextContractNumber } from "../lib/documentNumberQueries";
import { parseOptionalDateInput } from "../lib/dateInput";

const router: IRouter = Router();

function conflictingSourceLink(
  provided: string | null | undefined,
  source: string | null | undefined,
  field: string,
): string | null {
  if (!provided) return null;
  if (source && provided === source) return null;
  return `${field} does not match the selected source document`;
}

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

const CONTRACT_RENDERED_FIELD_KEYS = [
  "clientName",
  "clientEmail",
  "clientPhone",
  "clientCompany",
  "clientAddress",
  "eventType",
  "eventDate",
  "eventLocation",
  "eventStartTime",
  "eventEndTime",
  "setupTime",
  "pickupTime",
  "packageName",
  "rentalDuration",
  "includedPrints",
  "rentalPrice",
  "optionsPrice",
  "deliveryFees",
  "discountAmount",
  "taxRate",
  "depositAmount",
  "depositMethod",
  "depositConditions",
  "depositReturn",
  "paymentTerms",
  "cancellationTerms",
  "signaturePlace",
  "equipmentDescription",
  "digitalGallery",
  "customTemplate",
  "deliveryIncluded",
  "setupIncluded",
  "operatorIncluded",
  "optionsList",
  "currency",
  "language",
  "value",
] as const;

function includesRenderedContractField(body: Record<string, unknown>): boolean {
  return CONTRACT_RENDERED_FIELD_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(body, key),
  );
}

function fillContractVariables(
  template: string,
  data: {
    contractNumber: string;
    providerCompanyName?: string | null;
    providerRepresentative?: string | null;
    providerAddress?: string | null;
    providerEmail?: string | null;
    providerPhone?: string | null;
    providerWebsite?: string | null;
    providerLogoUrl?: string | null;
    providerTaxId?: string | null;
    providerSignature?: string | null;
    providerSignerTitle?: string | null;
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
    setupTime?: string | null;
    pickupTime?: string | null;
    packageName?: string | null;
    rentalDuration?: string | null;
    includedPrints?: string | null;
    rentalPrice?: string | null;
    optionsPrice?: string | null;
    deliveryFees?: string | null;
    discountAmount?: string | null;
    taxRate?: string | null;
    depositAmount?: string | null;
    depositMethod?: string | null;
    depositConditions?: string | null;
    depositReturn?: string | null;
    paymentTerms?: string | null;
    cancellationTerms?: string | null;
    signaturePlace?: string | null;
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
  },
): string {
  const HIDE = "\x00HIDE_LINE\x00";

  const INCLUDED: Record<string, string> = {
    en: "Included",
    fr: "Inclus",
    es: "Incluido",
    de: "Inklusive",
    it: "Incluso",
    nl: "Inbegrepen",
    pl: "W zestawie",
    pt: "Incluído",
  };
  // Locale strings reach toLocaleDateString/toLocaleString below; anything
  // outside the supported set would throw a RangeError mid-generation.
  const lang =
    data.language && data.language in INCLUDED ? data.language : "en";
  const included = (flag: boolean | null | undefined) =>
    flag ? (INCLUDED[lang] ?? "Included") : HIDE;

  const fmt = (v: string | null | undefined) => v?.trim() || HIDE;
  const fmtVisible = (v: string | null | undefined) => v?.trim() || "";

  const fmtDate = (d: Date | null | undefined) => {
    if (!d || Number.isNaN(d.getTime())) return HIDE;
    return d.toLocaleDateString(lang, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const fmtAmount = (v: string | null | undefined) => {
    if (!v || Number(v) === 0) return HIDE;
    return `${Number(v).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.currency ?? "€"}`;
  };
  const amountNumber = (v: string | null | undefined) =>
    v && Number.isFinite(Number(v)) ? Number(v) : 0;
  const rentalAmount = amountNumber(data.rentalPrice);
  const optionsAmount = amountNumber(data.optionsPrice);
  const deliveryAmount = amountNumber(data.deliveryFees);
  const discountAmount = amountNumber(data.discountAmount);
  const taxRate = amountNumber(data.taxRate);
  const subtotal = Math.max(
    0,
    rentalAmount + optionsAmount + deliveryAmount - discountAmount,
  );
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount =
    data.value && Number.isFinite(Number(data.value))
      ? Number(data.value)
      : subtotal + taxAmount;
  const fmtComputedAmount = (v: number) =>
    v === 0
      ? HIDE
      : `${v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.currency ?? "€"}`;
  const today = new Date().toLocaleDateString(lang, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const nameParts = (data.clientName ?? "").split(" ");
  const firstName = fmt(nameParts[0]);
  const lastName =
    nameParts.length > 1 ? fmt(nameParts.slice(1).join(" ")) : HIDE;

  const equipList = data.equipmentDescription
    ? data.equipmentDescription
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .join("\n")
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
    .replace(/\{\{subtotal\}\}/g, fmtComputedAmount(subtotal))
    .replace(/\{\{tax_rate\}\}/g, taxRate > 0 ? String(taxRate) : HIDE)
    .replace(/\{\{tax_amount\}\}/g, fmtComputedAmount(taxAmount))
    .replace(/\{\{total_amount\}\}/g, fmtComputedAmount(totalAmount))
    .replace(/\{\{currency\}\}/g, "")
    .replace(/\{\{rental_company_name\}\}/g, fmt(data.providerCompanyName))
    .replace(
      /\{\{rental_company_representative\}\}/g,
      fmt(data.providerRepresentative),
    )
    .replace(/\{\{rental_company_address\}\}/g, fmt(data.providerAddress))
    .replace(/\{\{rental_company_email\}\}/g, fmt(data.providerEmail))
    .replace(/\{\{rental_company_phone\}\}/g, fmt(data.providerPhone))
    .replace(/\{\{rental_company_website\}\}/g, fmt(data.providerWebsite))
    .replace(/\{\{rental_company_logo\}\}/g, fmt(data.providerLogoUrl))
    .replace(/\{\{company_logo_url\}\}/g, fmt(data.providerLogoUrl))
    .replace(/\{\{rental_company_vat\}\}/g, fmt(data.providerTaxId))
    .replace(/\{\{setup_time\}\}/g, fmt(data.setupTime))
    .replace(/\{\{pickup_time\}\}/g, fmt(data.pickupTime))
    .replace(/\{\{deposit_amount\}\}/g, fmtAmount(data.depositAmount))
    .replace(/\{\{deposit_method\}\}/g, fmt(data.depositMethod))
    .replace(/\{\{deposit_conditions\}\}/g, fmt(data.depositConditions))
    .replace(/\{\{deposit_return\}\}/g, fmt(data.depositReturn))
    .replace(/\{\{cancellation_terms\}\}/g, fmt(data.cancellationTerms))
    .replace(/\{\{payment_terms\}\}/g, fmt(data.paymentTerms))
    .replace(/\{\{signature_place\}\}/g, fmt(data.signaturePlace))
    .replace(/\{\{signature_date\}\}/g, today)
    .replace(
      /\{\{provider_signature\}\}/g,
      fmtVisible(data.providerSignature) || "_________________________________",
    )
    .replace(/\{\{provider_signer_title\}\}/g, fmt(data.providerSignerTitle))
    // Catch-all for any remaining {{...}} except contract_number (already replaced above)
    .replace(/\{\{(?!contract_number\}\})[^}]+\}\}/g, HIDE);

  // Filter lines with HIDE marker, then collapse excess blank lines
  const lines = result.split("\n");
  const filtered = lines.filter((line) => !line.includes("\x00HIDE_LINE\x00"));
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
router.get(
  "/contracts",
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
    const conditions = [eq(contracts.userId, user.id)];
    if (status)
      conditions.push(
        eq(contracts.status, status as typeof contracts.status._.data),
      );
    const [rows, countRow] = await Promise.all([
      db
        .select()
        .from(contracts)
        .where(and(...conditions))
        .orderBy(desc(contracts.updatedAt))
        .limit(Number(limit))
        .offset(Number(offset)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contracts)
        .where(and(...conditions)),
    ]);
    res.json({ items: rows, total: countRow[0]?.count ?? 0 });
  },
);

// POST /contracts
router.post(
  "/contracts",
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
      invoiceId,
      templateId,
      title,
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      clientAddress,
      content,
      value,
      startDate,
      endDate,
      notes,
      eventType,
      eventDate,
      currency,
      language,
      eventLocation,
      eventStartTime,
      eventEndTime,
      setupTime,
      pickupTime,
      packageName,
      rentalDuration,
      includedPrints,
      rentalPrice,
      optionsPrice,
      deliveryFees,
      discountAmount,
      taxRate,
      depositAmount,
      depositMethod,
      depositConditions,
      depositReturn,
      paymentTerms,
      cancellationTerms,
      signaturePlace,
      equipmentDescription,
      digitalGallery,
      customTemplate,
      deliveryIncluded,
      setupIncluded,
      operatorIncluded,
      optionsList,
      equipmentIds,
    } = req.body as {
      leadId?: string;
      quoteId?: string;
      invoiceId?: string;
      templateId?: string;
      title: string;
      clientName: string;
      clientEmail?: string;
      clientPhone?: string;
      clientCompany?: string;
      clientAddress?: string;
      content?: string;
      value?: string;
      startDate?: string;
      endDate?: string;
      notes?: string;
      eventType?: string;
      eventDate?: string;
      currency?: string;
      language?: string;
      eventLocation?: string;
      eventStartTime?: string;
      eventEndTime?: string;
      setupTime?: string;
      pickupTime?: string;
      packageName?: string;
      rentalDuration?: string;
      includedPrints?: string;
      rentalPrice?: string;
      optionsPrice?: string;
      deliveryFees?: string;
      discountAmount?: string;
      taxRate?: string;
      depositAmount?: string;
      depositMethod?: string;
      depositConditions?: string;
      depositReturn?: string;
      paymentTerms?: string;
      cancellationTerms?: string;
      signaturePlace?: string;
      equipmentDescription?: string;
      digitalGallery?: boolean;
      customTemplate?: boolean;
      deliveryIncluded?: boolean;
      setupIncluded?: boolean;
      operatorIncluded?: boolean;
      optionsList?: string;
      equipmentIds?: string[];
    };
    if (!title || !clientName) {
      res.status(400).json({ error: "title and clientName required" });
      return;
    }

    const incomingLinksValidation = await validateOwnedLinks(user.id, {
      leadId,
      quoteId,
      invoiceId,
      equipmentIds,
    });
    if (!incomingLinksValidation.ok) {
      res
        .status(incomingLinksValidation.status)
        .json({ error: incomingLinksValidation.error });
      return;
    }

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
    let resolvedSetupTime = setupTime;
    let resolvedPickupTime = pickupTime;
    let resolvedPackageName = packageName;
    let resolvedRentalDuration = rentalDuration;
    let resolvedIncludedPrints = includedPrints;
    let resolvedRentalPrice = rentalPrice;
    let resolvedOptionsPrice = optionsPrice;
    let resolvedDeliveryFees = deliveryFees;
    let resolvedDiscountAmount = discountAmount;
    let resolvedTaxRate = taxRate;
    let resolvedDepositAmount = depositAmount;
    let resolvedDepositMethod = depositMethod;
    let resolvedDepositConditions = depositConditions;
    let resolvedDepositReturn = depositReturn;
    let resolvedPaymentTerms = paymentTerms;
    let resolvedCancellationTerms = cancellationTerms;
    let resolvedSignaturePlace = signaturePlace;
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
      const [inv] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id)));
      if (inv) {
        const leadConflict = conflictingSourceLink(leadId, inv.leadId, "leadId");
        const quoteConflict = conflictingSourceLink(
          quoteId,
          inv.quoteId,
          "quoteId",
        );
        if (leadConflict || quoteConflict) {
          res.status(400).json({ error: leadConflict ?? quoteConflict });
          return;
        }

        resolvedClientName = clientName || inv.clientName;
        resolvedClientEmail = clientEmail ?? inv.clientEmail ?? undefined;
        resolvedClientPhone = clientPhone ?? inv.clientPhone ?? undefined;
        resolvedClientCompany = clientCompany ?? inv.clientCompany ?? undefined;
        resolvedClientAddress = clientAddress ?? inv.clientAddress ?? undefined;
        resolvedEventType = eventType ?? inv.eventType ?? undefined;
        resolvedEventDate =
          eventDate ??
          (inv.eventDate ? inv.eventDate.toISOString() : undefined);
        resolvedEventLocation = eventLocation ?? inv.eventLocation ?? undefined;
        resolvedEventStartTime =
          eventStartTime ?? inv.eventStartTime ?? undefined;
        resolvedEventEndTime = eventEndTime ?? inv.eventEndTime ?? undefined;
        resolvedPackageName = packageName ?? inv.packageName ?? undefined;
        resolvedRentalDuration =
          rentalDuration ?? inv.rentalDuration ?? undefined;
        resolvedIncludedPrints =
          includedPrints ?? inv.includedPrints ?? undefined;
        resolvedRentalPrice = rentalPrice ?? inv.rentalPrice ?? undefined;
        resolvedOptionsPrice = optionsPrice ?? inv.optionsPrice ?? undefined;
        resolvedDeliveryFees = deliveryFees ?? inv.deliveryFees ?? undefined;
        resolvedDiscountAmount =
          discountAmount ?? inv.discountAmount ?? undefined;
        resolvedTaxRate = taxRate ?? inv.taxRate ?? undefined;
        resolvedEquipmentDescription =
          equipmentDescription ?? inv.equipmentDescription ?? undefined;
        resolvedDigitalGallery =
          digitalGallery ?? inv.digitalGallery ?? undefined;
        resolvedCustomTemplate =
          customTemplate ?? inv.customTemplate ?? undefined;
        resolvedDeliveryIncluded =
          deliveryIncluded ?? inv.deliveryIncluded ?? undefined;
        resolvedSetupIncluded = setupIncluded ?? inv.setupIncluded ?? undefined;
        resolvedOperatorIncluded =
          operatorIncluded ?? inv.operatorIncluded ?? undefined;
        resolvedOptionsList = optionsList ?? inv.optionsList ?? undefined;
        resolvedValue = value ?? inv.total ?? undefined;
        resolvedLeadId = leadId ?? inv.leadId ?? undefined;
        resolvedQuoteId = quoteId ?? inv.quoteId ?? undefined;
        resolvedCurrency = currency ?? inv.currency ?? undefined;
        resolvedLanguage = language ?? inv.language ?? undefined;
      }
      // Source: Quote
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

        resolvedClientName = clientName || quote.clientName;
        resolvedClientEmail = clientEmail ?? quote.clientEmail ?? undefined;
        resolvedClientPhone = clientPhone ?? quote.clientPhone ?? undefined;
        resolvedClientCompany =
          clientCompany ?? quote.clientCompany ?? undefined;
        resolvedClientAddress =
          clientAddress ?? quote.clientAddress ?? undefined;
        resolvedEventType = eventType ?? quote.eventType ?? undefined;
        resolvedEventDate =
          eventDate ??
          (quote.eventDate ? quote.eventDate.toISOString() : undefined);
        resolvedEventLocation =
          eventLocation ?? quote.eventLocation ?? undefined;
        resolvedEventStartTime =
          eventStartTime ?? quote.eventStartTime ?? undefined;
        resolvedEventEndTime = eventEndTime ?? quote.eventEndTime ?? undefined;
        resolvedPackageName = packageName ?? quote.packageName ?? undefined;
        resolvedRentalDuration =
          rentalDuration ?? quote.rentalDuration ?? undefined;
        resolvedIncludedPrints =
          includedPrints ?? quote.includedPrints ?? undefined;
        resolvedRentalPrice = rentalPrice ?? quote.rentalPrice ?? undefined;
        resolvedOptionsPrice = optionsPrice ?? quote.optionsPrice ?? undefined;
        resolvedDeliveryFees = deliveryFees ?? quote.deliveryFees ?? undefined;
        resolvedDiscountAmount =
          discountAmount ?? quote.discountAmount ?? undefined;
        resolvedTaxRate = taxRate ?? quote.taxRate ?? undefined;
        resolvedEquipmentDescription =
          equipmentDescription ?? quote.equipmentDescription ?? undefined;
        resolvedDigitalGallery =
          digitalGallery ?? quote.digitalGallery ?? undefined;
        resolvedCustomTemplate =
          customTemplate ?? quote.customTemplate ?? undefined;
        resolvedDeliveryIncluded =
          deliveryIncluded ?? quote.deliveryIncluded ?? undefined;
        resolvedSetupIncluded =
          setupIncluded ?? quote.setupIncluded ?? undefined;
        resolvedOperatorIncluded =
          operatorIncluded ?? quote.operatorIncluded ?? undefined;
        resolvedOptionsList = optionsList ?? quote.optionsList ?? undefined;
        resolvedValue = value ?? quote.total ?? undefined;
        resolvedLeadId = leadId ?? quote.leadId ?? undefined;
        resolvedCurrency = currency ?? quote.currency ?? undefined;
        resolvedLanguage = language ?? quote.language ?? undefined;
      }
      // Source: Lead
    } else if (leadId) {
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
        resolvedValue = value ?? lead.value;
      }
    }

    const resolvedLinksValidation = await validateOwnedLinks(user.id, {
      leadId: resolvedLeadId ?? null,
      quoteId: resolvedQuoteId ?? null,
      equipmentIds: resolvedEquipmentIds ?? null,
    });
    if (!resolvedLinksValidation.ok) {
      res
        .status(resolvedLinksValidation.status)
        .json({ error: resolvedLinksValidation.error });
      return;
    }

    // Resolve template content
    let finalContent = content ?? "";
    if (!finalContent) {
      if (templateId) {
        const [tpl] = await db
          .select()
          .from(contractTemplates)
          .where(eq(contractTemplates.id, templateId));
        if (tpl) finalContent = tpl.content;
      }
      // Auto-select default template by language if still empty
      if (!finalContent) {
        const lang = resolvedLanguage ?? "en";
        const [dbTpl] = await db
          .select()
          .from(contractTemplates)
          .where(
            and(
              eq(contractTemplates.language, lang),
              eq(contractTemplates.isDefault, true),
            ),
          );
        if (dbTpl) {
          finalContent = dbTpl.content;
        } else {
          const bundled =
            DEFAULT_CONTRACT_TEMPLATES.find((t) => t.language === lang) ??
            DEFAULT_CONTRACT_TEMPLATES.find((t) => t.language === "en");
          if (bundled) finalContent = bundled.content;
        }
      }
    }

    const eventDateInput = parseOptionalDateInput("eventDate", resolvedEventDate);
    const startDateInput = parseOptionalDateInput("startDate", startDate);
    const endDateInput = parseOptionalDateInput("endDate", endDate);
    for (const parsed of [eventDateInput, startDateInput, endDateInput]) {
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
    }
    const resolvedEventDateObj = eventDateInput.ok ? eventDateInput.value : null;

    const contract = await db.transaction(async (tx) => {
      const contractNumber = await nextContractNumber(user.id, tx);
      const processedContent = fillContractVariables(finalContent, {
        contractNumber,
        providerCompanyName: user.companyName,
        providerRepresentative:
          user.fullName ??
          [user.firstName, user.lastName].filter(Boolean).join(" "),
        providerAddress:
          user.companyAddress ??
          [user.city, user.country].filter(Boolean).join(", "),
        providerEmail: user.email,
        providerPhone: user.phone,
        providerWebsite: user.website,
        providerLogoUrl: user.logoUrl,
        providerTaxId: user.taxId,
        providerSignature: user.providerSignature,
        providerSignerTitle: user.providerSignerTitle,
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
        setupTime: resolvedSetupTime,
        pickupTime: resolvedPickupTime,
        packageName: resolvedPackageName,
        rentalDuration: resolvedRentalDuration,
        includedPrints: resolvedIncludedPrints,
        rentalPrice: resolvedRentalPrice,
        optionsPrice: resolvedOptionsPrice,
        deliveryFees: resolvedDeliveryFees,
        discountAmount: resolvedDiscountAmount,
        taxRate: resolvedTaxRate,
        depositAmount: resolvedDepositAmount,
        depositMethod: resolvedDepositMethod,
        depositConditions: resolvedDepositConditions,
        depositReturn: resolvedDepositReturn,
        paymentTerms: resolvedPaymentTerms,
        cancellationTerms: resolvedCancellationTerms,
        signaturePlace: resolvedSignaturePlace,
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

      const [createdContract] = await tx
        .insert(contracts)
        .values({
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
        setupTime: resolvedSetupTime ?? null,
        pickupTime: resolvedPickupTime ?? null,
        packageName: resolvedPackageName ?? null,
        rentalDuration: resolvedRentalDuration ?? null,
        includedPrints: resolvedIncludedPrints ?? null,
        rentalPrice: resolvedRentalPrice ?? null,
        optionsPrice: resolvedOptionsPrice ?? null,
        deliveryFees: resolvedDeliveryFees ?? null,
        discountAmount: resolvedDiscountAmount ?? null,
        taxRate: resolvedTaxRate ?? null,
        depositAmount: resolvedDepositAmount ?? null,
        depositMethod: resolvedDepositMethod ?? null,
        depositConditions: resolvedDepositConditions ?? null,
        depositReturn: resolvedDepositReturn ?? null,
        paymentTerms: resolvedPaymentTerms ?? null,
        cancellationTerms: resolvedCancellationTerms ?? null,
        signaturePlace: resolvedSignaturePlace ?? null,
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
        startDate: startDateInput.ok ? startDateInput.value : null,
        endDate: endDateInput.ok ? endDateInput.value : null,
        notes: notes ?? null,
        equipmentIds: resolvedEquipmentIds ?? null,
      })
      .returning();

      if (!createdContract) throw new Error("Contract creation failed");

      if (invoiceId) {
        await tx
          .update(invoices)
          .set({ contractId: createdContract.id, updatedAt: new Date() })
          .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, user.id)));
      }

      if (resolvedLeadId) {
        await tx
          .update(leads)
          .set({ pipelineStage: "contract_created", updatedAt: new Date() })
          .where(and(eq(leads.id, resolvedLeadId), eq(leads.userId, user.id)));
      }

      return createdContract;
    });

    res.status(201).json(contract);
  },
);

// GET /contracts/:id
router.get(
  "/contracts/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [contract] = await db
      .select()
      .from(contracts)
      .where(
        and(
          eq(contracts.id, String(req.params.id)),
          eq(contracts.userId, user.id),
        ),
      );
    if (!contract) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(contract);
  },
);

// PUT /contracts/:id
router.put(
  "/contracts/:id",
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
      .from(contracts)
      .where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const {
      leadId,
      quoteId,
      title,
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      clientAddress,
      content,
      value,
      startDate,
      endDate,
      notes,
      eventType,
      eventDate,
      eventLocation,
      eventStartTime,
      eventEndTime,
      setupTime,
      pickupTime,
      packageName,
      rentalDuration,
      includedPrints,
      rentalPrice,
      optionsPrice,
      deliveryFees,
      discountAmount,
      taxRate,
      depositAmount,
      depositMethod,
      depositConditions,
      depositReturn,
      paymentTerms,
      cancellationTerms,
      signaturePlace,
      equipmentIds,
      equipmentDescription,
      digitalGallery,
      customTemplate,
      deliveryIncluded,
      setupIncluded,
      operatorIncluded,
      optionsList,
      currency,
      language,
    } = req.body as {
      leadId?: string | null;
      quoteId?: string | null;
      title?: string;
      clientName?: string;
      clientEmail?: string | null;
      clientPhone?: string | null;
      clientCompany?: string | null;
      clientAddress?: string | null;
      content?: string;
      value?: string;
      startDate?: string;
      endDate?: string;
      notes?: string | null;
      eventType?: string | null;
      eventDate?: string | null;
      eventLocation?: string | null;
      eventStartTime?: string | null;
      eventEndTime?: string | null;
      setupTime?: string | null;
      pickupTime?: string | null;
      packageName?: string | null;
      rentalDuration?: string | null;
      includedPrints?: string | null;
      rentalPrice?: string | null;
      optionsPrice?: string | null;
      deliveryFees?: string | null;
      discountAmount?: string | null;
      taxRate?: string | null;
      depositAmount?: string | null;
      depositMethod?: string | null;
      depositConditions?: string | null;
      depositReturn?: string | null;
      paymentTerms?: string | null;
      cancellationTerms?: string | null;
      signaturePlace?: string | null;
      equipmentIds?: string[] | null;
      equipmentDescription?: string | null;
      digitalGallery?: boolean;
      customTemplate?: boolean;
      deliveryIncluded?: boolean;
      setupIncluded?: boolean;
      operatorIncluded?: boolean;
      optionsList?: string | null;
      currency?: string | null;
      language?: string | null;
    };

    if (includesRenderedContractField(req.body as Record<string, unknown>)) {
      res.status(400).json({
        error:
          "fields rendered in contract text cannot be updated directly; regenerate the contract or edit content only",
      });
      return;
    }

    const startDateInput = parseOptionalDateInput("startDate", startDate);
    const endDateInput = parseOptionalDateInput("endDate", endDate);
    for (const parsed of [startDateInput, endDateInput]) {
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
    }

    const effectiveLeadId = leadId !== undefined ? leadId : existing.leadId;
    const effectiveQuoteId = quoteId !== undefined ? quoteId : existing.quoteId;
    const effectiveEquipmentIds =
      equipmentIds !== undefined ? equipmentIds : existing.equipmentIds;
    const linkValidation = await validateOwnedLinks(user.id, {
      leadId: effectiveLeadId,
      quoteId: effectiveQuoteId,
      equipmentIds: effectiveEquipmentIds ?? null,
    });
    if (!linkValidation.ok) {
      res.status(linkValidation.status).json({ error: linkValidation.error });
      return;
    }

    const [updated] = await db
      .update(contracts)
      .set({
        leadId: effectiveLeadId ?? null,
        quoteId: effectiveQuoteId ?? null,
        title: title ?? existing.title,
        clientName: clientName ?? existing.clientName,
        clientEmail:
          clientEmail !== undefined ? clientEmail : existing.clientEmail,
        clientPhone:
          clientPhone !== undefined ? clientPhone : existing.clientPhone,
        clientCompany:
          clientCompany !== undefined ? clientCompany : existing.clientCompany,
        clientAddress:
          clientAddress !== undefined ? clientAddress : existing.clientAddress,
        eventType: eventType !== undefined ? eventType : existing.eventType,
        eventDate:
          eventDate !== undefined
            ? eventDate
              ? new Date(eventDate)
              : null
            : existing.eventDate,
        eventLocation:
          eventLocation !== undefined ? eventLocation : existing.eventLocation,
        eventStartTime:
          eventStartTime !== undefined
            ? eventStartTime
            : existing.eventStartTime,
        eventEndTime:
          eventEndTime !== undefined ? eventEndTime : existing.eventEndTime,
        setupTime: setupTime !== undefined ? setupTime : existing.setupTime,
        pickupTime: pickupTime !== undefined ? pickupTime : existing.pickupTime,
        packageName:
          packageName !== undefined ? packageName : existing.packageName,
        rentalDuration:
          rentalDuration !== undefined
            ? rentalDuration
            : existing.rentalDuration,
        includedPrints:
          includedPrints !== undefined
            ? includedPrints
            : existing.includedPrints,
        rentalPrice:
          rentalPrice !== undefined ? rentalPrice : existing.rentalPrice,
        optionsPrice:
          optionsPrice !== undefined ? optionsPrice : existing.optionsPrice,
        deliveryFees:
          deliveryFees !== undefined ? deliveryFees : existing.deliveryFees,
        discountAmount:
          discountAmount !== undefined
            ? discountAmount
            : existing.discountAmount,
        taxRate: taxRate !== undefined ? taxRate : existing.taxRate,
        depositAmount:
          depositAmount !== undefined ? depositAmount : existing.depositAmount,
        depositMethod:
          depositMethod !== undefined ? depositMethod : existing.depositMethod,
        depositConditions:
          depositConditions !== undefined
            ? depositConditions
            : existing.depositConditions,
        depositReturn:
          depositReturn !== undefined ? depositReturn : existing.depositReturn,
        paymentTerms:
          paymentTerms !== undefined ? paymentTerms : existing.paymentTerms,
        cancellationTerms:
          cancellationTerms !== undefined
            ? cancellationTerms
            : existing.cancellationTerms,
        signaturePlace:
          signaturePlace !== undefined
            ? signaturePlace
            : existing.signaturePlace,
        equipmentIds: effectiveEquipmentIds ?? null,
        equipmentDescription:
          equipmentDescription !== undefined
            ? equipmentDescription
            : existing.equipmentDescription,
        digitalGallery:
          digitalGallery !== undefined
            ? digitalGallery
            : existing.digitalGallery,
        customTemplate:
          customTemplate !== undefined
            ? customTemplate
            : existing.customTemplate,
        deliveryIncluded:
          deliveryIncluded !== undefined
            ? deliveryIncluded
            : existing.deliveryIncluded,
        setupIncluded:
          setupIncluded !== undefined ? setupIncluded : existing.setupIncluded,
        operatorIncluded:
          operatorIncluded !== undefined
            ? operatorIncluded
            : existing.operatorIncluded,
        optionsList:
          optionsList !== undefined ? optionsList : existing.optionsList,
        currency: currency !== undefined ? currency : existing.currency,
        language: language !== undefined ? language : existing.language,
        content: content ?? existing.content,
        value: value ?? existing.value,
        startDate:
          startDateInput.ok && startDateInput.value
            ? startDateInput.value
            : existing.startDate,
        endDate:
          endDateInput.ok && endDateInput.value
            ? endDateInput.value
            : existing.endDate,
        notes: notes !== undefined ? notes : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id))
      .returning();
    res.json(updated);
  },
);

// DELETE /contracts/:id
router.delete(
  "/contracts/:id",
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
      .from(contracts)
      .where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db.delete(contracts).where(eq(contracts.id, id));
    res.status(204).send();
  },
);

// PATCH /contracts/:id/status
router.patch(
  "/contracts/:id/status",
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
      .from(contracts)
      .where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { status } = req.body as { status: typeof contracts.status._.data };
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }

    let signedLinkedEvent: typeof events.$inferSelect | undefined;
    let signedEventLeadId = existing.leadId ?? null;
    let signedEventQuoteId = existing.quoteId ?? null;
    let signedEventInvoiceId: string | null = null;
    let signedEventEquipmentIds = existing.equipmentIds ?? null;
    if (status === "signed" && existing.eventDate) {
      const [linked] = await db
        .select()
        .from(events)
        .where(
          and(eq(events.contractId, existing.id), eq(events.userId, user.id)),
        );
      signedLinkedEvent = linked;
      const [linkedInvoice] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.contractId, existing.id),
            eq(invoices.userId, user.id),
          ),
        )
        .limit(1);
      signedEventInvoiceId = linkedInvoice?.id ?? null;
    }

    const statusLinksValidation = await validateOwnedLinks(user.id, {
      leadId: signedEventLeadId,
      quoteId: signedEventQuoteId,
      invoiceId: signedEventInvoiceId,
      contractId: existing.id,
      equipmentIds: signedEventEquipmentIds,
    });
    if (!statusLinksValidation.ok) {
      res
        .status(statusLinksValidation.status)
        .json({ error: statusLinksValidation.error });
      return;
    }

    const extra: { sentAt?: Date; signedAt?: Date } = {};
    if (status === "sent") extra.sentAt = new Date();
    if (status === "signed") extra.signedAt = new Date();
    const [updated] = await db
      .update(contracts)
      .set({ status, ...extra, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning();

    // Update lead pipeline stage
    if (existing.leadId) {
      if (status === "signed")
        await updateLeadPipelineStage(
          existing.leadId,
          "contract_signed",
          user.id,
        );
      else if (status === "cancelled")
        await updateLeadPipelineStage(existing.leadId, "lost", user.id);
    }

    // Auto-create or update linked event when contract is signed
    if (status === "signed" && existing.eventDate) {
      const eventTitle = existing.eventType
        ? `${existing.clientName} — ${existing.eventType}`
        : existing.clientName;
      const linked = signedLinkedEvent;
      if (linked) {
        await db
          .update(events)
          .set({
            title: eventTitle,
            type: existing.eventType ?? linked.type,
            eventDate: existing.eventDate,
            revenue: existing.value,
            currency: existing.currency ?? linked.currency,
            contractId: existing.id,
            invoiceId: signedEventInvoiceId,
            leadId: signedEventLeadId,
            quoteId: signedEventQuoteId,
            clientName: existing.clientName ?? linked.clientName,
            clientEmail: existing.clientEmail ?? linked.clientEmail,
            clientPhone: existing.clientPhone ?? linked.clientPhone,
            clientCompany: existing.clientCompany ?? linked.clientCompany,
            location: existing.eventLocation ?? linked.location,
            packageName: existing.packageName ?? linked.packageName,
            rentalDuration: existing.rentalDuration ?? linked.rentalDuration,
            includedPrints: existing.includedPrints ?? linked.includedPrints,
            equipmentIds: signedEventEquipmentIds,
            equipmentDescription:
              existing.equipmentDescription ?? linked.equipmentDescription,
            updatedAt: new Date(),
          })
          .where(eq(events.id, linked.id));
      } else {
        await db.insert(events).values({
          userId: user.id,
          contractId: existing.id,
          invoiceId: signedEventInvoiceId,
          leadId: signedEventLeadId,
          quoteId: signedEventQuoteId,
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
          equipmentIds: signedEventEquipmentIds,
          equipmentDescription: existing.equipmentDescription ?? null,
        });
      }
    }

    // Cancel linked event when contract is cancelled
    if (status === "cancelled") {
      await db
        .update(events)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(eq(events.contractId, existing.id), eq(events.userId, user.id)),
        );
    }

    res.json(updated);
  },
);

// ─── Contract Templates ──────────────────────────────────────────────────────

// GET /contract-templates — list (with optional ?lang= filter)
router.get(
  "/contract-templates",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { lang } = req.query as { lang?: string };
    const rows = lang
      ? await db
          .select()
          .from(contractTemplates)
          .where(eq(contractTemplates.language, lang))
          .orderBy(
            desc(contractTemplates.isDefault),
            contractTemplates.createdAt,
          )
      : await db
          .select()
          .from(contractTemplates)
          .orderBy(
            desc(contractTemplates.isDefault),
            contractTemplates.createdAt,
          );
    res.json({ items: rows });
  },
);

// POST /contract-templates — create (admin)
router.post(
  "/contract-templates",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { language, title, content, category, isDefault } = req.body as {
      language: string;
      title: string;
      content: string;
      category?: string;
      isDefault?: boolean;
    };
    if (!language || !title || !content) {
      res.status(400).json({ error: "language, title and content required" });
      return;
    }
    const [tpl] = await db
      .insert(contractTemplates)
      .values({
        language,
        title,
        content,
        category: category ?? "general",
        isDefault: isDefault ?? false,
      })
      .returning();
    res.status(201).json(tpl);
  },
);

// POST /contract-templates/reset — MUST come before /:id
router.post(
  "/contract-templates/reset",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { lang } = req.body as { lang?: string };
    const targets = lang
      ? DEFAULT_CONTRACT_TEMPLATES.filter((t) => t.language === lang)
      : DEFAULT_CONTRACT_TEMPLATES;
    let reset = 0;
    for (const tpl of targets) {
      const [existing] = await db
        .select()
        .from(contractTemplates)
        .where(
          and(
            eq(contractTemplates.language, tpl.language),
            eq(contractTemplates.isDefault, true),
          ),
        );
      if (existing) {
        await db
          .update(contractTemplates)
          .set({
            title: tpl.title,
            content: tpl.content,
            updatedAt: new Date(),
          })
          .where(eq(contractTemplates.id, existing.id));
      } else {
        await db.insert(contractTemplates).values({
          language: tpl.language,
          title: tpl.title,
          content: tpl.content,
          isDefault: true,
        });
      }
      reset++;
    }
    res.json({ reset });
  },
);

// GET /contract-templates/default/:lang — MUST come before /:id
router.get(
  "/contract-templates/default/:lang",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const lang = String(req.params.lang);
    const [tpl] = await db
      .select()
      .from(contractTemplates)
      .where(
        and(
          eq(contractTemplates.language, lang),
          eq(contractTemplates.isDefault, true),
        ),
      );
    if (!tpl) {
      const hardcoded =
        DEFAULT_CONTRACT_TEMPLATES.find((t) => t.language === lang) ??
        DEFAULT_CONTRACT_TEMPLATES[0];
      res.json({
        id: "default",
        language: lang,
        title: hardcoded.title,
        content: hardcoded.content,
        isDefault: true,
        category: "general",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    res.json(tpl);
  },
);

// PUT /contract-templates/:id — update (admin)
router.put(
  "/contract-templates/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = String(req.params.id);
    const { language, title, content, category, isDefault } = req.body as {
      language?: string;
      title?: string;
      content?: string;
      category?: string;
      isDefault?: boolean;
    };
    const [updated] = await db
      .update(contractTemplates)
      .set({
        ...(language && { language }),
        ...(title && { title }),
        ...(content !== undefined && { content }),
        ...(category && { category }),
        ...(isDefault !== undefined && { isDefault }),
        updatedAt: new Date(),
      })
      .where(eq(contractTemplates.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  },
);

// DELETE /contract-templates/:id — (admin)
router.delete(
  "/contract-templates/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .delete(contractTemplates)
      .where(eq(contractTemplates.id, String(req.params.id)));
    res.status(204).send();
  },
);

export default router;
