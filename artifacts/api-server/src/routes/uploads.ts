import { Router, type IRouter, type Request, type Response } from "express";
import { eq, ilike, and } from "drizzle-orm";
import { db, uploads } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function requireAdmin(user: { role: string } | null | undefined, res: Response): boolean {
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

type UploadCategory = "academy" | "knowledge_base" | "resources" | "marketing" | "contracts" | "product_manuals" | "ai_knowledge_base" | "support_documentation";
type UploadVisibility = "admin_only" | "client_visible" | "ai_only" | "public_resource";
type UploadStatus = "pending" | "processing" | "ready" | "failed";

function fmt(u: typeof uploads.$inferSelect) {
  return {
    id: u.id,
    title: u.title,
    language: u.language,
    category: u.category,
    fileUrl: u.fileUrl,
    fileName: u.fileName,
    mimeType: u.mimeType,
    fileSize: u.fileSize,
    visibility: u.visibility,
    status: u.status,
    relatedCourseId: u.relatedCourseId,
    relatedLessonId: u.relatedLessonId,
    relatedProduct: u.relatedProduct,
    description: u.description,
    uploadedBy: u.uploadedBy,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// GET /admin/uploads
router.get("/admin/uploads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { category, visibility, language, q } = req.query as Record<string, string>;

  const conditions = [];
  if (category) conditions.push(eq(uploads.category, category as UploadCategory));
  if (visibility) conditions.push(eq(uploads.visibility, visibility as UploadVisibility));
  if (language) conditions.push(eq(uploads.language, language));
  if (q) conditions.push(ilike(uploads.title, `%${q}%`));

  const items = conditions.length > 0
    ? await db.select().from(uploads).where(and(...conditions)).orderBy(uploads.createdAt)
    : await db.select().from(uploads).orderBy(uploads.createdAt);

  res.json({ items: items.map(fmt), total: items.length });
});

// POST /admin/uploads
router.post("/admin/uploads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const {
    title, language, category, fileUrl, fileName, mimeType, fileSize,
    visibility, relatedCourseId, relatedLessonId, relatedProduct, description,
  } = req.body as {
    title?: string; language?: string; category?: string; fileUrl?: string;
    fileName?: string; mimeType?: string; fileSize?: number; visibility?: string;
    relatedCourseId?: string; relatedLessonId?: string; relatedProduct?: string; description?: string;
  };

  if (!title || !category || !fileUrl) {
    res.status(400).json({ error: "title, category, and fileUrl are required" });
    return;
  }

  const [item] = await db.insert(uploads).values({
    title,
    language: language ?? "en",
    category: category as UploadCategory,
    fileUrl,
    fileName: fileName ?? null,
    mimeType: mimeType ?? null,
    fileSize: fileSize ?? null,
    visibility: (visibility as UploadVisibility) ?? "admin_only",
    status: "ready",
    relatedCourseId: relatedCourseId ?? null,
    relatedLessonId: relatedLessonId ?? null,
    relatedProduct: relatedProduct ?? null,
    description: description ?? null,
    uploadedBy: user!.id,
  }).returning();

  res.status(201).json(fmt(item!));
});

// PUT /admin/uploads/:id
router.put("/admin/uploads/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const id = String(req.params.id);
  const {
    title, language, category, fileUrl, fileName, mimeType, fileSize,
    visibility, relatedCourseId, relatedLessonId, relatedProduct, description, status,
  } = req.body as Record<string, string | number | undefined>;

  const u: Partial<typeof uploads.$inferInsert> = { updatedAt: new Date() };
  if (title) u.title = title as string;
  if (language) u.language = language as string;
  if (category) u.category = category as UploadCategory;
  if (fileUrl) u.fileUrl = fileUrl as string;
  if (fileName !== undefined) u.fileName = fileName as string;
  if (mimeType !== undefined) u.mimeType = mimeType as string;
  if (fileSize !== undefined) u.fileSize = Number(fileSize);
  if (visibility) u.visibility = visibility as UploadVisibility;
  if (status) u.status = status as UploadStatus;
  if (relatedCourseId !== undefined) u.relatedCourseId = relatedCourseId as string;
  if (relatedLessonId !== undefined) u.relatedLessonId = relatedLessonId as string;
  if (relatedProduct !== undefined) u.relatedProduct = relatedProduct as string;
  if (description !== undefined) u.description = description as string;

  const [updated] = await db.update(uploads).set(u).where(eq(uploads.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Upload not found" }); return; }

  res.json(fmt(updated));
});

// DELETE /admin/uploads/:id
router.delete("/admin/uploads/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const id = String(req.params.id);
  await db.delete(uploads).where(eq(uploads.id, id));
  res.status(204).send();
});

export default router;
