import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, asc, sql, ilike, or } from "drizzle-orm";
import { db, kbCategories, kbArticles, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// GET /kb/categories
router.get("/kb/categories", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const items = await db.select({
    id: kbCategories.id,
    name: kbCategories.name,
    slug: kbCategories.slug,
    description: kbCategories.description,
    icon: kbCategories.icon,
    order: kbCategories.order,
    createdAt: kbCategories.createdAt,
    articleCount: sql<number>`(select count(*) from kb_articles where category_id = ${kbCategories.id} and status = 'published')::int`,
  }).from(kbCategories).orderBy(asc(kbCategories.order));

  res.json({ items });
});

// POST /kb/categories
router.post("/kb/categories", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, slug, description, icon, order } = req.body as {
    name: string; slug?: string; description?: string; icon?: string; order?: number;
  };
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  const [cat] = await db.insert(kbCategories).values({
    name,
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

  const { categoryId, status, search, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const isAdmin = user.role === "admin";
  const conditions = [];

  if (!isAdmin) conditions.push(eq(kbArticles.status, "published"));
  else if (status) conditions.push(eq(kbArticles.status, status as typeof kbArticles.status._.data));

  if (categoryId) conditions.push(eq(kbArticles.categoryId, categoryId));
  if (search) {
    conditions.push(
      or(
        ilike(kbArticles.title, `%${search}%`),
        ilike(kbArticles.content, `%${search}%`),
        ilike(kbArticles.excerpt!, `%${search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRow] = await Promise.all([
    db.select().from(kbArticles).where(whereClause).orderBy(asc(kbArticles.order), desc(kbArticles.publishedAt)).limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)::int` }).from(kbArticles).where(whereClause),
  ]);

  res.json({ items: rows, total: countRow[0]?.count ?? 0 });
});

// POST /kb/articles
router.post("/kb/articles", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { categoryId, title, content, excerpt, status, tags } = req.body as {
    categoryId: string; title: string; content: string; excerpt?: string;
    status?: typeof kbArticles.status._.data; tags?: string[];
  };
  if (!categoryId || !title || !content) { res.status(400).json({ error: "categoryId, title, content required" }); return; }

  const baseSlug = slugify(title);
  const existing = await db.select({ id: kbArticles.id }).from(kbArticles).where(eq(kbArticles.slug, baseSlug)).limit(1);
  const slug = existing.length > 0 ? `${baseSlug}-${Date.now()}` : baseSlug;

  const [article] = await db.insert(kbArticles).values({
    categoryId,
    authorId: user.id,
    title,
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

  const isAdmin = user.role === "admin";
  const conditions = [eq(kbArticles.id, id)];
  if (!isAdmin) conditions.push(eq(kbArticles.status, "published"));

  const [article] = await db.select().from(kbArticles).where(and(...conditions));
  if (!article) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(kbArticles).set({ views: article.views + 1 }).where(eq(kbArticles.id, id));

  const related = await db.select({ id: kbArticles.id, title: kbArticles.title, slug: kbArticles.slug, excerpt: kbArticles.excerpt })
    .from(kbArticles)
    .where(and(eq(kbArticles.categoryId, article.categoryId), eq(kbArticles.status, "published"), sql`${kbArticles.id} != ${id}`))
    .limit(4);

  res.json({ ...article, views: article.views + 1, related });
});

// PUT /kb/articles/:id
router.put("/kb/articles/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params.id);

  const [existing] = await db.select().from(kbArticles).where(eq(kbArticles.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { categoryId, title, content, excerpt, status, tags } = req.body as {
    categoryId?: string; title?: string; content?: string; excerpt?: string | null;
    status?: typeof kbArticles.status._.data; tags?: string[] | null;
  };

  const wasPublished = existing.status !== "published" && status === "published";

  const [updated] = await db.update(kbArticles).set({
    categoryId: categoryId ?? existing.categoryId,
    title: title ?? existing.title,
    content: content ?? existing.content,
    excerpt: excerpt !== undefined ? excerpt : existing.excerpt,
    status: status ?? existing.status,
    tags: tags !== undefined ? tags : existing.tags,
    publishedAt: wasPublished ? new Date() : existing.publishedAt,
    updatedAt: new Date(),
  }).where(eq(kbArticles.id, id)).returning();

  res.json(updated);
});

// DELETE /kb/articles/:id
router.delete("/kb/articles/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = String(req.params.id);

  await db.delete(kbArticles).where(eq(kbArticles.id, id));
  res.status(204).send();
});

export default router;
