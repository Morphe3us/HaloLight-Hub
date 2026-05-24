import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray } from "drizzle-orm";
import {
  db, translationRecords, courses, courseModules, lessons,
  kbArticles, resources, aiKnowledgeDocuments,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

const SUPPORTED_LANGUAGES = ["en", "fr", "de", "nl", "es", "it", "pt", "pl"] as const;
const CONTENT_TYPES = ["course", "module", "lesson", "kb_article", "resource", "ai_knowledge_doc"] as const;

function requireAdmin(user: { role: string } | null | undefined, res: Response): boolean {
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

type ContentEntry = {
  id: string;
  contentType: typeof CONTENT_TYPES[number];
  sourceTitle: string;
  sourceLanguage: string;
};

async function getAllContent(): Promise<ContentEntry[]> {
  const entries: ContentEntry[] = [];

  const allCourses = await db.select({ id: courses.id, title: courses.title }).from(courses);
  for (const c of allCourses) {
    entries.push({ id: c.id, contentType: "course", sourceTitle: (c.title as Record<string, string>).en ?? "Untitled Course", sourceLanguage: "en" });
  }

  const allModules = await db.select({ id: courseModules.id, title: courseModules.title }).from(courseModules);
  for (const m of allModules) {
    entries.push({ id: m.id, contentType: "module", sourceTitle: (m.title as Record<string, string>).en ?? "Untitled Module", sourceLanguage: "en" });
  }

  const allLessons = await db.select({ id: lessons.id, title: lessons.title }).from(lessons);
  for (const l of allLessons) {
    entries.push({ id: l.id, contentType: "lesson", sourceTitle: (l.title as Record<string, string>).en ?? "Untitled Lesson", sourceLanguage: "en" });
  }

  const allArticles = await db.select({ id: kbArticles.id, title: kbArticles.title }).from(kbArticles);
  for (const a of allArticles) {
    entries.push({ id: a.id, contentType: "kb_article", sourceTitle: a.title, sourceLanguage: "en" });
  }

  const allResources = await db.select({ id: resources.id, title: resources.title }).from(resources);
  for (const r of allResources) {
    entries.push({ id: r.id, contentType: "resource", sourceTitle: r.title, sourceLanguage: "en" });
  }

  const allDocs = await db.select({ id: aiKnowledgeDocuments.id, title: aiKnowledgeDocuments.title }).from(aiKnowledgeDocuments);
  for (const d of allDocs) {
    entries.push({ id: d.id, contentType: "ai_knowledge_doc", sourceTitle: d.title, sourceLanguage: "en" });
  }

  return entries;
}

// POST /admin/translations/ensure — create missing translation records
router.post("/admin/translations/ensure", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const content = await getAllContent();
  const existing = await db.select({
    contentType: translationRecords.contentType,
    contentId: translationRecords.contentId,
    language: translationRecords.language,
  }).from(translationRecords);

  const existingSet = new Set(existing.map(r => `${r.contentType}:${r.contentId}:${r.language}`));
  const toCreate: Array<typeof translationRecords.$inferInsert> = [];

  for (const entry of content) {
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === entry.sourceLanguage) continue;
      const key = `${entry.contentType}:${entry.id}:${lang}`;
      if (!existingSet.has(key)) {
        toCreate.push({
          contentType: entry.contentType as "course" | "module" | "lesson" | "kb_article" | "resource" | "ai_knowledge_doc",
          contentId: entry.id,
          language: lang,
          status: "draft",
        });
      }
    }
  }

  if (toCreate.length > 0) {
    await db.insert(translationRecords).values(toCreate);
  }

  res.json({ created: toCreate.length });
});

// GET /admin/translations
router.get("/admin/translations", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { contentType, language, status, q } = req.query as Record<string, string>;

  const content = await getAllContent();

  // Filter content entries
  let filtered = content;
  if (contentType) filtered = filtered.filter(c => c.contentType === contentType);
  if (q) filtered = filtered.filter(c => c.sourceTitle.toLowerCase().includes(q.toLowerCase()));

  if (filtered.length === 0) {
    res.json({ items: [], completenessScore: {}, total: 0 });
    return;
  }

  const contentIds = filtered.map(c => c.id);

  // Fetch relevant translation records
  const records = await db.select().from(translationRecords).where(
    inArray(translationRecords.contentId, contentIds)
  );

  // Filter by language/status
  let filteredRecords = records;
  if (language) filteredRecords = filteredRecords.filter(r => r.language === language);
  if (status) filteredRecords = filteredRecords.filter(r => r.status === status);

  // Build lookup: contentId → language → record
  const recordMap = new Map<string, Map<string, typeof records[0]>>();
  for (const r of records) {
    if (!recordMap.has(r.contentId)) recordMap.set(r.contentId, new Map());
    recordMap.get(r.contentId)!.set(r.language, r);
  }

  // Build items
  const items = filtered.map(entry => {
    const langMap = recordMap.get(entry.id) ?? new Map();
    const translations: Record<string, { id: string; status: string }> = {};
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === "en") continue;
      const rec = langMap.get(lang);
      translations[lang] = rec ? { id: rec.id, status: rec.status } : { id: "", status: "missing" };
    }

    // Filter by language/status if needed
    if (language && !langMap.has(language) && status !== "missing") {
      return null;
    }

    return {
      contentId: entry.id,
      contentType: entry.contentType,
      sourceTitle: entry.sourceTitle,
      sourceLanguage: entry.sourceLanguage,
      translations,
    };
  }).filter(Boolean);

  // Completeness scores per language
  const completenessScore: Record<string, number> = {};
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === "en") continue;
    const approved = records.filter(r => r.language === lang && (r.status === "approved" || r.status === "published")).length;
    const total = content.filter(c => c.sourceLanguage !== lang).length;
    completenessScore[lang] = total > 0 ? Math.round((approved / total) * 100) : 0;
  }

  res.json({ items, completenessScore, total: items.length });
});

// GET /admin/translations/:id
router.get("/admin/translations/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const id = String(req.params.id);
  const [record] = await db.select().from(translationRecords).where(eq(translationRecords.id, id));
  if (!record) { res.status(404).json({ error: "Not found" }); return; }

  res.json(record);
});

// PATCH /admin/translations/:id
router.patch("/admin/translations/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const id = String(req.params.id);
  const { status, translatedTitle, translatedBody } = req.body as {
    status?: string;
    translatedTitle?: string;
    translatedBody?: string;
  };

  const updates: Partial<typeof translationRecords.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (status) updates.status = status as "draft" | "needs_review" | "approved" | "published";
  if (translatedTitle !== undefined) updates.translatedTitle = translatedTitle;
  if (translatedBody !== undefined) updates.translatedBody = translatedBody;
  if (status === "approved" || status === "published") {
    updates.reviewedBy = user!.id;
    updates.reviewedAt = new Date();
  }

  const [updated] = await db.update(translationRecords)
    .set(updates)
    .where(eq(translationRecords.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
