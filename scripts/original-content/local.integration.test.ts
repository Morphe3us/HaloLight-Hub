import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { activateOfficialOriginals } from "../../artifacts/api-server/src/lib/ai/originalIndex";
import { readOfficialIndex } from "../../artifacts/api-server/src/lib/ai/officialOriginals";
import { localRetrieval } from "./rag-probe";
import { createDatabasePool } from "@workspace/db/poolConfig";
import { verifyOriginals, publishOriginals } from "./files";
import { planRestoration, applyRestoration, validateLocalTarget, type Runner } from "./database";

test("disposable PostgreSQL restores 15 PDF metadata triples, preserves activity and rolls back collisions", {
  skip: !process.env.ORIGINAL_TEST_DATABASE_URL,
}, async (t) => {
  const schema = `original_restore_test_${randomUUID().replaceAll("-", "")}`;
  const url = validateLocalTarget(process.env.ORIGINAL_TEST_DATABASE_URL, schema);
  const pool = createDatabasePool(url.href);
  const client = await pool.connect();
  const work = path.join(os.homedir(), ".HaloHub");
  const temp = await mkdtemp(path.join(work, "original-db-test-"));
  const original = path.join(work, "Halolight-hub");
  const corrected = path.join(work, "Halolight-hub-corrige");
  const pairs = await verifyOriginals(path.join(work, "original-pdf-map.json"), original, corrected);
  const dialect = new PgDialect();
  const documents = readOfficialIndex(await readFile(path.join(work, "original-text-index.json")));
  const runner: Runner = { async execute(query) {
    const { sql, params } = dialect.sqlToQuery(query);
    assert.ok(!/courses|lessons|progress|users|ai_knowledge/.test(sql));
    return client.query(sql, params);
  } };
  const activationRunner: Runner = { async execute(query) {
    const { sql, params } = dialect.sqlToQuery(query);
    assert.ok(!/courses|lessons|progress|users/.test(sql));
    return client.query(sql, params);
  } };
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    for (const table of ["uploads", "resources", "kb_articles", "ai_knowledge_documents", "ai_knowledge_chunks", "ai_knowledge_tags", "courses"]) {
      await client.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await client.query(`SET search_path TO "${schema}"`);
    for (const [index, p] of pairs.entries()) {
      const description = `[sourceKey=${p.sourceKey}] revision=2026-09-10 sha256=${p.correctedHash}`;
      await client.query("INSERT INTO uploads (title, language, category, file_url, file_name, mime_type, file_size, visibility, status, description) VALUES ($1,'fr','resources',$2,'original.pdf','application/pdf',$3,'client_visible','ready',$4)", [p.key, p.oldFileUrl, p.correctedBytes, description]);
      await client.query("INSERT INTO resources (title, language, category, file_url, description, status) VALUES ($1,'fr','guide',$2,$3,$4)", [p.key, p.oldFileUrl, description, index % 2 ? "published" : "draft"]);
      await client.query("INSERT INTO kb_articles (category_id,author_id,title,language,slug,source_key,source_hash,source_revision,content,status,views,ai_eligible) VALUES (gen_random_uuid(),'synthetic-author',$1,'fr',$1,$2,$3,'2026-09-10',$4,$5,42,false)", [p.key, p.sourceKey, p.correctedHash, `[PDF](${p.oldFileUrl})`, index % 2 ? "published" : "archived"]);
    }
    const before = (await client.query("SELECT id, status, views, author_id, ai_eligible FROM kb_articles ORDER BY id")).rows;
    // Rehearse the entire restoration + activation transaction, then prove
    // rollback restores both metadata and indexing, including publication.
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("UPDATE kb_articles SET status='published'");
    assert.equal(await applyRestoration(runner, await planRestoration(runner, pairs)), 45);
    assert.equal(await activateOfficialOriginals(activationRunner, documents), 15);
    await client.query("ROLLBACK");
    assert.deepEqual((await client.query("SELECT id, status, views, author_id, ai_eligible FROM kb_articles ORDER BY id")).rows, before);
    assert.equal(Number((await client.query("SELECT count(*) FROM ai_knowledge_documents")).rows[0].count), 0);
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const changes = await planRestoration(runner, pairs);
    await publishOriginals(pairs, temp, original, corrected);
    assert.equal(await applyRestoration(runner, changes), 45);
    await client.query("COMMIT");
    assert.deepEqual((await client.query("SELECT id, status, views, author_id, ai_eligible FROM kb_articles ORDER BY id")).rows, before);
    const first = (await client.query("SELECT id, updated_at FROM kb_articles ORDER BY id")).rows;
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    assert.equal(await applyRestoration(runner, await planRestoration(runner, pairs)), 0);
    await client.query("COMMIT");
    assert.deepEqual((await client.query("SELECT id, updated_at FROM kb_articles ORDER BY id")).rows, first);
    await client.query("BEGIN");
    await client.query("UPDATE uploads SET description='foreign' WHERE title=$1", [pairs[0]!.key]);
    await assert.rejects(planRestoration(runner, pairs));
    await client.query("ROLLBACK");
    assert.equal((await planRestoration(runner, pairs)).filter(change => Object.keys(change.updates).length).length, 0);
    // Publication is explicit fixture setup, never a side effect of restoration.
    await client.query("UPDATE kb_articles SET status='published'");
    await client.query("UPDATE resources SET status='published'");
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    assert.equal(await applyRestoration(runner, await planRestoration(runner, pairs)), 0);
    assert.equal(await activateOfficialOriginals(activationRunner, documents), 15);
    await client.query("COMMIT");
    assert.equal(Number((await client.query("SELECT count(*) FROM ai_knowledge_documents d JOIN kb_articles k ON d.source_url='/kb/articles/'||k.id::text WHERE d.content=k.content AND d.title=k.title AND d.language=k.language AND k.ai_eligible AND d.ai_active AND d.status='indexed'")).rows[0].count), 15);
    assert.equal(Number((await client.query("SELECT count(*) FROM ai_knowledge_chunks")).rows[0].count), documents.reduce((n, doc) => n + doc.pages.filter(p => p.text.trim()).length, 0));
    const indexed = (await client.query("SELECT id,updated_at FROM ai_knowledge_documents ORDER BY id")).rows;
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    assert.equal(await applyRestoration(runner, await planRestoration(runner, pairs)), 0);
    assert.equal(await activateOfficialOriginals(activationRunner, documents), 0);
    await client.query("COMMIT");
    assert.deepEqual((await client.query("SELECT id,updated_at FROM ai_knowledge_documents ORDER BY id")).rows, indexed);
    const retrieve = localRetrieval(drizzle(client));
    const articleIds = new Set((await client.query("SELECT id FROM kb_articles")).rows.map(r => r.id));
    for (const query of ["printer", "montage", "LumaBooth", "camera", "consumables", "troubleshooting", "consommables", "depannage"]) {
      const englishQuery = ["printer", "camera", "consumables", "troubleshooting"].includes(query);
      const result = await retrieve(query, englishQuery ? "en" : "fr");
      t.diagnostic(JSON.stringify({ query, kb: result.sources.filter(s => s.type === "kb").length, knowledge: result.sources.filter(s => s.type === "knowledge").length }));
      assert.ok(result.sources.some(s => s.type === "knowledge"), `Missing knowledge citation for ${query}`);
      assert.ok(result.sources.some(s => s.type === "kb"), `Missing KB citation for ${query}`);
      if (["consumables", "troubleshooting"].includes(query)) {
        // Positive results must come from domain synonym expansion: the
        // literal English words are absent from these official French PDFs.
        assert.equal(Number((await client.query("SELECT count(*) FROM kb_articles WHERE lower(content) LIKE $1", [`%${query}%`])).rows[0].count), 0);
      }
      for (const source of result.sources) {
        assert.equal(source.meta?.language, "fr");
        assert.ok(source.url?.startsWith("/kb/articles/"));
        assert.ok(articleIds.has(source.url!.slice("/kb/articles/".length)));
      }
    }
    await client.query("UPDATE kb_articles SET status='archived'");
    assert.equal((await retrieve("lumabooth", "fr")).sources.length, 0);
    await client.query("BEGIN");
    assert.equal(await activateOfficialOriginals(activationRunner, documents), 0);
    await client.query("COMMIT");
    assert.equal((await retrieve("lumabooth", "fr")).sources.length, 0);
    await verifyOriginals(path.join(work, "original-pdf-map.json"), original, corrected);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    assert.fail(`Original restoration integration failed (${code}); private SQL/content intentionally omitted`);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
    await rm(temp, { recursive: true, force: true });
  }
});
