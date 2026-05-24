// ─── RAG Retrieval Layer ───────────────────────────────────────────────────────
// Keyword / ILIKE search across KB articles, Academy courses, and AI Knowledge
// documents + chunks. Swap the ILIKE calls for pgvector similarity in production.

import { ilike, or, eq, and, ne } from "drizzle-orm";
import {
  db,
  kbArticles,
  courses,
  aiKnowledgeDocuments,
  aiKnowledgeChunks,
} from "@workspace/db";
import type { RAGSource } from "./provider";

// ─── Stop-word list for keyword extraction ────────────────────────────────────

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","up","about","into","through","is","are","was","were","be",
  "been","being","have","has","had","do","does","did","will","would","could",
  "should","may","might","can","i","me","my","we","our","you","your","it",
  "its","this","that","these","those","what","how","when","where","why","who",
  "help","need","want","like","get","make","use","using","used","please",
]);

export function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 8);
}

// ─── KB articles ──────────────────────────────────────────────────────────────

async function searchKBArticles(keywords: string[]): Promise<RAGSource[]> {
  if (keywords.length === 0) return [];

  const conditions = keywords.flatMap((kw) => [
    ilike(kbArticles.title, `%${kw}%`),
    ilike(kbArticles.content, `%${kw}%`),
  ]);

  const results = await db
    .select({
      id: kbArticles.id,
      title: kbArticles.title,
      slug: kbArticles.slug,
      excerpt: kbArticles.excerpt,
      content: kbArticles.content,
    })
    .from(kbArticles)
    .where(and(eq(kbArticles.status, "published"), or(...conditions)))
    .limit(3);

  return results.map((a) => ({
    id: a.id,
    type: "kb" as const,
    title: a.title,
    url: `/kb/articles/${a.slug}`,
    excerpt: a.excerpt ?? a.content.slice(0, 200) + "...",
  }));
}

// ─── Academy courses ──────────────────────────────────────────────────────────

async function searchAcademyContent(keywords: string[]): Promise<RAGSource[]> {
  if (keywords.length === 0) return [];

  const courseResults = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      description: courses.description,
    })
    .from(courses)
    .where(or(...keywords.map((kw) => ilike(courses.slug, `%${kw}%`))))
    .limit(2);

  return courseResults.map((course) => {
    const titleText =
      typeof course.title === "string"
        ? course.title
        : (course.title as { en?: string })?.en ?? "Academy Course";
    const descText =
      typeof course.description === "string"
        ? course.description
        : (course.description as { en?: string })?.en ?? "";
    return {
      id: course.id,
      type: "academy" as const,
      title: titleText,
      url: `/academy`,
      excerpt: descText.slice(0, 200),
    };
  });
}

// ─── AI Knowledge documents ───────────────────────────────────────────────────
// Respects: aiActive = true, status != 'archived', language preference,
//           productModel keyword scoring.

async function searchAIKnowledgeDocs(
  keywords: string[],
  language?: string
): Promise<RAGSource[]> {
  if (keywords.length === 0) return [];

  const contentConditions = keywords.flatMap((kw) => [
    ilike(aiKnowledgeDocuments.title, `%${kw}%`),
    ilike(aiKnowledgeDocuments.content, `%${kw}%`),
  ]);

  const results = await db
    .select({
      id: aiKnowledgeDocuments.id,
      title: aiKnowledgeDocuments.title,
      content: aiKnowledgeDocuments.content,
      category: aiKnowledgeDocuments.category,
      productModel: aiKnowledgeDocuments.productModel,
      language: aiKnowledgeDocuments.language,
      sourceUrl: aiKnowledgeDocuments.sourceUrl,
    })
    .from(aiKnowledgeDocuments)
    .where(
      and(
        eq(aiKnowledgeDocuments.aiActive, true),
        ne(aiKnowledgeDocuments.status, "archived"),
        or(...contentConditions)
      )
    )
    .limit(5);

  // Score: prefer language match + product model keyword match
  const queryLower = keywords.join(" ");
  const scored = results.map((doc) => {
    let score = 0;
    if (language && doc.language === language) score += 2;
    if (doc.productModel && queryLower.includes(doc.productModel.toLowerCase())) score += 3;
    return { doc, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.map(({ doc }) => ({
    id: doc.id,
    type: "knowledge" as const,
    title: doc.title,
    url: doc.sourceUrl ?? undefined,
    excerpt: doc.content.slice(0, 250) + (doc.content.length > 250 ? "..." : ""),
    meta: {
      category: doc.category,
      productModel: doc.productModel ?? undefined,
      language: doc.language,
    },
  }));
}

// ─── AI Knowledge chunks (paragraph-level fallback) ───────────────────────────

async function searchAIKnowledgeChunks(
  keywords: string[],
  excludeDocIds: Set<string>
): Promise<RAGSource[]> {
  if (keywords.length === 0) return [];

  const chunkConditions = keywords.map((kw) =>
    ilike(aiKnowledgeChunks.content, `%${kw}%`)
  );

  const chunkResults = await db
    .select({
      id: aiKnowledgeChunks.id,
      documentId: aiKnowledgeChunks.documentId,
      content: aiKnowledgeChunks.content,
    })
    .from(aiKnowledgeChunks)
    .where(or(...chunkConditions))
    .limit(8);

  const uniqueDocIds = [
    ...new Set(chunkResults.map((c) => c.documentId)),
  ].filter((id) => !excludeDocIds.has(id));
  if (uniqueDocIds.length === 0) return [];

  const parentDocs = await db
    .select({
      id: aiKnowledgeDocuments.id,
      title: aiKnowledgeDocuments.title,
      sourceUrl: aiKnowledgeDocuments.sourceUrl,
    })
    .from(aiKnowledgeDocuments)
    .where(
      and(
        eq(aiKnowledgeDocuments.aiActive, true),
        ne(aiKnowledgeDocuments.status, "archived")
      )
    );

  const activeDocMap = new Map(parentDocs.map((d) => [d.id, d]));
  const seenDocs = new Set<string>();
  const sources: RAGSource[] = [];

  for (const chunk of chunkResults) {
    const parent = activeDocMap.get(chunk.documentId);
    if (!parent || seenDocs.has(chunk.documentId)) continue;
    seenDocs.add(chunk.documentId);
    sources.push({
      id: `chunk:${chunk.id}`,
      type: "knowledge" as const,
      title: parent.title,
      url: parent.sourceUrl ?? undefined,
      excerpt: chunk.content.slice(0, 250) + (chunk.content.length > 250 ? "..." : ""),
    });
    if (sources.length >= 2) break;
  }

  return sources;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RetrievalLogEntry {
  source: string;
  count: number;
  keywords: string[];
}

export interface RAGResult {
  sources: RAGSource[];
  contextText: string;
  retrievalLog: RetrievalLogEntry[];
}

// ─── Main retrieval function ──────────────────────────────────────────────────

export async function retrieveContext(
  query: string,
  language?: string
): Promise<RAGResult> {
  const keywords = extractKeywords(query);
  const retrievalLog: RetrievalLogEntry[] = [];

  // Run all three primary searches in parallel
  const [kbSources, academySources, knowledgeSources] = await Promise.all([
    searchKBArticles(keywords),
    searchAcademyContent(keywords),
    searchAIKnowledgeDocs(keywords, language),
  ]);

  retrievalLog.push(
    { source: "kb_articles", count: kbSources.length, keywords },
    { source: "academy_courses", count: academySources.length, keywords },
    { source: "ai_knowledge_documents", count: knowledgeSources.length, keywords }
  );

  // Merge — AI Knowledge docs get priority, then KB, then Academy
  const seen = new Set<string>();
  const sources: RAGSource[] = [];
  const seenDocIds = new Set<string>();

  for (const s of [...knowledgeSources, ...kbSources, ...academySources]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    sources.push(s);
    if (s.type === "knowledge") {
      seenDocIds.add(s.id.startsWith("chunk:") ? s.id.slice(6) : s.id);
    }
    if (sources.length >= 6) break;
  }

  // Chunk fallback — fill remaining slots with paragraph-level matches
  if (sources.length < 6 && keywords.length > 0) {
    const chunkSources = await searchAIKnowledgeChunks(keywords, seenDocIds);
    retrievalLog.push({ source: "ai_knowledge_chunks", count: chunkSources.length, keywords });
    for (const s of chunkSources) {
      if (!seen.has(s.id) && sources.length < 6) {
        seen.add(s.id);
        sources.push(s);
      }
    }
  }

  const contextText =
    sources.length > 0
      ? sources
          .map((s) => `[${s.type.toUpperCase()}] ${s.title}\n${s.excerpt}`)
          .join("\n\n")
      : "";

  return { sources, contextText, retrievalLog };
}

// ─── Suggested actions ────────────────────────────────────────────────────────

export function buildSuggestedActions(
  query: string,
  sources: RAGSource[]
): Array<{ type: string; label: string; data?: Record<string, unknown> }> {
  const lower = query.toLowerCase();
  const actions: Array<{ type: string; label: string; data?: Record<string, unknown> }> = [];

  const isTechnical =
    lower.includes("not working") || lower.includes("broken") ||
    lower.includes("error") || lower.includes("problem") ||
    lower.includes("issue") || lower.includes("fail") ||
    lower.includes("jam") || lower.includes("stuck");

  const isConsumable =
    lower.includes("paper") || lower.includes("ribbon") ||
    lower.includes("stock") || lower.includes("order") || lower.includes("reorder");

  const isEquipment =
    lower.includes("booth") || lower.includes("equipment") ||
    lower.includes("unit") || lower.includes("maintenance") ||
    lower.includes("warranty") || lower.includes("service");

  const isLearning =
    lower.includes("learn") || lower.includes("tutorial") ||
    lower.includes("course") || lower.includes("train") ||
    lower.includes("how to") || lower.includes("guide");

  for (const s of sources.filter((s) => s.type === "kb").slice(0, 2)) {
    actions.push({
      type: "navigate",
      label: `Read: ${s.title.slice(0, 40)}${s.title.length > 40 ? "…" : ""}`,
      data: { url: s.url },
    });
  }

  for (const s of sources.filter((s) => s.type === "knowledge" && s.url && !s.url.includes("admin")).slice(0, 1)) {
    actions.push({
      type: "navigate",
      label: `View: ${s.title.slice(0, 40)}${s.title.length > 40 ? "…" : ""}`,
      data: { url: s.url },
    });
  }

  if (sources.some((s) => s.type === "academy") || isLearning) {
    actions.push({ type: "navigate", label: "Go to Academy", data: { url: "/academy" } });
  }
  if (isConsumable) {
    actions.push({ type: "reorder", label: "Check Consumables Stock", data: { url: "/consumables" } });
  }
  if (isEquipment) {
    actions.push({ type: "navigate", label: "View My Equipment", data: { url: "/equipment" } });
  }
  if (isTechnical) {
    actions.push({ type: "escalate", label: "Open Support Ticket", data: {} });
  }

  const seen = new Set<string>();
  return actions.filter((a) => {
    if (seen.has(a.label)) return false;
    seen.add(a.label);
    return true;
  }).slice(0, 4);
}
