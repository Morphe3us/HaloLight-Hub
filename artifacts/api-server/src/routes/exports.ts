import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { ZipArchive } from "archiver";
import {
  db,
  usersTable,
  leads,
  quotes,
  contracts,
  invoices,
  events,
  supportTickets,
  equipment,
  consumableCatalog,
  consumableStock,
  exportLogs,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// ─── CSV utilities ────────────────────────────────────────────────────────────

const UTF8_BOM = "\uFEFF";

function escapeCSV(val: unknown, sep: string): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (
    str.includes(sep) ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCSV(rows: Record<string, unknown>[], sep = ","): string {
  if (rows.length === 0) return UTF8_BOM + "\r\n";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map((h) => escapeCSV(h, sep)).join(sep),
    ...rows.map((row) =>
      headers.map((h) => escapeCSV(row[h], sep)).join(sep)
    ),
  ];
  return UTF8_BOM + lines.join("\r\n");
}

function isoDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString();
}

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function requireAdmin(
  req: Request,
  res: Response
): Promise<{ id: string; email: string } | null> {
  const user = await getOrCreateUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return user as { id: string; email: string };
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchLeads(userId?: string) {
  const rows = await db
    .select({
      id: leads.id,
      companyName: leads.companyName,
      contactName: leads.contactName,
      email: leads.email,
      phone: leads.phone,
      status: leads.status,
      pipelineStage: leads.pipelineStage,
      value: leads.value,
      eventType: leads.eventType,
      expectedEventDate: leads.expectedEventDate,
      notes: leads.notes,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(userId ? eq(leads.userId, userId) : undefined)
    .orderBy(desc(leads.createdAt));
  return rows.map((r) => ({
    id: r.id,
    company_name: r.companyName,
    contact_name: r.contactName,
    email: r.email ?? "",
    phone: r.phone ?? "",
    status: r.status,
    pipeline_stage: r.pipelineStage ?? "lead",
    value: r.value,
    event_type: r.eventType ?? "",
    expected_event_date: isoDate(r.expectedEventDate),
    notes: r.notes ?? "",
    created_at: isoDate(r.createdAt),
  }));
}

async function fetchQuotes(userId?: string) {
  const rows = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      title: quotes.title,
      clientName: quotes.clientName,
      clientEmail: quotes.clientEmail,
      clientPhone: quotes.clientPhone,
      clientCompany: quotes.clientCompany,
      eventType: quotes.eventType,
      eventDate: quotes.eventDate,
      status: quotes.status,
      subtotal: quotes.subtotal,
      taxRate: quotes.taxRate,
      taxAmount: quotes.taxAmount,
      total: quotes.total,
      currency: quotes.currency,
      validUntil: quotes.validUntil,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .where(userId ? eq(quotes.userId, userId) : undefined)
    .orderBy(desc(quotes.createdAt));
  return rows.map((r) => ({
    id: r.id,
    quote_number: r.quoteNumber,
    title: r.title,
    client_name: r.clientName,
    client_email: r.clientEmail ?? "",
    client_phone: r.clientPhone ?? "",
    client_company: r.clientCompany ?? "",
    event_type: r.eventType ?? "",
    event_date: isoDate(r.eventDate),
    status: r.status,
    subtotal: r.subtotal,
    tax_rate: r.taxRate,
    tax_amount: r.taxAmount,
    total: r.total,
    currency: r.currency ?? "USD",
    valid_until: isoDate(r.validUntil),
    created_at: isoDate(r.createdAt),
  }));
}

async function fetchContracts(userId?: string) {
  const rows = await db
    .select({
      id: contracts.id,
      contractNumber: contracts.contractNumber,
      title: contracts.title,
      clientName: contracts.clientName,
      clientEmail: contracts.clientEmail,
      clientPhone: contracts.clientPhone,
      clientCompany: contracts.clientCompany,
      eventType: contracts.eventType,
      eventDate: contracts.eventDate,
      status: contracts.status,
      value: contracts.value,
      currency: contracts.currency,
      sentAt: contracts.sentAt,
      signedAt: contracts.signedAt,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      createdAt: contracts.createdAt,
    })
    .from(contracts)
    .where(userId ? eq(contracts.userId, userId) : undefined)
    .orderBy(desc(contracts.createdAt));
  return rows.map((r) => ({
    id: r.id,
    contract_number: r.contractNumber,
    title: r.title,
    client_name: r.clientName,
    client_email: r.clientEmail ?? "",
    client_phone: r.clientPhone ?? "",
    client_company: r.clientCompany ?? "",
    event_type: r.eventType ?? "",
    event_date: isoDate(r.eventDate),
    status: r.status,
    value: r.value,
    currency: r.currency ?? "USD",
    sent_at: isoDate(r.sentAt),
    signed_at: isoDate(r.signedAt),
    start_date: isoDate(r.startDate),
    end_date: isoDate(r.endDate),
    created_at: isoDate(r.createdAt),
  }));
}

async function fetchInvoices(userId?: string) {
  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      title: invoices.title,
      clientName: invoices.clientName,
      clientEmail: invoices.clientEmail,
      clientPhone: invoices.clientPhone,
      clientCompany: invoices.clientCompany,
      eventType: invoices.eventType,
      eventDate: invoices.eventDate,
      status: invoices.status,
      subtotal: invoices.subtotal,
      taxRate: invoices.taxRate,
      taxAmount: invoices.taxAmount,
      total: invoices.total,
      currency: invoices.currency,
      dueDate: invoices.dueDate,
      sentAt: invoices.sentAt,
      paidAt: invoices.paidAt,
      paymentMethod: invoices.paymentMethod,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(userId ? eq(invoices.userId, userId) : undefined)
    .orderBy(desc(invoices.createdAt));
  return rows.map((r) => ({
    id: r.id,
    invoice_number: r.invoiceNumber,
    title: r.title,
    client_name: r.clientName,
    client_email: r.clientEmail ?? "",
    client_phone: r.clientPhone ?? "",
    client_company: r.clientCompany ?? "",
    event_type: r.eventType ?? "",
    event_date: isoDate(r.eventDate),
    status: r.status,
    subtotal: r.subtotal,
    tax_rate: r.taxRate,
    tax_amount: r.taxAmount,
    total: r.total,
    currency: r.currency ?? "USD",
    due_date: isoDate(r.dueDate),
    sent_at: isoDate(r.sentAt),
    paid_at: isoDate(r.paidAt),
    payment_method: r.paymentMethod ?? "",
    created_at: isoDate(r.createdAt),
  }));
}

async function fetchEvents(userId?: string) {
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      location: events.location,
      type: events.type,
      status: events.status,
      eventDate: events.eventDate,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(userId ? eq(events.userId, userId) : undefined)
    .orderBy(desc(events.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    location: r.location ?? "",
    type: r.type ?? "",
    status: r.status,
    event_date: isoDate(r.eventDate),
    created_at: isoDate(r.createdAt),
  }));
}

async function fetchSupportTickets(userId?: string) {
  const rows = await db
    .select({
      id: supportTickets.id,
      title: supportTickets.title,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .where(userId ? eq(supportTickets.userId, userId) : undefined)
    .orderBy(desc(supportTickets.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority ?? "",
    category: r.category ?? "",
    created_at: isoDate(r.createdAt),
  }));
}

async function fetchEquipment() {
  const rows = await db
    .select({
      id: equipment.id,
      productModel: equipment.productModel,
      serialNumber: equipment.serialNumber,
      status: equipment.status,
      purchaseDate: equipment.purchaseDate,
      warrantyExpiration: equipment.warrantyExpiration,
      purchasePrice: equipment.purchasePrice,
      vendorName: equipment.vendorName,
      createdAt: equipment.createdAt,
    })
    .from(equipment)
    .orderBy(desc(equipment.createdAt));
  return rows.map((r) => ({
    id: r.id,
    product_model: r.productModel,
    serial_number: r.serialNumber,
    status: r.status,
    purchase_date: isoDate(r.purchaseDate),
    warranty_expiration: isoDate(r.warrantyExpiration),
    purchase_price: r.purchasePrice ?? "",
    vendor_name: r.vendorName ?? "",
    created_at: isoDate(r.createdAt),
  }));
}

async function fetchConsumables() {
  const rows = await db
    .select({
      stockId: consumableStock.id,
      name: consumableCatalog.name,
      sku: consumableCatalog.sku,
      unitType: consumableCatalog.unitType,
      reorderThreshold: consumableCatalog.reorderThreshold,
      currentQuantity: consumableStock.currentQuantity,
      createdAt: consumableStock.createdAt,
    })
    .from(consumableStock)
    .innerJoin(
      consumableCatalog,
      eq(consumableStock.catalogItemId, consumableCatalog.id)
    )
    .orderBy(consumableCatalog.name);
  return rows.map((r) => ({
    id: r.stockId,
    name: r.name,
    sku: r.sku,
    unit_type: r.unitType,
    current_quantity: r.currentQuantity,
    reorder_threshold: r.reorderThreshold,
    created_at: isoDate(r.createdAt),
  }));
}

async function fetchClients() {
  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      email: usersTable.email,
      companyName: usersTable.companyName,
      phone: usersTable.phone,
      role: usersTable.role,
      language: usersTable.language,
      currency: usersTable.currency,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));
  return rows.map((r) => ({
    id: r.id,
    full_name: r.fullName,
    email: r.email,
    company_name: r.companyName ?? "",
    phone: r.phone ?? "",
    role: r.role,
    language: r.language ?? "en",
    currency: r.currency ?? "USD",
    created_at: isoDate(r.createdAt),
  }));
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function logExport(
  userId: string,
  userEmail: string | null | undefined,
  exportType: string,
  format: string,
  scope: string,
  fileCount: number,
  recordCounts: Record<string, number>
) {
  await db.insert(exportLogs).values({
    userId,
    userEmail: userEmail ?? undefined,
    exportType,
    format,
    scope,
    fileCount,
    recordCounts,
  });
}

// ─── GET /exports/workspace-zip (admin only) ──────────────────────────────────

router.get(
  "/exports/workspace-zip",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const sep = req.query["sep"] === "semicolon" ? ";" : ",";
    const date = dateSuffix();

    try {
      const [
        leadsData,
        quotesData,
        contractsData,
        invoicesData,
        eventsData,
        ticketsData,
        equipmentData,
        consumablesData,
        clientsData,
      ] = await Promise.all([
        fetchLeads(),
        fetchQuotes(),
        fetchContracts(),
        fetchInvoices(),
        fetchEvents(),
        fetchSupportTickets(),
        fetchEquipment(),
        fetchConsumables(),
        fetchClients(),
      ]);

      const recordCounts = {
        leads: leadsData.length,
        quotes: quotesData.length,
        contracts: contractsData.length,
        invoices: invoicesData.length,
        events: eventsData.length,
        support_tickets: ticketsData.length,
        equipment: equipmentData.length,
        consumables: consumablesData.length,
        clients: clientsData.length,
      };

      const metadata = {
        exportDate: new Date().toISOString(),
        exportedBy: { userId: admin.id, email: admin.email },
        scope: "workspace",
        recordCounts,
        csvSeparator: sep,
        encoding: "UTF-8 with BOM",
      };

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="halolight-workspace-export-${date}.zip"`
      );

      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.on("error", (err: Error) => {
        req.log.error({ err }, "Archiver error");
        if (!res.headersSent) res.status(500).end();
      });
      archive.pipe(res);

      const files: Array<{ data: Record<string, unknown>[]; name: string }> = [
        { data: leadsData as any, name: `halolight-leads-${date}.csv` },
        { data: quotesData as any, name: `halolight-quotes-${date}.csv` },
        {
          data: contractsData as any,
          name: `halolight-contracts-${date}.csv`,
        },
        { data: invoicesData as any, name: `halolight-invoices-${date}.csv` },
        { data: eventsData as any, name: `halolight-events-${date}.csv` },
        {
          data: ticketsData as any,
          name: `halolight-support-tickets-${date}.csv`,
        },
        {
          data: equipmentData as any,
          name: `halolight-equipment-${date}.csv`,
        },
        {
          data: consumablesData as any,
          name: `halolight-consumables-${date}.csv`,
        },
        { data: clientsData as any, name: `halolight-clients-${date}.csv` },
      ];

      for (const f of files) {
        archive.append(Buffer.from(toCSV(f.data, sep), "utf8"), {
          name: f.name,
        });
      }
      archive.append(Buffer.from(JSON.stringify(metadata, null, 2), "utf8"), {
        name: "metadata.json",
      });

      await archive.finalize();

      await logExport(
        admin.id,
        admin.email,
        "workspace",
        "zip",
        "workspace",
        10,
        recordCounts
      );
    } catch (err) {
      req.log.error({ err }, "Export workspace ZIP failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "Export failed" });
      }
    }
  }
);

// ─── GET /exports/csv/:entity (admin only) ────────────────────────────────────

const ENTITY_FETCHERS: Record<
  string,
  () => Promise<Record<string, unknown>[]>
> = {
  leads: () => fetchLeads(),
  quotes: () => fetchQuotes(),
  contracts: () => fetchContracts(),
  invoices: () => fetchInvoices(),
  events: () => fetchEvents(),
  "support-tickets": () => fetchSupportTickets(),
  equipment: fetchEquipment,
  consumables: fetchConsumables,
  clients: fetchClients,
};

router.get(
  "/exports/csv/:entity",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { entity } = req.params as { entity: string };
    const fetcher = ENTITY_FETCHERS[entity];
    if (!fetcher) {
      res.status(400).json({ error: "Unknown entity. Valid: leads, quotes, contracts, invoices, events, support-tickets, equipment, consumables, clients" });
      return;
    }

    const sep = req.query["sep"] === "semicolon" ? ";" : ",";
    const date = dateSuffix();

    try {
      const data = await fetcher();
      const csv = toCSV(data as any, sep);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="halolight-${entity}-${date}.csv"`
      );
      res.send(Buffer.from(csv, "utf8"));

      await logExport(
        admin.id,
        admin.email,
        entity,
        "csv",
        "workspace",
        1,
        { [entity]: data.length }
      );
    } catch (err) {
      req.log.error({ err }, "Export CSV failed");
      if (!res.headersSent) res.status(500).json({ error: "Export failed" });
    }
  }
);

// ─── GET /exports/personal (any authenticated user) ───────────────────────────

router.get(
  "/exports/personal",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const date = dateSuffix();

    try {
      const [profileRows, leadsData, quotesData, contractsData, invoicesData, eventsData, ticketsData] =
        await Promise.all([
          db
            .select({
              id: usersTable.id,
              fullName: usersTable.fullName,
              email: usersTable.email,
              companyName: usersTable.companyName,
              phone: usersTable.phone,
              role: usersTable.role,
              language: usersTable.language,
              currency: usersTable.currency,
              country: usersTable.country,
              city: usersTable.city,
              website: usersTable.website,
              instagram: usersTable.instagram,
              facebook: usersTable.facebook,
              createdAt: usersTable.createdAt,
            })
            .from(usersTable)
            .where(eq(usersTable.id, user.id))
            .limit(1),
          fetchLeads(user.id),
          fetchQuotes(user.id),
          fetchContracts(user.id),
          fetchInvoices(user.id),
          fetchEvents(user.id),
          fetchSupportTickets(user.id),
        ]);

      const exportPayload = {
        exportDate: new Date().toISOString(),
        scope: "personal",
        gdprNote:
          "This file contains all personal data linked to your account, provided under GDPR Article 20 (Right to Data Portability).",
        profile: profileRows[0] ?? null,
        leads: leadsData,
        quotes: quotesData,
        contracts: contractsData,
        invoices: invoicesData,
        events: eventsData,
        supportTickets: ticketsData,
      };

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="halolight-personal-data-${date}.json"`
      );
      res.send(Buffer.from(JSON.stringify(exportPayload, null, 2), "utf8"));

      await logExport(user.id, user.email, "personal", "json", "personal", 1, {
        leads: leadsData.length,
        quotes: quotesData.length,
        contracts: contractsData.length,
        invoices: invoicesData.length,
        events: eventsData.length,
        support_tickets: ticketsData.length,
      });
    } catch (err) {
      req.log.error({ err }, "Export personal data failed");
      if (!res.headersSent) res.status(500).json({ error: "Export failed" });
    }
  }
);

// ─── GET /exports/history (admin only) ───────────────────────────────────────

router.get(
  "/exports/history",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    try {
      const limit = Math.min(Number(req.query["limit"] ?? "100"), 500);
      const rows = await db
        .select()
        .from(exportLogs)
        .orderBy(desc(exportLogs.createdAt))
        .limit(limit);
      res.json({ items: rows, total: rows.length });
    } catch (err) {
      req.log.error({ err }, "List export history failed");
      res.status(500).json({ error: "Failed to list export history" });
    }
  }
);

export default router;
