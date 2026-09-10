import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { eq, and, desc, asc, sql, or, getTableColumns } from "drizzle-orm";
import { db, kbCategories, kbArticles } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { parseKbQuery, isKbUuid, foldKbSql, kbSearchPattern } from "../lib/kbQuery";

const router: IRouter = Router();

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// GET /kb/categories
router.get("/kb/categories", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  let query;
  try { query = parseKbQuery(req.query); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const { language } = query;
  const items = await db.select({
    id: kbCategories.id,
    name: kbCategories.name,
    slug: kbCategories.slug,
    description: kbCategories.description,
    icon: kbCategories.icon,
    order: kbCategories.order,
    createdAt: kbCategories.createdAt,
    language: kbCategories.language,
    articleCount: sql<number>`(select count(*) from kb_articles where category_id = ${sql.identifier("kb_categories")}.${sql.identifier("id")} and status = 'published' ${language ? sql`and language = ${language}` : sql``})::int`,
  }).from(kbCategories).where(language ? eq(kbCategories.language, language) : undefined)
    .orderBy(asc(kbCategories.order), asc(kbCategories.id)).limit(200);

  res.json({ items });
});

// POST /kb/categories
router.post("/kb/categories", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, slug, description, icon, order, language } = req.body as {
    name: string; slug?: string; description?: string; icon?: string; order?: number; language?: string;
  };
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  try { parseKbQuery({ language }); }
  catch { res.status(400).json({ error: "Invalid language" }); return; }

  const [cat] = await db.insert(kbCategories).values({
    name,
    language: language ?? "en",
    slug: slug ?? slugify(name),
    description: description ?? null,
    icon: icon ?? "BookOpen",
    order: order ?? 0,
  }).returning();

  res.status(201).json(cat);
});

// GET /kb/articles
router.get("/kb/articles", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  let query;
  try { query = parseKbQuery(req.query); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const { categoryId, status, search, language, limit, offset } = query;

  const isAdmin = user.role === "admin";
  const conditions = [];

  if (!isAdmin) conditions.push(eq(kbArticles.status, "published"));
  else if (status) conditions.push(eq(kbArticles.status, status as typeof kbArticles.status._.data));

  if (categoryId) conditions.push(eq(kbArticles.categoryId, categoryId));
  if (language) conditions.push(eq(kbArticles.language, language));
  if (search) {
    const pattern = kbSearchPattern(search);
    conditions.push(
      or(
        sql`${foldKbSql(sql`${kbArticles.title}`)} like ${pattern}`,
        sql`${foldKbSql(sql`${kbArticles.content}`)} like ${pattern}`,
        sql`${foldKbSql(sql`${kbArticles.excerpt}`)} like ${pattern}`,
        sql`${foldKbSql(sql`array_to_string(${kbArticles.tags}, ' ')`)} like ${pattern}`
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const { content: _content, ...summaryColumns } = getTableColumns(kbArticles);

  const [rows, countRow] = await Promise.all([
    db.select(isAdmin ? getTableColumns(kbArticles) : summaryColumns).from(kbArticles).where(whereClause)
      .orderBy(asc(kbArticles.order), desc(kbArticles.publishedAt), asc(kbArticles.id)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(kbArticles).where(whereClause),
  ]);

  res.json({ items: rows, total: countRow[0]?.count ?? 0 });
});

// POST /kb/articles
router.post("/kb/articles", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { categoryId, title, content, excerpt, status, tags, language, aiEligible } = req.body as {
    categoryId: string; title: string; content: string; excerpt?: string;
    status?: typeof kbArticles.status._.data; tags?: string[]; language?: string; aiEligible?: boolean;
  };
  if (!categoryId || !title || !content) { res.status(400).json({ error: "categoryId, title, content required" }); return; }
  if (!isKbUuid(categoryId)) { res.status(400).json({ error: "Invalid categoryId" }); return; }
  try { parseKbQuery({ language, status }); }
  catch { res.status(400).json({ error: "Invalid language or status" }); return; }
  if (aiEligible !== undefined && typeof aiEligible !== "boolean") { res.status(400).json({ error: "Invalid aiEligible" }); return; }

  const baseSlug = slugify(title);
  const existing = await db.select({ id: kbArticles.id }).from(kbArticles).where(eq(kbArticles.slug, baseSlug)).limit(1);
  const slug = existing.length > 0 ? `${baseSlug}-${Date.now()}` : baseSlug;

  const [article] = await db.insert(kbArticles).values({
    categoryId,
    authorId: user.id,
    title,
    language: language ?? "en",
    aiEligible: aiEligible === true,
    slug,
    content,
    excerpt: excerpt ?? null,
    status: status ?? "draft",
    tags: tags ?? null,
    publishedAt: status === "published" ? new Date() : null,
  }).returning();

  res.status(201).json(article);
});

// GET /kb/articles/:id
router.get("/kb/articles/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);
  if (!isKbUuid(id)) { res.status(400).json({ error: "Invalid article id" }); return; }

  const isAdmin = user.role === "admin";
  const conditions = [eq(kbArticles.id, id)];
  if (!isAdmin) conditions.push(eq(kbArticles.status, "published"));

  const [article] = await db.select().from(kbArticles).where(and(...conditions));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }

  const [viewCount] = await db.update(kbArticles).set({ views: sql`${kbArticles.views} + 1` }).where(eq(kbArticles.id, id)).returning({ views: kbArticles.views });

  const related = await db.select({ id: kbArticles.id, title: kbArticles.title, slug: kbArticles.slug, excerpt: kbArticles.excerpt })
    .from(kbArticles)
    .where(and(eq(kbArticles.categoryId, article.categoryId), eq(kbArticles.status, "published"), sql`${kbArticles.id} != ${id}`))
    .limit(4);

  res.json({ ...article, views: viewCount?.views ?? article.views, related });
});

// PUT /kb/articles/:id
router.put("/kb/articles/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params.id);
  if (!isKbUuid(id)) { res.status(400).json({ error: "Invalid article id" }); return; }

  const [existing] = await db.select().from(kbArticles).where(eq(kbArticles.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { categoryId, title, content, excerpt, status, tags, language, aiEligible, expectedUpdatedAt } = req.body as {
    categoryId?: string; title?: string; content?: string; excerpt?: string | null;
    status?: typeof kbArticles.status._.data; tags?: string[] | null; language?: string; aiEligible?: boolean; expectedUpdatedAt?: string;
  };
  if (typeof expectedUpdatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    res.status(400).json({ error: "expectedUpdatedAt required" }); return;
  }
  if (new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
    res.status(409).json({ error: "Article changed. Reload and review before saving." }); return;
  }
  try { parseKbQuery({ language, status }); }
  catch { res.status(400).json({ error: "Invalid language or status" }); return; }
  if (aiEligible !== undefined && typeof aiEligible !== "boolean") { res.status(400).json({ error: "Invalid aiEligible" }); return; }
  const contentChanged = (title !== undefined && title !== existing.title)
    || (content !== undefined && content !== existing.content)
    || (excerpt !== undefined && excerpt !== existing.excerpt)
    || (language !== undefined && language !== existing.language)
    || (categoryId !== undefined && categoryId !== existing.categoryId)
    || (tags !== undefined && JSON.stringify(tags) !== JSON.stringify(existing.tags));

  const wasPublished = existing.status !== "published" && status === "published";
  if (categoryId !== undefined && !isKbUuid(categoryId)) { res.status(400).json({ error: "Invalid categoryId" }); return; }
  const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));

  const [updated] = await db.update(kbArticles).set({
    categoryId: categoryId ?? existing.categoryId,
    title: title ?? existing.title,
    language: language ?? existing.language,
    aiEligible: contentChanged ? false : aiEligible ?? existing.aiEligible,
    ...(contentChanged && existing.sourceKey ? {
      sourceRevision: `local-${updatedAt.toISOString()}`,
      sourceHash: createHash("sha256").update(content ?? existing.content).digest("hex"),
    } : {}),
    content: content ?? existing.content,
    excerpt: excerpt !== undefined ? excerpt : existing.excerpt,
    status: status ?? existing.status,
    tags: tags !== undefined ? tags : existing.tags,
    publishedAt: wasPublished ? new Date() : existing.publishedAt,
    updatedAt,
  }).where(and(eq(kbArticles.id, id),
    // API dates have millisecond precision; imported PostgreSQL timestamps may have microseconds.
    sql`date_trunc('milliseconds', ${kbArticles.updatedAt}) = ${new Date(expectedUpdatedAt).toISOString()}::timestamp`
  )).returning();
  if (!updated) { res.status(409).json({ error: "Article changed. Reload and review before saving." }); return; }

  res.json(updated);
});

// DELETE /kb/articles/:id
router.delete("/kb/articles/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params.id);
  if (!isKbUuid(id)) { res.status(400).json({ error: "Invalid article id" }); return; }

  await db.delete(kbArticles).where(eq(kbArticles.id, id));
  res.status(204).send();
});

export default router;
