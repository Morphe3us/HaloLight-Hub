import { and, eq, or, desc, asc, notInArray, sql } from "drizzle-orm";
import {
  db,
  kbArticles,
  courses,
  aiKnowledgeDocuments as docs,
  aiKnowledgeChunks as chunks,
} from "@workspace/db";
import type { RAGSource, SuggestedAction } from "./provider";
import {
  extractKeywords,
  lexicalMatch,
  relevance,
  languagePreference,
  kbCitation,
  safeSourceUrl,
  matchingPassage,
  localizedText,
  linkedKbEligibility,
} from "./retrievalPolicy";
import {
  classifySupport,
  normalizeText,
  redactSensitiveText,
  supportAction,
} from "./supportPolicy";

export { extractKeywords } from "./retrievalPolicy";

async function searchKBArticles(
  keywords: string[],
  language?: string,
): Promise<RAGSource[]> {
  const locale = kbArticles.language;
  const results = await db
    .select({
      id: kbArticles.id,
      title: kbArticles.title,
      content: kbArticles.content,
      excerpt: kbArticles.excerpt,
      language: locale,
      sourceKey: kbArticles.sourceKey,
      sourceRevision: kbArticles.sourceRevision,
      sourceHash: kbArticles.sourceHash,
    })
    .from(kbArticles)
    .where(
      and(
        eq(kbArticles.status, "published"),
        eq(kbArticles.aiEligible, true),
        or(
          ...keywords.flatMap((word) => [
            lexicalMatch(kbArticles.title, word),
            lexicalMatch(kbArticles.content, word),
          ]),
        ),
      ),
    )
    .orderBy(
      desc(languagePreference(locale, language)),
      desc(relevance([kbArticles.title, kbArticles.content], keywords)),
      asc(kbArticles.id),
    )
    .limit(3);
  return results.map((article) => ({
    id: article.id,
    type: "kb",
    title: article.title,
    url: kbCitation(article.id),
    excerpt: matchingPassage(article.content, keywords),
    meta: {
      language: article.language,
      sourceKey: article.sourceKey,
      sourceRevision: article.sourceRevision,
      sourceHash: article.sourceHash,
    },
  }));
}

async function searchAcademyContent(
  keywords: string[],
  language = "en",
): Promise<RAGSource[]> {
  const title = localizedText(courses.title, language).text;
  const localizedDescription = localizedText(courses.description, language);
  const description = localizedDescription.text;
  const results = await db
    .select({
      id: courses.id,
      title,
      description,
      language: localizedDescription.language,
    })
    .from(courses)
    .where(
      and(
        eq(courses.isPublished, true),
        or(
          ...keywords.flatMap((word) => [
            lexicalMatch(title, word),
            lexicalMatch(description, word),
            lexicalMatch(courses.slug, word),
          ]),
        ),
      ),
    )
    .orderBy(desc(relevance([title, description], keywords)), asc(courses.id))
    .limit(2);
  return results.map((course) => ({
    id: course.id,
    type: "academy",
    title: course.title,
    url: "/academy",
    excerpt: course.description.slice(0, 600),
    meta: { language: course.language },
  }));
}

async function searchAIKnowledgeDocs(
  keywords: string[],
  language?: string,
): Promise<RAGSource[]> {
  const results = await db
    .select({
      id: docs.id,
      title: docs.title,
      content: docs.content,
      category: docs.category,
      productModel: docs.productModel,
      language: docs.language,
      sourceUrl: docs.sourceUrl,
    })
    .from(docs)
    .where(
      and(
        eq(docs.aiActive, true),
        eq(docs.status, "indexed"),
        linkedKbEligibility(
          docs.sourceUrl,
          docs.content,
          docs.language,
          docs.title,
          docs.tags,
        ),
        or(
          ...keywords.flatMap((word) => [
            lexicalMatch(docs.title, word),
            lexicalMatch(docs.content, word),
          ]),
        ),
      ),
    )
    .orderBy(
      desc(languagePreference(docs.language, language)),
      desc(relevance([docs.title, docs.content, docs.productModel], keywords)),
      asc(docs.id),
    )
    .limit(5);
  return results.map((doc) => ({
    id: doc.id,
    type: "knowledge",
    title: doc.title,
    url: safeSourceUrl(doc.sourceUrl),
    excerpt: matchingPassage(doc.content, keywords),
    meta: {
      category: doc.category,
      productModel: doc.productModel ?? undefined,
      language: doc.language,
    },
  }));
}

async function searchAIKnowledgeChunks(
  keywords: string[],
  excluded: string[],
  language?: string,
): Promise<RAGSource[]> {
  // Filter eligible parents and excluded documents BEFORE selecting/limiting
  // chunks, and choose one best paragraph per parent before the global limit.
  const candidates = db
    .selectDistinctOn([docs.id], {
      id: docs.id,
      title: docs.title,
      content: chunks.content,
      language: docs.language,
      sourceUrl: docs.sourceUrl,
      score: relevance([chunks.content], keywords).as("score"),
    })
    .from(chunks)
    .innerJoin(docs, eq(docs.id, chunks.documentId))
    .where(
      and(
        eq(docs.aiActive, true),
        eq(docs.status, "indexed"),
        linkedKbEligibility(
          docs.sourceUrl,
          docs.content,
          docs.language,
          docs.title,
          docs.tags,
        ),
        sql`length(${chunks.content}) > 0 and strpos(${docs.content}, ${chunks.content}) > 0`,
        excluded.length ? notInArray(docs.id, excluded) : undefined,
        or(...keywords.map((word) => lexicalMatch(chunks.content, word))),
      ),
    )
    .orderBy(
      asc(docs.id),
      desc(relevance([chunks.content], keywords)),
      asc(chunks.chunkIndex),
      asc(chunks.id),
    )
    .as("eligible_chunks");
  const results = await db
    .select()
    .from(candidates)
    .orderBy(
      desc(languagePreference(candidates.language, language)),
      desc(candidates.score),
      asc(candidates.id),
    )
    .limit(2);
  return results.map((doc) => ({
    id: doc.id,
    type: "knowledge",
    title: doc.title,
    url: safeSourceUrl(doc.sourceUrl),
    excerpt: matchingPassage(doc.content, keywords),
    meta: { language: doc.language },
  }));
}

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

export async function retrieveContext(
  query: string,
  language = "en",
): Promise<RAGResult> {
  const keywords = extractKeywords(redactSensitiveText(query));
  if (!keywords.length)
    return { sources: [], contextText: "", retrievalLog: [] };
  const [kb, academy, knowledge] = await Promise.all([
    searchKBArticles(keywords, language),
    searchAcademyContent(keywords, language),
    searchAIKnowledgeDocs(keywords, language),
  ]);
  const retrievalLog = [
    { source: "kb_articles", count: kb.length, keywords },
    { source: "academy_courses", count: academy.length, keywords },
    { source: "ai_knowledge_documents", count: knowledge.length, keywords },
  ];
  const candidates = [...knowledge, ...kb, ...academy];
  if (candidates.length < 6) {
    const fallback = await searchAIKnowledgeChunks(
      keywords,
      knowledge.map((source) => source.id),
      language,
    );
    candidates.push(...fallback);
    retrievalLog.push({
      source: "ai_knowledge_chunks",
      count: fallback.length,
      keywords,
    });
  }
  const preferred = language.toLowerCase().split("-")[0];
  candidates.sort(
    (a, b) =>
      Number(b.meta?.language?.split("-")[0] === preferred) -
      Number(a.meta?.language?.split("-")[0] === preferred),
  );
  const seen = new Set<string>();
  const sources = candidates
    .filter((source) => {
      const key = `${source.type}:${source.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map((source) => ({
      ...source,
      title: redactSensitiveText(source.title),
      excerpt: redactSensitiveText(source.excerpt),
    }));
  return {
    sources,
    contextText: sources.map((source) => JSON.stringify(source)).join("\n\n"),
    retrievalLog,
  };
}

export function buildSuggestedActions(
  query: string,
  sources: RAGSource[],
  language = "en",
): SuggestedAction[] {
  if (classifySupport(query).danger) return [];
  const action = supportAction(query, language);
  const actions: SuggestedAction[] = action ? [action] : [];
  const lower = normalizeText(query);
  if (/\b(paper|ribbon|stock|reorder|papier|ruban|consommables)\b/.test(lower))
    actions.push({
      type: "reorder",
      label: "Check Consumables Stock",
      data: { url: "/consumables" },
    });
  if (
    /\b(booth|equipment|maintenance|warranty|borne|equipement|garantie)\b/.test(
      lower,
    )
  )
    actions.push({
      type: "navigate",
      label: "View My Equipment",
      data: { url: "/equipment" },
    });
  if (
    /\b(learn|tutorial|course|guide|academy|formation|apprendre)\b/.test(lower)
  )
    actions.push({
      type: "navigate",
      label: "Go to Academy",
      data: { url: "/academy" },
    });
  for (const source of sources) {
    const url = safeSourceUrl(source.url);
    if (url && !actions.some((item) => item.data?.url === url)) {
      actions.push({
        type: "navigate",
        label: source.title.slice(0, 40),
        data: { url },
      });
    }
  }
  if (!sources.length && !action)
    actions.push({
      type: "escalate",
      label: language.startsWith("fr")
        ? "Preparer un ticket de support"
        : "Prepare Support Ticket",
      data: {},
    });
  return actions.slice(0, 4);
}
