import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, symlink, lstat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { PgDialect } from "drizzle-orm/pg-core";
import { readOfficialIndex } from "../../artifacts/api-server/src/lib/ai/officialOriginals";
import { readRegular, sha256 } from "../content/private-files";
import { verifyOriginals } from "./files";
import type { Runner } from "./database";
import { deploymentTransaction, targetFingerprint, validateProductionTarget, privatePath, writeFreshJson, PRODUCTION_APP, PRODUCTION_STORAGE } from "./deploy";

test("production guard binds approved host/port/database/user without password or default environment fallback", () => {
  const url = "postgres://synthetic:inactive-fixture@db.invalid:5432/hub";
  const fingerprint = targetFingerprint(url);
  assert.equal(fingerprint, sha256("db.invalid:5432//hub/synthetic"));
  assert.equal(targetFingerprint(url.replace("inactive-fixture", "rotated-fixture")), fingerprint);
  assert.equal(targetFingerprint(`${url}?sslmode=require`), fingerprint);
  const env = { NODE_ENV: "production", DATABASE_URL: url, STORAGE_PROVIDER: "filesystem", PRIVATE_STORAGE_DIR: PRODUCTION_STORAGE };
  assert.equal(validateProductionTarget(env, fingerprint, PRODUCTION_APP).pathname, "/hub");
  for (const other of [url.replace("db.invalid", "other.invalid"), url.replace("5432", "5433"), url.replace("/hub", "/other"), url.replace("synthetic:", "other:")]) {
    assert.throws(() => validateProductionTarget({ ...env, DATABASE_URL: other }, fingerprint, PRODUCTION_APP));
  }
  for (const overrides of [{ DATABASE_URL: undefined }, { NODE_ENV: "development" }, { STORAGE_PROVIDER: "local" }, { PRIVATE_STORAGE_DIR: `${PRODUCTION_APP}/public` }]) {
    assert.throws(() => validateProductionTarget({ ...env, ...overrides }, fingerprint, PRODUCTION_APP));
  }
  assert.throws(() => validateProductionTarget(env, fingerprint, "/other-app"));
  for (const value of [`${url}?options=-csearch_path=other`, `${url}?host=other.invalid`, `${url}#fragment`, `${url}?sslmode=disable`]) assert.throws(() => targetFingerprint(value));
});

test("strict libpq compatibility options inherit approved runtime TLS semantics without changing target or URL", () => {
  const require = createRequire(new URL("../../lib/db/package.json", import.meta.url));
  const pgRequire = createRequire(require.resolve("pg"));
  const { parse } = pgRequire("pg-connection-string");
  const url = "postgres://synthetic:inactive-fixture@db.invalid:5432/hub";
  const fingerprint = targetFingerprint(url);
  const env = { NODE_ENV: "production", STORAGE_PROVIDER: "filesystem", PRIVATE_STORAGE_DIR: PRODUCTION_STORAGE };
  for (const options of ["sslmode=verify-full&uselibpqcompat=true", "uselibpqcompat=false&sslmode=verify-full", "sslmode=require&uselibpqcompat=false", "sslmode=verify-ca&uselibpqcompat=false"]) {
    const value = `${url}?${options}`;
    assert.equal(targetFingerprint(value), fingerprint);
    assert.equal(validateProductionTarget({ ...env, DATABASE_URL: value }, fingerprint, PRODUCTION_APP).href, value);
    const parsed = parse(value);
    assert.ok(parsed.ssl && parsed.ssl.rejectUnauthorized !== false);
    assert.equal(parsed.ssl.checkServerIdentity, undefined);
  }
  assert.equal(parse(`${url}?sslmode=require&uselibpqcompat=true`).ssl.rejectUnauthorized, false);
  for (const mode of ["require", "verify-ca", "verify-full"]) {
    const value = `${url}?sslmode=${mode}&uselibpqcompat=true`;
    assert.equal(targetFingerprint(value), fingerprint);
    assert.equal(validateProductionTarget({ ...env, DATABASE_URL: value }, fingerprint, PRODUCTION_APP).href, value);
  }
  // The wrapper leaves parser behavior intact: verify-ca without a CA fails
  // in the runtime parser; the allowlist does not add certificate-file access.
  assert.throws(() => parse(`${url}?sslmode=verify-ca&uselibpqcompat=true`));
  for (const options of [
    "uselibpqcompat=true", "uselibpqcompat=false", "sslmode=disable&uselibpqcompat=false",
    "sslmode=prefer&uselibpqcompat=true", "sslmode=allow&uselibpqcompat=true", "sslmode=no-verify&uselibpqcompat=false",
    "sslmode=verify-full&uselibpqcompat=TRUE", "sslmode=verify-full&uselibpqcompat=1",
    "sslmode=verify-full&uselibpqcompat=", "sslmode=verify-full&uselibpqcompat=false&uselibpqcompat=true",
    "sslmode=require&sslmode=verify-full", "sslmode=verify-full&host=other.invalid",
    "sslmode=verify-full&options=-csearch_path=other", "sslmode=verify-full&sslrootcert=/private/file",
  ]) assert.throws(() => targetFingerprint(`${url}?${options}`));
});

test("fresh private backup is exclusive, synced, hash-verifiable and rejects symlinks/aliases", async () => {
  const work = path.join(os.homedir(), ".HaloHub");
  const temp = await mkdtemp(path.join(work, "original-deploy-test-"));
  try {
    const file = await privatePath(path.join(temp, "backup.json"), work);
    const hash = await writeFreshJson(file, { rows: { uploads: [{ id: "synthetic" }] } });
    assert.equal(sha256(await readRegular(file)), hash);
    assert.equal((await lstat(file)).mode & 0o777, 0o600);
    await assert.rejects(writeFreshJson(file, {}));
    const alias = path.join(temp, "alias");
    await symlink(temp, alias);
    await assert.rejects(privatePath(path.join(alias, "backup.json"), work));
    await symlink(file, path.join(temp, "link.json"));
    await assert.rejects(writeFreshJson(path.join(temp, "link.json"), {}));
    await assert.rejects(privatePath("/tmp/forbidden.json", work));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("deployment plans old linked docs, backs up six tables before changes, activates once and rejects drift without network", async () => {
  const work = path.join(os.homedir(), ".HaloHub");
  const pairs = await verifyOriginals(path.join(work, "original-pdf-map.json"), path.join(work, "Halolight-hub"), path.join(work, "Halolight-hub-corrige"));
  const documents = readOfficialIndex(await readRegular(path.join(work, "original-text-index.json")));
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = { uploads: [], resources: [], kb_articles: [], ai_knowledge_documents: [], ai_knowledge_chunks: [], ai_knowledge_tags: [] };
  for (const p of pairs) {
    const description = `[sourceKey=${p.sourceKey}] revision=2026-09-10 sha256=${p.correctedHash}`;
    const content = `[PDF](${p.oldFileUrl})`;
    tables.uploads!.push({ id: `upload-${p.key}`, file_url: p.oldFileUrl, file_size: p.correctedBytes, mime_type: "application/pdf", description });
    tables.resources!.push({ id: `resource-${p.key}`, file_url: p.oldFileUrl, description });
    tables.kb_articles!.push({ id: `article-${p.key}`, title: p.key, language: "fr", source_key: p.sourceKey, source_hash: p.correctedHash, source_revision: "2026-09-10", content, status: "published", views: 42 });
    tables.ai_knowledge_documents!.push({ id: `doc-${p.key}`, title: p.key, language: "fr", source_url: `/kb/articles/article-${p.key}`, content, tags: [`[sourceKey=${p.sourceKey}]`], ai_active: false, status: "draft" });
    tables.ai_knowledge_chunks!.push({ id: `chunk-${p.key}`, document_id: `doc-${p.key}`, content, chunk_index: 0 });
    tables.ai_knowledge_tags!.push({ id: `tag-${p.key}`, document_id: `doc-${p.key}`, tag: `[sourceKey=${p.sourceKey}]` });
  }
  const statements: string[] = [];
  const events: string[] = [];
  const dialect = new PgDialect();
  // SQL-execution double only: actual restoration and Pauli activation run.
  // No pool/client import or socket exists anywhere in this fixture.
  const tx: Runner = { async execute(query) {
    const { sql: statement, params } = dialect.sqlToQuery(query);
    statements.push(statement);
    assert.ok(!/\b(users|courses|lessons|progress)\b/.test(statement));
    if (/^(SET|LOCK)|SELECT pg_advisory/.test(statement)) return { rows: [] };
    if (statement.startsWith("SELECT")) {
      const table = /FROM "?(\w+)"?/.exec(statement)![1]!;
      const rows = tables[table]!;
      if (table === "kb_articles") return { rows: rows.filter(r => r.source_key === params[0]).map(r => ({ ...r })) };
      if (table === "uploads" || table === "resources") return { rows: rows.filter(r => r.file_url === params[0] || r.file_url === params[1]).map(r => ({ ...r })) };
      if (table === "ai_knowledge_documents") return { rows: rows.filter(r => r.source_url === params[0] || r.source_url === params[1] || (r.tags as string[]).includes(JSON.parse(String(params[2]))[0])).map(r => ({ ...r })) };
      return { rows: rows.filter(r => r.document_id === params[0]).map(r => ({ ...r })) };
    }
    events.push("mutation");
    if (statement.startsWith("UPDATE")) {
      const table = /^UPDATE "?(\w+)"?/.exec(statement)![1]!;
      const row = tables[table]!.find(r => r.id === params.at(-1))!;
      assert.ok(row);
      const assignments = statement.split(" SET ")[1]!.split(" WHERE ")[0]!;
      for (const match of assignments.matchAll(/"?(\w+)"? = \$(\d+)/g)) row[match[1]!] = params[Number(match[2]) - 1];
      if (assignments.includes("ai_eligible = true")) row.ai_eligible = true;
      if (assignments.includes("ai_active = true")) row.ai_active = true;
      if (assignments.includes("status = 'indexed'")) row.status = "indexed";
      return { rows: [{ id: row.id }] };
    }
    if (statement.startsWith("DELETE FROM ai_knowledge_chunks")) {
      tables.ai_knowledge_chunks = tables.ai_knowledge_chunks!.filter(r => r.document_id !== params[0]);
      return { rows: [] };
    }
    assert.ok(statement.startsWith("INSERT INTO ai_knowledge_chunks"));
    tables.ai_knowledge_chunks!.push({ document_id: params[0], content: params[1], chunk_index: params[2], metadata: params[3] });
    return { rows: [] };
  } };
  const snapshot = JSON.stringify(tables);
  const plan = await deploymentTransaction(tx, pairs, documents, { apply: false, backup: async () => assert.fail(), publish: async () => assert.fail() });
  assert.deepEqual(plan, { planned: true, restored: 45, bridged: 15, activated: 15 });
  assert.equal(JSON.stringify(tables), snapshot);
  assert.ok(statements.every(s => !/FOR UPDATE|^LOCK|^UPDATE|^INSERT|^DELETE/.test(s)));
  for (const field of ["content", "source_url", "title", "language"] as const) {
    const row = tables.ai_knowledge_documents![0]!;
    const saved = row[field]; row[field] = "foreign-edited-value";
    await assert.rejects(deploymentTransaction(tx, pairs, documents, { apply: false, backup: async () => {}, publish: async () => {} }));
    row[field] = saved;
  }
  await assert.rejects(deploymentTransaction(tx, pairs, documents, { apply: true, backup: async () => { throw new Error("synthetic disk failure"); }, publish: async () => assert.fail() }));
  assert.equal(JSON.stringify(tables), snapshot);
  const result = await deploymentTransaction(tx, pairs, documents, {
    apply: true,
    backup: async plan => {
      events.push("backup");
      assert.equal(JSON.stringify(plan.before), snapshot);
      assert.equal(Object.keys(plan.before).length, 6);
    },
    publish: async () => { events.push("publish"); },
  });
  assert.deepEqual(result, { planned: false, restored: 45, bridged: 15, activated: 15 });
  assert.deepEqual(events.slice(0, 3), ["backup", "publish", "mutation"]);
  assert.equal(tables.ai_knowledge_chunks!.length, 323);
  for (const article of tables.kb_articles!) {
    assert.equal(article.views, 42);
    assert.equal(article.status, "published");
    const doc = tables.ai_knowledge_documents!.find(d => d.source_url === `/kb/articles/${article.id}`)!;
    assert.equal(doc.content, article.content);
    assert.equal(doc.ai_active, true);
    assert.equal(article.ai_eligible, true);
  }
  const repeated = await deploymentTransaction(tx, pairs, documents, { apply: true, backup: async () => {}, publish: async () => {} });
  assert.deepEqual(repeated, { planned: false, restored: 0, bridged: 0, activated: 0 });
});
