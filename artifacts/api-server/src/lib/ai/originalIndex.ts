import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { sql, type SQL } from "drizzle-orm";
import {
  readOfficialIndex,
  officialContent,
  OFFICIAL_INDEX_REVISION,
  OFFICIAL_INDEX_SHA256,
  type OfficialOriginal,
} from "./officialOriginals";

interface Runner {
  execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }>;
}

// Caller must supply one transaction for the whole corpus. Lock order matches
// runtime document edits/reindexing; no PDF/resource/upload row is modified.
export async function activateOfficialOriginals(
  tx: Runner,
  documents: OfficialOriginal[],
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(726104, 20260910)`);
  let activated = 0;
  for (const doc of documents) {
    const marker = `[sourceKey=${doc.sourceKey}]`;
    const articles = (
      await tx.execute(
        sql`SELECT * FROM kb_articles WHERE source_key = ${doc.sourceKey} FOR UPDATE`,
      )
    ).rows;
    if (articles.length !== 1)
      throw new Error("EXACT_ORIGINAL_ARTICLE_REQUIRED");
    const article = articles[0]!;
    if (article.source_hash !== doc.originalSha256 || article.language !== "fr")
      throw new Error("RESTORED_ORIGINAL_ARTICLE_REQUIRED");
    const sourceUrl = `/kb/articles/${article.id}`;
    const linked = (
      await tx.execute(sql`SELECT * FROM ai_knowledge_documents
      WHERE source_url = ${sourceUrl} OR source_url = ${`kb:${article.id}`}
      OR tags @> ${JSON.stringify([marker])}::jsonb FOR UPDATE`)
    ).rows;
    if (linked.length > 1) throw new Error("AMBIGUOUS_ORIGINAL_KNOWLEDGE");
    const existing = linked[0];
    const text = officialContent(doc);
    if (article.source_revision === OFFICIAL_INDEX_REVISION) {
      if (
        article.content !== text.content ||
        !existing ||
        existing.content !== text.content ||
        existing.title !== article.title ||
        existing.language !== "fr" ||
        existing.source_url !== sourceUrl
      )
        throw new Error("ORIGINAL_INDEX_CHANGED_AFTER_IMPORT");
      // A retry must never undo a later publication/AI revocation.
      continue;
    }
    if (
      article.source_revision !== "2026-09-10" ||
      article.status !== "published"
    )
      throw new Error("ORIGINAL_ARTICLE_CHANGED_AFTER_RESTORATION");
    if (
      existing &&
      (existing.content !== article.content ||
        existing.title !== article.title ||
        existing.language !== "fr" ||
        existing.source_url !== sourceUrl ||
        !Array.isArray(existing.tags) ||
        !existing.tags.includes(marker))
    )
      throw new Error("ORIGINAL_KNOWLEDGE_IDENTITY_MISMATCH");
    const id = existing?.id ?? randomUUID();
    const tags = existing?.tags ?? [marker, "official-original"];
    await tx.execute(sql`UPDATE kb_articles SET content = ${text.content}, excerpt = ${"PDF original - texte extrait par page."},
      source_revision = ${OFFICIAL_INDEX_REVISION}, ai_eligible = true, updated_at = now() WHERE id = ${article.id}`);
    if (existing) {
      await tx.execute(sql`UPDATE ai_knowledge_documents SET content = ${text.content}, ai_active = true, status = 'indexed',
        last_indexed_at = now(), updated_at = now() WHERE id = ${id}`);
    } else {
      await tx.execute(sql`INSERT INTO ai_knowledge_documents (id, title, language, category, source_url, content, tags, ai_active, status, last_indexed_at)
        VALUES (${id}, ${article.title}, 'fr', 'support_article', ${sourceUrl}, ${text.content}, ${JSON.stringify(tags)}::jsonb, true, 'indexed', now())`);
      await tx.execute(
        sql`INSERT INTO ai_knowledge_tags (document_id, tag) VALUES (${id}, ${marker}), (${id}, 'official-original')`,
      );
    }
    await tx.execute(
      sql`DELETE FROM ai_knowledge_chunks WHERE document_id = ${id}`,
    );
    for (const [index, page] of text.pages.entries()) {
      const metadata = {
        language: "fr",
        sourceKey: doc.sourceKey,
        sourceRevision: OFFICIAL_INDEX_REVISION,
        sourceHash: doc.originalSha256,
        page: String(page.page),
        fileUrl: doc.fileUrl,
      };
      await tx.execute(sql`INSERT INTO ai_knowledge_chunks (document_id, content, chunk_index, metadata)
        VALUES (${id}, ${page.content}, ${index}, ${JSON.stringify(metadata)}::jsonb)`);
    }
    activated++;
  }
  return activated;
}

export function localIndexTarget(
  value: string | undefined,
  schema: string | undefined,
): URL {
  if (!value || !schema || !/^original_restore_test_[a-z0-9]+$/.test(schema))
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.port ||
    Number(url.port) < 1024 ||
    url.port === "5432" ||
    url.search ||
    url.hash
  )
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  return url;
}

async function privateJson(file: string, output = false) {
  const root = await realpath(path.join(homedir(), ".HaloHub"));
  const resolved = path.resolve(file);
  const parent = await realpath(path.dirname(resolved));
  if (parent !== root || !resolved.endsWith(".json"))
    throw new Error("PRIVATE_WORKSPACE_JSON_REQUIRED");
  if (!output && !(await lstat(resolved)).isFile())
    throw new Error("REGULAR_INDEX_REQUIRED");
  return resolved;
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      index: { type: "string" },
      report: { type: "string" },
      schema: { type: "string" },
    },
  });
  const mode = positionals[0] ?? "plan";
  if (
    positionals.length > 1 ||
    !["plan", "apply-local"].includes(mode) ||
    !values.index ||
    !values.report
  )
    throw new Error("INDEX_ARGUMENTS_REQUIRED");
  const input = await privateJson(values.index);
  const output = await privateJson(values.report, true);
  if (input === output) throw new Error("INDEX_IS_IMMUTABLE");
  const documents = readOfficialIndex(await readFile(input));
  let activated = 0;
  if (mode === "apply-local") {
    const url = localIndexTarget(
      process.env.ORIGINAL_TEST_DATABASE_URL,
      values.schema,
    );
    const { createDatabasePool } = await import("@workspace/db/poolConfig");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = createDatabasePool(url.href);
    try {
      activated = await drizzle(pool).transaction(
        async (tx) => {
          await tx.execute(
            sql`SET LOCAL search_path TO ${sql.identifier(values.schema!)}`,
          );
          await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
          return activateOfficialOriginals(tx, documents);
        },
        { isolationLevel: "serializable" },
      );
    } finally {
      await pool.end();
    }
  }
  const report = {
    mode,
    indexSha256: OFFICIAL_INDEX_SHA256,
    documents: documents.length,
    pages: documents.reduce((sum, doc) => sum + doc.pages.length, 0),
    activated,
    productionApplied: false,
    sources: documents.map((doc) => ({
      sourceKey: doc.sourceKey,
      originalSha256: doc.originalSha256,
      fileUrl: doc.fileUrl,
    })),
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      mode,
      documents: documents.length,
      activated,
      productionApplied: false,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error("OFFICIAL_ORIGINAL_INDEX_FAILED");
    process.exitCode = 1;
  });
}
