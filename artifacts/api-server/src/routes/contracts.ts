import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, contracts, contractTemplates } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function generateContractNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `CON-${year}-${rand}`;
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

  const { leadId, quoteId, templateId, title, clientName, clientEmail, content, value, startDate, endDate, notes } = req.body as {
    leadId?: string; quoteId?: string; templateId?: string; title: string; clientName: string;
    clientEmail?: string; content?: string; value?: string; startDate?: string; endDate?: string; notes?: string;
  };
  if (!title || !clientName) { res.status(400).json({ error: "title and clientName required" }); return; }

  let finalContent = content ?? "";
  if (templateId && !content) {
    const [tpl] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, templateId));
    if (tpl) finalContent = tpl.content;
  }

  const [contract] = await db.insert(contracts).values({
    userId: user.id,
    leadId: leadId ?? null,
    quoteId: quoteId ?? null,
    contractNumber: generateContractNumber(),
    title,
    clientName,
    clientEmail: clientEmail ?? null,
    content: finalContent,
    value: value ?? "0",
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    notes: notes ?? null,
  }).returning();

  res.status(201).json(contract);
});

// GET /contracts/:id
router.get("/contracts/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);

  const [contract] = await db.select().from(contracts).where(and(eq(contracts.id, id), eq(contracts.userId, user.id)));
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

  const { leadId, quoteId, title, clientName, clientEmail, content, value, startDate, endDate, notes } = req.body as {
    leadId?: string | null; quoteId?: string | null; title?: string; clientName?: string;
    clientEmail?: string | null; content?: string; value?: string; startDate?: string; endDate?: string; notes?: string | null;
  };

  const [updated] = await db.update(contracts).set({
    leadId: leadId !== undefined ? (leadId ?? null) : existing.leadId,
    quoteId: quoteId !== undefined ? (quoteId ?? null) : existing.quoteId,
    title: title ?? existing.title,
    clientName: clientName ?? existing.clientName,
    clientEmail: clientEmail !== undefined ? clientEmail : existing.clientEmail,
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
  res.json(updated);
});

// GET /contract-templates
router.get("/contract-templates", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const items = await db.select().from(contractTemplates).orderBy(contractTemplates.createdAt);
  res.json({ items });
});

export default router;
