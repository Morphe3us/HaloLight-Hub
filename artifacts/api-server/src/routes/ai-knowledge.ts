import { Router, type IRouter, type Request, type Response } from "express";
import { eq, ilike, and } from "drizzle-orm";
import {
  db,
  aiKnowledgeDocuments,
  aiKnowledgeChunks,
  aiKnowledgeTags,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { documentUpdatePolicy } from "../lib/ai/documentUpdatePolicy";

const router: IRouter = Router();

type AIDocCategory =
  | "faq"
  | "troubleshooting"
  | "printer_manual"
  | "camera_manual"
  | "software_guide"
  | "business_guide"
  | "pricing_guide"
  | "event_guide"
  | "product_guide"
  | "academy_lesson"
  | "support_article";
type AIDocStatus = "draft" | "indexed" | "needs_review" | "archived";

function requireAdmin(
  user: { role: string } | null | undefined,
  res: Response,
): boolean {
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

function fmt(d: typeof aiKnowledgeDocuments.$inferSelect) {
  return {
    id: d.id,
    title: d.title,
    language: d.language,
    category: d.category,
    productModel: d.productModel,
    sourceUrl: d.sourceUrl,
    content: d.content,
    tags: d.tags,
    aiActive: d.aiActive,
    lastIndexedAt: d.lastIndexedAt,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// Chunk text into ~500-char segments at paragraph/sentence boundaries
function chunkText(text: string, maxLen = 500): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).length <= maxLen) {
      current = current ? current + "\n\n" + para : para;
    } else {
      if (current) chunks.push(current.trim());
      if (para.length <= maxLen) {
        current = para;
      } else {
        const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
        for (const sent of sentences) {
          if ((current + sent).length <= maxLen) {
            current = current ? current + " " + sent : sent;
          } else {
            if (current) chunks.push(current.trim());
            current = sent;
          }
        }
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

// GET /admin/ai-knowledge
router.get(
  "/admin/ai-knowledge",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const { category, language, status, aiActive, q } = req.query as Record<
      string,
      string
    >;

    const conditions = [];
    if (category)
      conditions.push(
        eq(aiKnowledgeDocuments.category, category as AIDocCategory),
      );
    if (language) conditions.push(eq(aiKnowledgeDocuments.language, language));
    if (status)
      conditions.push(eq(aiKnowledgeDocuments.status, status as AIDocStatus));
    if (aiActive !== undefined && aiActive !== "") {
      conditions.push(eq(aiKnowledgeDocuments.aiActive, aiActive === "true"));
    }
    if (q) conditions.push(ilike(aiKnowledgeDocuments.title, `%${q}%`));

    const docs =
      conditions.length > 0
        ? await db
            .select()
            .from(aiKnowledgeDocuments)
            .where(and(...conditions))
            .orderBy(aiKnowledgeDocuments.createdAt)
        : await db
            .select()
            .from(aiKnowledgeDocuments)
            .orderBy(aiKnowledgeDocuments.createdAt);

    res.json({ items: docs.map(fmt), total: docs.length });
  },
);

// POST /admin/ai-knowledge
router.post(
  "/admin/ai-knowledge",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const {
      title,
      language,
      category,
      productModel,
      sourceUrl,
      content,
      tags,
      aiActive,
      status,
    } = req.body as {
      title?: string;
      language?: string;
      category?: string;
      productModel?: string;
      sourceUrl?: string;
      content?: string;
      tags?: string[];
      aiActive?: boolean;
      status?: string;
    };

    if (!title || !category) {
      res.status(400).json({ error: "title and category are required" });
      return;
    }

    const [doc] = await db
      .insert(aiKnowledgeDocuments)
      .values({
        title,
        language: language ?? "en",
        category: category as AIDocCategory,
        productModel: productModel ?? null,
        sourceUrl: sourceUrl ?? null,
        content: content ?? "",
        tags: tags ?? [],
        aiActive: aiActive ?? true,
        status: (status as AIDocStatus) ?? "draft",
      })
      .returning();

    // Auto-index only when an admin explicitly marks the document as indexed.
    if (doc!.status === "indexed" && doc!.content && doc!.content.length > 0) {
      const chunks = chunkText(doc!.content);
      if (chunks.length > 0) {
        await db.insert(aiKnowledgeChunks).values(
          chunks.map((c, i) => ({
            documentId: doc!.id,
            content: c,
            chunkIndex: i,
            metadata: {
              language: doc!.language,
              category: doc!.category,
              title: doc!.title,
              productModel: doc!.productModel ?? "",
            },
          })),
        );
        await db
          .update(aiKnowledgeDocuments)
          .set({ status: "indexed", lastIndexedAt: new Date() })
          .where(eq(aiKnowledgeDocuments.id, doc!.id));
      }
    }

    // Insert tags
    if (tags && tags.length > 0) {
      await db
        .insert(aiKnowledgeTags)
        .values(tags.map((tag) => ({ documentId: doc!.id, tag })));
    }

    const [refreshed] = await db
      .select()
      .from(aiKnowledgeDocuments)
      .where(eq(aiKnowledgeDocuments.id, doc!.id));
    res.status(201).json(fmt(refreshed!));
  },
);

// GET /admin/ai-knowledge/:id
router.get(
  "/admin/ai-knowledge/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const id = String(req.params.id);
    const [doc] = await db
      .select()
      .from(aiKnowledgeDocuments)
      .where(eq(aiKnowledgeDocuments.id, id));
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const chunks = await db
      .select()
      .from(aiKnowledgeChunks)
      .where(eq(aiKnowledgeChunks.documentId, id))
      .orderBy(aiKnowledgeChunks.chunkIndex);

    const tags = await db
      .select()
      .from(aiKnowledgeTags)
      .where(eq(aiKnowledgeTags.documentId, id));

    res.json({ ...fmt(doc), chunks, tagList: tags.map((t) => t.tag) });
  },
);

// PUT /admin/ai-knowledge/:id
router.put(
  "/admin/ai-knowledge/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const id = String(req.params.id);
    const {
      title,
      language,
      category,
      productModel,
      sourceUrl,
      content,
      tags,
      aiActive,
      status,
    } = req.body as {
      title?: string;
      language?: string;
      category?: string;
      productModel?: string;
      sourceUrl?: string;
      content?: string;
      tags?: string[];
      aiActive?: boolean;
      status?: string;
    };

    const result = await db.transaction(async (tx) => {
      // Lock the persisted identity before validating either editable field.
      // Tags and the document row must commit together to prevent a two-step
      // detachment through separate sourceUrl and tag updates.
      const [existing] = await tx
        .select()
        .from(aiKnowledgeDocuments)
        .where(eq(aiKnowledgeDocuments.id, id))
        .for("update");
      if (!existing) return { status: 404, body: { error: "Not found" } };
      const policy = documentUpdatePolicy(existing, req.body);
      if (!policy.ok)
        return { status: policy.status, body: { error: policy.error } };

      const u: Partial<typeof aiKnowledgeDocuments.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (title !== undefined) u.title = title;
      if (language !== undefined) u.language = language;
      if (category !== undefined) u.category = category as AIDocCategory;
      if (productModel !== undefined) u.productModel = productModel;
      if (sourceUrl !== undefined) u.sourceUrl = sourceUrl;
      if (content !== undefined) u.content = content;
      if (aiActive !== undefined) u.aiActive = aiActive;
      if (status !== undefined) u.status = status as AIDocStatus;
      if (tags !== undefined) u.tags = tags;
      if (policy.resetApproval) {
        u.aiActive = false;
        u.status = "needs_review";
      }
      const [updated] = await tx
        .update(aiKnowledgeDocuments)
        .set(u)
        .where(eq(aiKnowledgeDocuments.id, id))
        .returning();

      if (tags !== undefined) {
        await tx
          .delete(aiKnowledgeTags)
          .where(eq(aiKnowledgeTags.documentId, id));
        if (tags.length > 0)
          await tx
            .insert(aiKnowledgeTags)
            .values(tags.map((tag) => ({ documentId: id, tag })));
      }
      return { status: 200, body: fmt(updated!) };
    });
    res.status(result.status).json(result.body);
  },
);

// DELETE /admin/ai-knowledge/:id
router.delete(
  "/admin/ai-knowledge/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const id = String(req.params.id);
    await db
      .delete(aiKnowledgeDocuments)
      .where(eq(aiKnowledgeDocuments.id, id));
    res.status(204).send();
  },
);

// POST /admin/ai-knowledge/:id/reindex
router.post(
  "/admin/ai-knowledge/:id/reindex",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!requireAdmin(user, res)) return;

    const id = String(req.params.id);
    const result = await db.transaction(async (tx) => {
      const [doc] = await tx
        .select()
        .from(aiKnowledgeDocuments)
        .where(eq(aiKnowledgeDocuments.id, id))
        .for("update");
      if (!doc) {
        return { status: 404, body: { error: "Not found" } };
      }

      await tx
        .delete(aiKnowledgeChunks)
        .where(eq(aiKnowledgeChunks.documentId, id));

      const chunks = chunkText(doc.content);
      if (chunks.length > 0) {
        await tx.insert(aiKnowledgeChunks).values(
          chunks.map((c, i) => ({
            documentId: id,
            content: c,
            chunkIndex: i,
            metadata: {
              language: doc.language,
              category: doc.category,
              title: doc.title,
              productModel: doc.productModel ?? "",
            },
          })),
        );
      }

      await tx
        .update(aiKnowledgeDocuments)
        .set({
          status: doc.status === "draft" ? "indexed" : doc.status,
          lastIndexedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiKnowledgeDocuments.id, id));

      return {
        status: 200,
        body: { documentId: id, chunksCreated: chunks.length },
      };
    });
    res.status(result.status).json(result.body);
  },
);

export default router;
