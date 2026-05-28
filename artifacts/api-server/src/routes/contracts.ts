import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, contracts, contractTemplates, leads, quotes } from "@workspace/db";
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
    leadId, quoteId, templateId, title, clientName, clientEmail, clientPhone, clientCompany, clientAddress,
    content, value, startDate, endDate, notes, eventType, eventDate, currency, language,
  } = req.body as {
    leadId?: string; quoteId?: string; templateId?: string; title: string; clientName: string;
    clientEmail?: string; clientPhone?: string; clientCompany?: string; clientAddress?: string;
    content?: string; value?: string; startDate?: string; endDate?: string; notes?: string;
    eventType?: string; eventDate?: string; currency?: string; language?: string;
  };
  if (!title || !clientName) { res.status(400).json({ error: "title and clientName required" }); return; }

  // Auto-fill from quote if provided
  let resolvedClientName = clientName;
  let resolvedClientEmail = clientEmail;
  let resolvedClientPhone = clientPhone;
  let resolvedClientCompany = clientCompany;
  let resolvedClientAddress = clientAddress;
  let resolvedEventType = eventType;
  let resolvedEventDate = eventDate;
  let resolvedValue = value;
  let resolvedLeadId = leadId;
  let resolvedCurrency = currency;
  let resolvedLanguage = language;

  if (quoteId) {
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, user.id)));
    if (quote) {
      resolvedClientName = clientName || quote.clientName;
      resolvedClientEmail = clientEmail ?? quote.clientEmail ?? undefined;
      resolvedClientPhone = clientPhone ?? quote.clientPhone ?? undefined;
      resolvedClientCompany = clientCompany ?? quote.clientCompany ?? undefined;
      resolvedClientAddress = clientAddress ?? quote.clientAddress ?? undefined;
      resolvedEventType = eventType ?? quote.eventType ?? undefined;
      resolvedEventDate = eventDate ?? (quote.eventDate ? quote.eventDate.toISOString() : undefined);
      resolvedValue = value ?? quote.total;
      resolvedLeadId = leadId ?? quote.leadId ?? undefined;
      resolvedCurrency = currency ?? quote.currency ?? undefined;
      resolvedLanguage = language ?? quote.language ?? undefined;
    }
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

  const {
    equipmentIds,
  } = req.body as { equipmentIds?: string[] };

  let finalContent = content ?? "";
  if (templateId && !content) {
    const [tpl] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, templateId));
    if (tpl) finalContent = tpl.content;
  }

  // Generate contract number first so we can embed it in the content
  const contractNumber = generateContractNumber();
  // Replace {{contract_number}} placeholder with the real number
  const processedContent = finalContent.replace(/\{\{contract_number\}\}/g, contractNumber);

  const [contract] = await db.insert(contracts).values({
    userId: user.id,
    leadId: resolvedLeadId ?? null,
    quoteId: quoteId ?? null,
    contractNumber,
    title,
    clientName: resolvedClientName,
    clientEmail: resolvedClientEmail ?? null,
    clientPhone: resolvedClientPhone ?? null,
    clientCompany: resolvedClientCompany ?? null,
    clientAddress: resolvedClientAddress ?? null,
    eventType: resolvedEventType ?? null,
    eventDate: resolvedEventDate ? new Date(resolvedEventDate) : null,
    currency: resolvedCurrency ?? null,
    language: resolvedLanguage ?? null,
    content: processedContent,
    value: resolvedValue ?? "0",
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    notes: notes ?? null,
    equipmentIds: equipmentIds ?? null,
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
