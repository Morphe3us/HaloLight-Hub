import { Router, type IRouter, type Request, type Response } from "express";
import { eq, ilike, and } from "drizzle-orm";
import { db, resources } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { protectImportedFileUpdate } from "./uploads";

const router: IRouter = Router();

function requireAdmin(user: { role: string } | null | undefined, res: Response): boolean {
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

function fmt(r: typeof resources.$inferSelect) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    language: r.language,
    fileUrl: r.fileUrl,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// GET /admin/resources
router.get("/admin/resources", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { category, language, status, q } = req.query as Record<string, string>;

  const conditions = [];
  if (category) conditions.push(eq(resources.category, category as "pdf" | "marketing" | "template" | "contract" | "checklist" | "guide"));
  if (language) conditions.push(eq(resources.language, language));
  if (status) conditions.push(eq(resources.status, status as "draft" | "published"));
  if (q) conditions.push(ilike(resources.title, `%${q}%`));

  const items = conditions.length > 0
    ? await db.select().from(resources).where(and(...conditions)).orderBy(resources.createdAt)
    : await db.select().from(resources).orderBy(resources.createdAt);

  res.json({ items: items.map(fmt), total: items.length });
});

// POST /admin/resources
router.post("/admin/resources", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { title, category, language, fileUrl, description, status } = req.body as {
    title?: string; category?: string; language?: string; fileUrl?: string; description?: string; status?: string;
  };

  if (!title || !category || !language || !fileUrl) {
    res.status(400).json({ error: "title, category, language, and fileUrl are required" });
    return;
  }

  const [item] = await db.insert(resources).values({
    title,
    category: category as "pdf" | "marketing" | "template" | "contract" | "checklist" | "guide",
    language,
    fileUrl,
    description: description ?? null,
    status: (status as "draft" | "published") ?? "draft",
    authorId: user!.id,
  }).returning();

  res.status(201).json(fmt(item!));
});

// PUT /admin/resources/:id
router.put("/admin/resources/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const id = String(req.params.id);
  const [current] = await db.select().from(resources).where(eq(resources.id, id));
  if (!current) { res.status(404).json({ error: "Resource not found" }); return; }
  const protectedUpdate = protectImportedFileUpdate(current, req.body);
  if (!protectedUpdate.ok) {
    res.status(400).json({ error: "Imported file provenance cannot be changed" });
    return;
  }
  const { title, category, language, fileUrl, description, status } = req.body as {
    title?: string; category?: string; language?: string; fileUrl?: string; description?: string; status?: string;
  };

  const updates: Partial<typeof resources.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (category !== undefined) updates.category = category as "pdf" | "marketing" | "template" | "contract" | "checklist" | "guide";
  if (language !== undefined) updates.language = language;
  if (fileUrl !== undefined) updates.fileUrl = fileUrl;
  if (description !== undefined) updates.description = description;
  if (protectedUpdate.description !== undefined) updates.description = protectedUpdate.description;
  if (status !== undefined) updates.status = status as "draft" | "published";

  const [updated] = await db.update(resources).set(updates).where(eq(resources.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Resource not found" }); return; }

  res.json(fmt(updated));
});

// DELETE /admin/resources/:id
router.delete("/admin/resources/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const id = String(req.params.id);
  await db.delete(resources).where(eq(resources.id, id));
  res.status(204).send();
});

export default router;
