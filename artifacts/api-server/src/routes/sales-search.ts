import { Router, type IRouter, type Request, type Response } from "express";
import { eq, or, ilike, desc, and } from "drizzle-orm";
import { db, leads, quotes, contracts, invoices } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

type SourceType = "lead" | "quote" | "contract" | "invoice";

interface CustomerSuggestion {
  id: string;
  type: SourceType;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  eventType: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  currency: string | null;
  leadId: string | null;
  clientId: string | null;
  quoteId: string | null;
  contractId: string | null;
  invoiceId: string | null;
  pipelineStage: string | null;
  lastActivityAt: string | null;
}

const SOURCE_RANK: Record<SourceType, number> = { lead: 1, quote: 2, contract: 3, invoice: 4 };

// GET /sales/search?q=
router.get("/sales/search", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ items: [] }); return; }

  const isAdmin = user.role === "admin";
  const pattern = `%${q}%`;

  const userLeadCond = isAdmin ? undefined : eq(leads.userId, user.id);
  const userQuoteCond = isAdmin ? undefined : eq(quotes.userId, user.id);
  const userContractCond = isAdmin ? undefined : eq(contracts.userId, user.id);
  const userInvoiceCond = isAdmin ? undefined : eq(invoices.userId, user.id);

  const leadSearch = or(
    ilike(leads.companyName, pattern),
    ilike(leads.contactName, pattern),
    ilike(leads.email!, pattern),
    ilike(leads.phone!, pattern),
  )!;

  const quoteSearch = or(
    ilike(quotes.clientName, pattern),
    ilike(quotes.clientEmail!, pattern),
    ilike(quotes.clientCompany!, pattern),
    ilike(quotes.clientPhone!, pattern),
  )!;

  const contractSearch = or(
    ilike(contracts.clientName, pattern),
    ilike(contracts.clientEmail!, pattern),
    ilike(contracts.clientCompany!, pattern),
    ilike(contracts.clientPhone!, pattern),
  )!;

  const invoiceSearch = or(
    ilike(invoices.clientName, pattern),
    ilike(invoices.clientEmail!, pattern),
    ilike(invoices.clientCompany!, pattern),
    ilike(invoices.clientPhone!, pattern),
  )!;

  const [matchedLeads, matchedQuotes, matchedContracts, matchedInvoices] = await Promise.all([
    db.select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      email: leads.email,
      phone: leads.phone,
      address: leads.address,
      eventType: leads.eventType,
      expectedEventDate: leads.expectedEventDate,
      pipelineStage: leads.pipelineStage,
      updatedAt: leads.updatedAt,
    }).from(leads)
      .where(userLeadCond ? and(userLeadCond, leadSearch) : leadSearch)
      .orderBy(desc(leads.updatedAt))
      .limit(20),

    db.select({
      id: quotes.id,
      clientName: quotes.clientName,
      clientEmail: quotes.clientEmail,
      clientPhone: quotes.clientPhone,
      clientCompany: quotes.clientCompany,
      clientAddress: quotes.clientAddress,
      eventType: quotes.eventType,
      eventDate: quotes.eventDate,
      eventLocation: quotes.eventLocation,
      currency: quotes.currency,
      leadId: quotes.leadId,
      updatedAt: quotes.updatedAt,
    }).from(quotes)
      .where(userQuoteCond ? and(userQuoteCond, quoteSearch) : quoteSearch)
      .orderBy(desc(quotes.updatedAt))
      .limit(20),

    db.select({
      id: contracts.id,
      clientName: contracts.clientName,
      clientEmail: contracts.clientEmail,
      clientPhone: contracts.clientPhone,
      clientCompany: contracts.clientCompany,
      clientAddress: contracts.clientAddress,
      eventType: contracts.eventType,
      eventDate: contracts.eventDate,
      currency: contracts.currency,
      leadId: contracts.leadId,
      quoteId: contracts.quoteId,
      updatedAt: contracts.updatedAt,
    }).from(contracts)
      .where(userContractCond ? and(userContractCond, contractSearch) : contractSearch)
      .orderBy(desc(contracts.updatedAt))
      .limit(20),

    db.select({
      id: invoices.id,
      clientName: invoices.clientName,
      clientEmail: invoices.clientEmail,
      clientPhone: invoices.clientPhone,
      clientCompany: invoices.clientCompany,
      eventType: invoices.eventType,
      eventDate: invoices.eventDate,
      currency: invoices.currency,
      leadId: invoices.leadId,
      quoteId: invoices.quoteId,
      contractId: invoices.contractId,
      updatedAt: invoices.updatedAt,
    }).from(invoices)
      .where(userInvoiceCond ? and(userInvoiceCond, invoiceSearch) : invoiceSearch)
      .orderBy(desc(invoices.updatedAt))
      .limit(20),
  ]);

  const map = new Map<string, CustomerSuggestion>();

  const upsertKey = (key: string, incoming: CustomerSuggestion) => {
    const existing = map.get(key);
    if (!existing) {
      map.set(key, incoming);
      return;
    }
    const merged: CustomerSuggestion = {
      ...existing,
      leadId: existing.leadId ?? incoming.leadId,
      quoteId: existing.quoteId ?? incoming.quoteId,
      contractId: existing.contractId ?? incoming.contractId,
      invoiceId: existing.invoiceId ?? incoming.invoiceId,
      eventType: existing.eventType ?? incoming.eventType,
      eventDate: existing.eventDate ?? incoming.eventDate,
      eventLocation: existing.eventLocation ?? incoming.eventLocation,
      currency: existing.currency ?? incoming.currency,
      address: existing.address ?? incoming.address,
      phone: existing.phone ?? incoming.phone,
      pipelineStage: existing.pipelineStage ?? incoming.pipelineStage,
    };
    if (SOURCE_RANK[incoming.type] > SOURCE_RANK[existing.type]) {
      merged.id = incoming.id;
      merged.type = incoming.type;
      merged.name = incoming.name;
      merged.company = incoming.company ?? existing.company;
      merged.email = incoming.email ?? existing.email;
    }
    const incomingTs = incoming.lastActivityAt ? new Date(incoming.lastActivityAt).getTime() : 0;
    const existingTs = existing.lastActivityAt ? new Date(existing.lastActivityAt).getTime() : 0;
    if (incomingTs > existingTs) merged.lastActivityAt = incoming.lastActivityAt;
    map.set(key, merged);
  };

  for (const lead of matchedLeads) {
    const key = (lead.email ?? lead.contactName).toLowerCase();
    upsertKey(key, {
      id: lead.id,
      type: "lead",
      name: lead.contactName,
      company: lead.companyName,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      address: lead.address ?? null,
      eventType: lead.eventType ?? null,
      eventDate: lead.expectedEventDate?.toISOString() ?? null,
      eventLocation: null,
      currency: null,
      leadId: lead.id,
      clientId: null,
      quoteId: null,
      contractId: null,
      invoiceId: null,
      pipelineStage: lead.pipelineStage,
      lastActivityAt: lead.updatedAt?.toISOString() ?? null,
    });
  }

  for (const quote of matchedQuotes) {
    const key = (quote.clientEmail ?? quote.clientName).toLowerCase();
    upsertKey(key, {
      id: quote.id,
      type: "quote",
      name: quote.clientName,
      company: quote.clientCompany ?? null,
      email: quote.clientEmail ?? null,
      phone: quote.clientPhone ?? null,
      address: quote.clientAddress ?? null,
      eventType: quote.eventType ?? null,
      eventDate: quote.eventDate?.toISOString() ?? null,
      eventLocation: quote.eventLocation ?? null,
      currency: quote.currency ?? null,
      leadId: quote.leadId ?? null,
      clientId: null,
      quoteId: quote.id,
      contractId: null,
      invoiceId: null,
      pipelineStage: null,
      lastActivityAt: quote.updatedAt?.toISOString() ?? null,
    });
  }

  for (const contract of matchedContracts) {
    const key = (contract.clientEmail ?? contract.clientName).toLowerCase();
    upsertKey(key, {
      id: contract.id,
      type: "contract",
      name: contract.clientName,
      company: contract.clientCompany ?? null,
      email: contract.clientEmail ?? null,
      phone: contract.clientPhone ?? null,
      address: contract.clientAddress ?? null,
      eventType: contract.eventType ?? null,
      eventDate: contract.eventDate?.toISOString() ?? null,
      eventLocation: null,
      currency: contract.currency ?? null,
      leadId: contract.leadId ?? null,
      clientId: null,
      quoteId: contract.quoteId ?? null,
      contractId: contract.id,
      invoiceId: null,
      pipelineStage: null,
      lastActivityAt: contract.updatedAt?.toISOString() ?? null,
    });
  }

  for (const invoice of matchedInvoices) {
    const key = (invoice.clientEmail ?? invoice.clientName).toLowerCase();
    upsertKey(key, {
      id: invoice.id,
      type: "invoice",
      name: invoice.clientName,
      company: invoice.clientCompany ?? null,
      email: invoice.clientEmail ?? null,
      phone: invoice.clientPhone ?? null,
      address: null,
      eventType: invoice.eventType ?? null,
      eventDate: invoice.eventDate?.toISOString() ?? null,
      eventLocation: null,
      currency: invoice.currency ?? null,
      leadId: invoice.leadId ?? null,
      clientId: null,
      quoteId: invoice.quoteId ?? null,
      contractId: invoice.contractId ?? null,
      invoiceId: invoice.id,
      pipelineStage: null,
      lastActivityAt: invoice.updatedAt?.toISOString() ?? null,
    });
  }

  const items = Array.from(map.values()).slice(0, 10);
  res.json({ items });
});

export default router;
