// ─── RAG Retrieval Layer ───────────────────────────────────────────────────────
// Currently uses keyword/ILIKE search. Replace retrieveByVector() with a
// pgvector or external embedding call to make this fully vector-search-ready.

import { ilike, or, eq, and } from "drizzle-orm";
import { db, kbArticles, courses } from "@workspace/db";
import type { RAGSource } from "./provider";

// Common English stop words to ignore during keyword extraction
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
    .slice(0, 8); // max 8 keywords
}

// ─── Keyword search (swap this for vector search in production) ───────────────

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
    .limit(4);

  return results.map((a) => ({
    id: a.id,
    type: "kb" as const,
    title: a.title,
    url: `/kb/articles/${a.slug}`,
    excerpt: a.excerpt ?? a.content.slice(0, 200) + "...",
  }));
}

async function searchAcademyContent(keywords: string[]): Promise<RAGSource[]> {
  if (keywords.length === 0) return [];

  // Courses have a text `slug` column we can use with ILIKE.
  // `title` and `description` are jsonb — we match via slug keyword overlap instead.
  const courseResults = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      description: courses.description,
    })
    .from(courses)
    .where(or(...keywords.map((kw) => ilike(courses.slug, `%${kw}%`))))
    .limit(3);

  const sources: RAGSource[] = [];

  for (const course of courseResults) {
    const titleText =
      typeof course.title === "string"
        ? course.title
        : (course.title as { en?: string })?.en ?? "Academy Course";
    const descText =
      typeof course.description === "string"
        ? course.description
        : (course.description as { en?: string })?.en ?? "";

    sources.push({
      id: course.id,
      type: "academy",
      title: titleText,
      url: `/academy`,
      excerpt: descText.slice(0, 200),
    });
  }

  return sources;
}

// ─── Public retrieval function ────────────────────────────────────────────────

export interface RAGResult {
  sources: RAGSource[];
  contextText: string;
}

export async function retrieveContext(query: string): Promise<RAGResult> {
  const keywords = extractKeywords(query);

  const [kbSources, academySources] = await Promise.all([
    searchKBArticles(keywords),
    searchAcademyContent(keywords),
  ]);

  // Deduplicate and limit total sources
  const seen = new Set<string>();
  const sources: RAGSource[] = [];
  for (const s of [...kbSources, ...academySources]) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      sources.push(s);
    }
    if (sources.length >= 5) break;
  }

  // Build context block for system prompt injection
  const contextText =
    sources.length > 0
      ? sources
          .map((s) => `[${s.type.toUpperCase()}] ${s.title}\n${s.excerpt}`)
          .join("\n\n")
      : "";

  return { sources, contextText };
}

// ─── Suggested actions builder ─────────────────────────────────────────────────

export function buildSuggestedActions(
  query: string,
  sources: RAGSource[]
): Array<{ type: string; label: string; data?: Record<string, unknown> }> {
  const lower = query.toLowerCase();
  const actions: Array<{ type: string; label: string; data?: Record<string, unknown> }> = [];

  // Always offer escalation if technical question detected
  const isTechnical =
    lower.includes("not working") ||
    lower.includes("broken") ||
    lower.includes("error") ||
    lower.includes("problem") ||
    lower.includes("issue") ||
    lower.includes("fail") ||
    lower.includes("jam") ||
    lower.includes("stuck");

  const isConsumable =
    lower.includes("paper") ||
    lower.includes("ribbon") ||
    lower.includes("stock") ||
    lower.includes("order") ||
    lower.includes("reorder");

  const isEquipment =
    lower.includes("booth") ||
    lower.includes("equipment") ||
    lower.includes("unit") ||
    lower.includes("maintenance") ||
    lower.includes("warranty") ||
    lower.includes("service");

  const isLearning =
    lower.includes("learn") ||
    lower.includes("tutorial") ||
    lower.includes("course") ||
    lower.includes("train") ||
    lower.includes("how to") ||
    lower.includes("guide");

  // Add KB article links from sources
  const kbSources = sources.filter((s) => s.type === "kb").slice(0, 2);
  for (const s of kbSources) {
    actions.push({
      type: "navigate",
      label: `Read: ${s.title.slice(0, 40)}${s.title.length > 40 ? "…" : ""}`,
      data: { url: s.url },
    });
  }

  // Add academy link if learning content found
  const academySources = sources.filter((s) => s.type === "academy");
  if (academySources.length > 0 || isLearning) {
    actions.push({
      type: "navigate",
      label: "Go to Academy",
      data: { url: "/academy" },
    });
  }

  if (isConsumable) {
    actions.push({
      type: "reorder",
      label: "Check Consumables Stock",
      data: { url: "/consumables" },
    });
  }

  if (isEquipment) {
    actions.push({
      type: "navigate",
      label: "View My Equipment",
      data: { url: "/equipment" },
    });
  }

  if (isTechnical) {
    actions.push({
      type: "escalate",
      label: "Open Support Ticket",
      data: {},
    });
  }

  // Deduplicate by label and cap at 4 actions
  const seen = new Set<string>();
  return actions.filter((a) => {
    if (seen.has(a.label)) return false;
    seen.add(a.label);
    return true;
  }).slice(0, 4);
}
