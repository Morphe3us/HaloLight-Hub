import { sql, type SQLWrapper } from "drizzle-orm";
import { normalizeText } from "./supportPolicy";

const STOP_WORDS = new Set(
  "a an the and or but in on at to for of with by from is are was were be been have has had do does did will would could should may might can i me my we our you your it its this that these those what how when where why who help need want like get make use using used please le la les un une des du de et ou mais dans sur au aux avec par pour est sont etre avoir mon ma mes notre nos votre vos ce cette ces que qui quoi comment quand pourquoi je tu il elle nous vous ils elles ne pas plus pouvez bonjour merci besoin aide faire voudrais quel quelle quels quelles".split(
    " ",
  ),
);

export function extractKeywords(query: string): string[] {
  return [...new Set(normalizeText(query).match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 8);
}

export function lexicalMatch(column: SQLWrapper, keyword: string) {
  return sql`translate(lower(coalesce(${column}::text, '')), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc') like ${`%${keyword}%`}`;
}

export function relevance(columns: SQLWrapper[], keywords: string[]) {
  return sql<number>`(${sql.join(
    keywords.map(
      (word) =>
        sql`case when (${sql.join(
          columns.map((column) => lexicalMatch(column, word)),
          sql` or `,
        )}) then 1 else 0 end`,
    ),
    sql` + `,
  )})`;
}

export function languagePreference(column: SQLWrapper, language = "en") {
  return sql<number>`case when split_part(lower(${column}::text), '-', 1) = ${language.toLowerCase().split("-")[0]} then 1 else 0 end`;
}

export function localizedText(column: SQLWrapper, language: string) {
  const requested = sql`nullif(${column}->>${language}, '')`;
  return {
    text: sql<string>`coalesce(${requested}, ${column}->>'en', '')`,
    language: sql<string>`case when ${requested} is not null then ${language} else 'en' end`,
  };
}

// Linked imports are derived copies, never independent approval authorities.
// Exact content equality also prevents a stale copy becoming eligible merely
// because an edited article has subsequently been approved again.
export function linkedKbEligibility(
  sourceUrl: SQLWrapper,
  content: SQLWrapper,
  language: SQLWrapper,
  title: SQLWrapper,
  tags: SQLWrapper = sql`'[]'::jsonb`,
) {
  return sql`case when ${sourceUrl} like '/kb/articles/%' or ${sourceUrl} like 'kb:%' or exists (
    select 1 from jsonb_array_elements_text(case when jsonb_typeof(${tags}) = 'array' then ${tags} else '[]'::jsonb end) as provenance(tag)
    where provenance.tag like '[sourceKey=%'
  ) then exists (
    select 1 from kb_articles as approved_kb
    where (${sourceUrl} = '/kb/articles/' || approved_kb.id::text
      or ${sourceUrl} = 'kb:' || approved_kb.id::text)
      and approved_kb.status = 'published' and approved_kb.ai_eligible = true
      and approved_kb.content = ${content} and approved_kb.language = ${language}
      and approved_kb.title = ${title}
  ) else true end`;
}

export function matchingPassage(
  content: string,
  keywords: string[],
  limit = 1200,
): string {
  if (content.length <= limit) return content;
  // Keep original offsets even for decomposed accents and surrogate pairs.
  let normalized = "";
  const offsets: number[] = [];
  let offset = 0;
  for (const char of content) {
    const folded = normalizeText(char);
    normalized += folded;
    for (let index = 0; index < folded.length; index++) offsets.push(offset);
    offset += char.length;
  }
  let bestStart = 0;
  let bestScore = -1;
  const starts = new Set([0]);
  const step = Math.max(1, Math.floor(limit / 2));
  for (const keyword of keywords) {
    let index = normalized.indexOf(keyword);
    while (index !== -1) {
      // Bound candidate count by document length, not repeated word count.
      starts.add(
        Math.max(
          0,
          Math.floor((offsets[index] ?? 0) / step) * step -
            Math.floor(limit / 4),
        ),
      );
      index = normalized.indexOf(keyword, index + keyword.length);
    }
  }
  for (const start of starts) {
    const passage = normalizeText(content.slice(start, start + limit));
    const score = keywords.filter((keyword) =>
      passage.includes(keyword),
    ).length;
    if (score > bestScore) {
      bestStart = start;
      bestScore = score;
    }
  }
  return content.slice(bestStart, bestStart + limit);
}

export function kbCitation(id: string): string {
  return `/kb/articles/${encodeURIComponent(id)}`;
}

export function safeSourceUrl(value?: string | null): string | undefined {
  // Internal client destinations only; source URLs are untrusted and must not
  // expose remote access, private galleries, admin pages or executable schemes.
  if (value && /^\/(?:kb\/articles\/[a-zA-Z0-9-]+|academy)\/?$/.test(value))
    return value;
  return undefined;
}
