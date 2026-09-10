import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
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

test("matching evidence after 1200 characters survives parent selection, including a long paragraph", () => {
  for (const separator of ["\n\n", " "]) {
    const content =
      "Introduction without relevant evidence. ".repeat(90) +
      separator +
      "Le bourrage papier est le symptome exact observe." +
      " Other notes.".repeat(100);
    const passage = matchingPassage(content, ["bourrage", "papier"]);
    assert.match(passage, /Le bourrage papier est le symptome exact observe\./);
    assert.ok(passage.length <= 1200);
    assert.equal(content.includes(passage), true);
  }
});

test("passage selection retains original Unicode and prefers multiple matching terms", () => {
  const prefix = "Papier. " + "E\u0301cran sans incident. ".repeat(100);
  const content = prefix + "Papier et bourrage: re\u0301glage a verifier.";
  assert.match(
    matchingPassage(content, ["papier", "bourrage", "reglage"]),
    /Papier et bourrage: re\u0301glage/,
  );
  assert.equal(
    matchingPassage("Short reference", ["reference"]),
    "Short reference",
  );
});

test("Academy excerpt language is derived from the same description fallback as its text", () => {
  const localized = localizedText(sql`description`, "fr");
  const dialect = new PgDialect();
  const text = dialect.sqlToQuery(localized.text);
  const language = dialect.sqlToQuery(localized.language);
  assert.match(
    text.sql,
    /coalesce\(nullif\(description->>\$1, ''\), description->>'en'/,
  );
  assert.match(
    language.sql,
    /when nullif\(description->>\$1, ''\) is not null/,
  );
  assert.deepEqual(text.params, ["fr"]);
  assert.deepEqual(language.params, ["fr", "fr"]);
  const rag = readFileSync(new URL("./rag.ts", import.meta.url), "utf8");
  assert.match(rag, /localizedText\(courses.description, language\)/);
  assert.match(rag, /language: localizedDescription.language/);
});

test("linked copies require a present, published, approved and exactly synchronized article", () => {
  const gate = new PgDialect().sqlToQuery(
    linkedKbEligibility(
      sql`doc_url`,
      sql`doc_content`,
      sql`doc_language`,
      sql`doc_title`,
      sql`doc_tags`,
    ),
  );
  for (const condition of [
    "then exists",
    "from kb_articles as approved_kb",
    "approved_kb.status = 'published'",
    "approved_kb.ai_eligible = true",
    "approved_kb.content = doc_content",
    "approved_kb.language = doc_language",
    "approved_kb.title = doc_title",
    "'/kb/articles/' || approved_kb.id::text",
    "'kb:' || approved_kb.id::text",
    "else true end",
    "jsonb_typeof(doc_tags) = 'array'",
    "where provenance.tag like '[sourceKey=%'",
  ])
    assert.ok(gate.sql.includes(condition), condition);
  const rag = readFileSync(new URL("./rag.ts", import.meta.url), "utf8")
    .replace(/\s+/g, "")
    .replace(/,\)/g, ")");
  assert.equal(
    rag.split(
      "linkedKbEligibility(docs.sourceUrl,docs.content,docs.language,docs.title,docs.tags)",
    ).length - 1,
    2,
  );
  assert.ok(rag.includes("strpos(${docs.content},${chunks.content})>0"));
  assert.equal(
    rag.split("excerpt:matchingPassage(doc.content,keywords)").length - 1,
    2,
  );
});

test("French lexical retrieval preserves accents via normalization and drops common words", () => {
  assert.deepEqual(
    extractKeywords(
      "Bonjour, je voudrais de l'aide pour un bourrage papier sur mon imprimante",
    ),
    ["bourrage", "papier", "imprimante", "paper", "printer"],
  );
  assert.deepEqual(extractKeywords("Événement événement caméra réglage"), [
    "evenement",
    "camera",
    "reglage",
    "appareil photo",
  ]);
  assert.deepEqual(extractKeywords("please help me with my printer printer"), [
    "printer",
    "imprimante",
  ]);
  assert.equal(extractKeywords("% _ ' OR 1=1 --").length, 0);
});

test("closed bilingual domain glossary expands both directions without generic help terms", () => {
  for (const [en, fr] of [
    ["printer", "imprimante"],
    ["paper", "papier"],
    ["consumables", "consommables"],
    ["troubleshooting", "depannage"],
    ["assembly", "montage"],
    ["camera", "appareil photo"],
  ]) {
    assert.deepEqual(extractKeywords(en), [en, fr]);
    assert.deepEqual(extractKeywords(fr), [fr, en]);
  }
  assert.deepEqual(extractKeywords("help please aide merci"), []);
  assert.deepEqual(extractKeywords("appareil\nphoto"), [
    "appareil photo",
    "camera",
  ]);
  assert.deepEqual(extractKeywords("camera appareil photo camera"), [
    "camera",
    "appareil photo",
  ]);
  assert.ok(
    extractKeywords(
      "printer paper consumables troubleshooting assembly camera alpha beta gamma delta",
    ).length <= 16,
  );
  assert.ok(
    !extractKeywords(
      "printer paper consumables troubleshooting assembly camera alpha beta gamma delta",
    ).includes("gamma"),
  );
  assert.deepEqual(
    new PgDialect().sqlToQuery(languagePreference(sql`language`, "en-US"))
      .params,
    ["en"],
  );
});

test("lexical SQL uses parameter binding and accent normalization without a DB extension", () => {
  const compiled = new PgDialect().sqlToQuery(
    lexicalMatch(sql`content`, "reglage"),
  );
  assert.match(compiled.sql, /translate\(lower/);
  assert.deepEqual(compiled.params, ["%reglage%"]);
  const ranked = new PgDialect().sqlToQuery(
    relevance([sql`title`, sql`content`], ["papier", "bourrage"]),
  );
  assert.deepEqual(ranked.params, [
    "%papier%",
    "%papier%",
    "%bourrage%",
    "%bourrage%",
  ]);
});

test("language preference normalizes a regional locale before ranking", () => {
  assert.deepEqual(
    new PgDialect().sqlToQuery(languagePreference(sql`language`, "fr-FR"))
      .params,
    ["fr"],
  );
});

test("KB citations use ID; untrusted remote and private navigation are rejected", () => {
  assert.equal(kbCitation("article-id"), "/kb/articles/article-id");
  assert.equal(
    safeSourceUrl("/kb/articles/article-id"),
    "/kb/articles/article-id",
  );
  for (const url of [
    "javascript:alert(1)",
    "//evil.test",
    "http://localhost",
    "https://evil.test",
    "/admin",
    "/gallery/private",
    "/academy?token=secret",
    "/kb/articles/../admin",
  ])
    assert.equal(safeSourceUrl(url), undefined);
});

test("retrieval queries enforce eligibility, rank before limits and deduplicate chunks by parent", () => {
  const rag = readFileSync(new URL("./rag.ts", import.meta.url), "utf8")
    .replace(/\s+/g, "")
    .replace(/,\)/g, ")");
  assert.ok(
    rag.includes(
      'eq(kbArticles.status,"published"),eq(kbArticles.aiEligible,true)',
    ),
  );
  assert.equal(
    rag.split('eq(docs.aiActive,true),eq(docs.status,"indexed")').length - 1,
    2,
  );
  assert.match(rag, /selectDistinctOn\(\[docs.id\]/);
  assert.match(rag, /notInArray\(docs.id,excluded\)/);
  assert.match(
    rag,
    /orderBy\(desc\(languagePreference\(candidates.language,language\)\).*\.limit\(2\)/,
  );
  assert.match(
    rag,
    /orderBy\(desc\(languagePreference\(docs.language,language\)\).*\.limit\(5\)/,
  );
  assert.match(
    rag,
    /orderBy\(desc\(languagePreference\(locale,language\)\).*\.limit\(3\)/,
  );
  assert.match(rag, /eq\(courses.isPublished,true\)/);
});
