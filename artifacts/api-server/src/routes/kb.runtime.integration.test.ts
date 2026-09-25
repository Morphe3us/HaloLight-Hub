// Opt-in only: IMPORT_TEST_DATABASE_URL=postgresql://...@127.0.0.1:55439/... node --import tsx --test src/routes/kb.runtime.integration.test.ts
// Uses real SQL/schema/storage. Creates and removes only UUID-scoped fixtures, never imported records.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as streams from "node:stream/promises";
import test from "node:test";
import express from "express";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";

function assertLocalTestDatabase(value: string) {
  const url = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol), "PostgreSQL URL required");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Only loopback PostgreSQL is allowed");
  assert.equal(url.port, "55439", "Only explicit local test port 55439 is allowed");
  assert.ok(url.pathname.length > 1, "Database name required");
  assert.equal(url.search, "", "Query parameters could override the guarded host; forbidden");
  assert.equal(url.hash, "", "URL fragments forbidden");
}

test("KB integration safety guard rejects remote/default-port/host override URLs", () => {
  for (const url of ["postgresql://prod.example:55439/db", "postgresql://127.0.0.1:5432/db",
    "postgresql://127.0.0.1/db", "postgresql://127.0.0.1:55439/db?host=remote", "https://localhost:55439/db"])
    assert.throws(() => assertLocalTestDatabase(url));
  assertLocalTestDatabase("postgresql://localhost:55439/isolated_test");
});

test("real local PostgreSQL KB routes and private PDF publication", {
  skip: !process.env.IMPORT_TEST_DATABASE_URL && "Set IMPORT_TEST_DATABASE_URL to explicitly authorize isolated local fixtures",
  timeout: 120_000,
}, async t => {
  const connectionString = process.env.IMPORT_TEST_DATABASE_URL!;
  assertLocalTestDatabase(connectionString);
  const envNames = ["DATABASE_URL", "NODE_ENV", "STORAGE_PROVIDER", "PRIVATE_STORAGE_DIR"] as const;
  const previousEnv = envNames.map(name => process.env[name]);
  const privateRoot = await mkdtemp(join(tmpdir(), "kb-runtime-private-"));
  process.env.DATABASE_URL = connectionString;
  process.env.NODE_ENV = "test";
  process.env.STORAGE_PROVIDER = "filesystem";
  process.env.PRIVATE_STORAGE_DIR = privateRoot;
  t.after(async () => {
    await rm(privateRoot, { recursive: true, force: true });
    envNames.forEach((name, index) => {
      if (previousEnv[index] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[index];
    });
  });

  // No database module is loaded until after the explicit host/port guard.
  const database = await import("@workspace/db");
  const { db, pool, kbArticles, kbCategories, uploads, resources, usersTable } = database;
  const storage = await import("../lib/storage");
  storage.resetStorageProvider();
  const run = crypto.randomUUID();
  const userId = `kb-runtime-${run}`;
  const frCategory = crypto.randomUUID();
  const enCategory = crypto.randomUUID();
  const sourceKey = `halolight:corrected-content:fr:runtime-${run}`;
  const protectedTables = ["kb_categories", "kb_articles", "uploads", "resources", "ai_knowledge_documents", "ai_knowledge_chunks"] as const;
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of protectedTables) result[table] = (await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY id`)).rows;
    return result;
  };
  let baseline: Record<string, unknown> | undefined;
  let fixtureFileUrl: string | undefined;
  let server: ReturnType<typeof express.application.listen> | undefined;
  t.after(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => {
        server!.close(error => error ? reject(error) : resolve()); server!.closeAllConnections();
      });
      // Ownership is the unique test user/category UUIDs, never broad source-key prefixes.
      await db.delete(uploads).where(orm.eq(uploads.uploadedBy, userId));
      await db.delete(resources).where(orm.eq(resources.authorId, userId));
      await db.delete(kbArticles).where(orm.eq(kbArticles.authorId, userId));
      await db.delete(kbCategories).where(orm.inArray(kbCategories.id, [frCategory, enCategory]));
      await db.delete(usersTable).where(orm.eq(usersTable.id, userId));
      if (baseline) assert.deepEqual(await snapshot(), baseline, "All preexisting/imported rows, including synthetic article views, must remain unchanged");
    } finally { storage.resetStorageProvider(); await pool.end(); }
  });
  await pool.query("SELECT 1");
  baseline = await snapshot();
  await db.insert(usersTable).values({ id: userId, authId: userId, email: `${userId}@example.invalid`, role: "admin" });
  await db.insert(kbCategories).values([
    { id: frCategory, name: `Runtime FR ${run}`, slug: `runtime-fr-${run}`, language: "fr", order: -100000 },
    { id: enCategory, name: `Runtime EN ${run}`, slug: `runtime-en-${run}`, language: "en", order: -100000 },
  ]);
  const articleIds = Array.from({ length: 49 }, () => crypto.randomUUID());
  await db.insert(kbArticles).values(articleIds.map((id, index) => ({
    id, categoryId: frCategory, authorId: userId, slug: `runtime-${run}-${index}`,
    title: index === 0 ? "Écran" : `Runtime article ${index}`, content: index === 1 ? "Température contrôlée" : "Fixture content",
    tags: index === 2 ? ["sécurité"] : [], language: index === 48 ? "en" : "fr",
    status: index === 47 ? "draft" as const : "published" as const,
    order: index, views: 0, sourceKey: index === 0 ? sourceKey : null,
    sourceRevision: index === 0 ? "fixture-original" : null, sourceHash: index === 0 ? "fixture-hash" : null,
  })));

  const dependencies: Record<string, unknown> = {
    express, "node:crypto": crypto, "node:stream/promises": streams, "drizzle-orm": orm, "@workspace/db": database,
    "../lib/kbQuery": await import("../lib/kbQuery"), "../lib/storage": storage,
    "../lib/storage/local-provider": await import("../lib/storage/local-provider"),
    "../lib/fileAccess": await import("../lib/fileAccess"), "../lib/uploadSecurity": await import("../lib/uploadSecurity"),
    "../middlewares/requireAuth": { requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.headers["x-test-role"]) { res.status(401).json({ error: "Unauthorized" }); return; }
      next();
    } },
    "../lib/userSync": { getOrCreateUser: async (req: express.Request) => ({ id: userId, role: req.headers["x-test-role"] }) },
  };
  const route = (file: string) => {
    const module = { exports: {} as { default: express.Router } };
    const code = transformSync(readFileSync(new URL(file, import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
    new Function("require", "module", "exports", code)((name: string) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    }, module, module.exports);
    return module.exports.default;
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", route("./kb.ts"), route("./uploads.ts"));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, role = "client", method = "GET", body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { ...(role ? { "x-test-role": role } : {}), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  type ArticleResponse = { id: string; language: string; content?: string; status: string; updatedAt: string; aiEligible: boolean; sourceRevision: string; sourceHash: string; sourceKey: string };
  const list = async (query: string, role = "client") => {
    const response = await request(`/api/kb/articles?categoryId=${frCategory}&${query}`, role);
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as { items: ArticleResponse[]; total: number };
  };

  await t.test("actual SQL language filtering, accent search, category counts and 47-row pagination", async () => {
    const seen = new Set<string>();
    for (const offset of [0, 20, 40]) {
      const result = await list(`language=fr&limit=20&offset=${offset}`);
      assert.equal(result.total, 47);
      assert.equal(result.items.length, offset === 40 ? 7 : 20);
      for (const article of result.items) { assert.equal(article.language, "fr"); assert.ok(!("content" in article)); assert.ok(!seen.has(article.id)); seen.add(article.id); }
    }
    assert.equal(seen.size, 47);
    assert.equal((await list("language=en")).total, 1);
    assert.equal((await list("")).total, 48);
    assert.equal((await list("status=draft", "admin")).total, 1);
    assert.equal((await list("status=draft")).total, 48, "member status cannot expose drafts");
    for (const search of ["ecran", "ÉCRAN", "temperature", "securite"]) assert.equal((await list(`language=fr&search=${encodeURIComponent(search)}`)).total, 1, search);
    for (const [query, count] of [["?language=fr", 47], ["", 48]] as const) {
      const response = await request(`/api/kb/categories${query}`);
      assert.equal(response.status, 200);
      const body = await response.json() as { items: Array<{ id: string; articleCount: number }> };
      assert.equal(body.items.find(category => category.id === frCategory)?.articleCount, count);
    }
    const englishCategories = await (await request("/api/kb/categories?language=en")).json() as { items: Array<{ id: string }> };
    assert.ok(!englishCategories.items.some(category => category.id === frCategory));
    assert.ok(englishCategories.items.some(category => category.id === enCategory));
    assert.equal((await request(`/api/kb/articles/${articleIds[47]}`)).status, 404);
    assert.equal((await request("/api/kb/articles?limit=-1")).status, 400);
    assert.equal((await request("/api/kb/articles/not-a-uuid")).status, 400);
  });

  await t.test("concurrent view increments are atomic and do not change updatedAt", async () => {
    const id = articleIds[0]!;
    const [before] = await db.select().from(kbArticles).where(orm.eq(kbArticles.id, id));
    const responses = await Promise.all(Array.from({ length: 8 }, () => request(`/api/kb/articles/${id}`)));
    assert.ok(responses.every(response => response.status === 200));
    await Promise.all(responses.map(response => response.arrayBuffer()));
    const [after] = await db.select().from(kbArticles).where(orm.eq(kbArticles.id, id));
    assert.equal(after!.views, before!.views + 8);
    assert.equal(after!.updatedAt.getTime(), before!.updatedAt.getTime());
  });

  await t.test("real optimistic race returns one 409; reviewed approval and local provenance stay version-bound", async () => {
    const id = articleIds[0]!;
    const [before] = await db.select().from(kbArticles).where(orm.eq(kbArticles.id, id));
    const expectedUpdatedAt = before!.updatedAt.toISOString();
    const races = await Promise.all(["First edit", "Second edit"].map(content => request(`/api/kb/articles/${id}`, "admin", "PUT", { content, aiEligible: true, expectedUpdatedAt })));
    assert.deepEqual(races.map(response => response.status).sort(), [200, 409]);
    const edited = await races.find(response => response.status === 200)!.json() as ArticleResponse;
    assert.equal(edited.aiEligible, false);
    assert.equal(edited.sourceKey, sourceKey);
    assert.match(edited.sourceRevision, /^local-/);
    assert.equal(edited.sourceHash, crypto.createHash("sha256").update(edited.content!).digest("hex"));
    assert.equal((await request(`/api/kb/articles/${id}`, "admin", "PUT", { aiEligible: true, expectedUpdatedAt })).status, 409);
    const approved = await request(`/api/kb/articles/${id}`, "admin", "PUT", { aiEligible: true, expectedUpdatedAt: edited.updatedAt });
    assert.equal(approved.status, 200, await approved.clone().text());
    const approval = await approved.json() as ArticleResponse;
    assert.equal(approval.aiEligible, true);
    const archived = await request(`/api/kb/articles/${id}`, "admin", "PUT", { status: "archived", expectedUpdatedAt: approval.updatedAt });
    assert.equal(archived.status, 200);
    assert.equal((await request(`/api/kb/articles/${id}`, "admin", "PUT", { status: "published", content: "stale", expectedUpdatedAt: approval.updatedAt })).status, 409);
    const [current] = await db.select().from(kbArticles).where(orm.eq(kbArticles.id, id));
    assert.equal(current!.status, "archived");
    assert.equal(current!.content, edited.content);
  });

  await t.test("actual private provider and linked article/resource publication gate", async () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
    const uploaded = await request("/api/admin/uploads/file", "admin", "POST", {
      fileName: "runtime.pdf", mimeType: "application/pdf", dataBase64: bytes.toString("base64"), folder: `corrected-2026-09-10/runtime-${run}`,
    });
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    const file = await uploaded.json() as { url: string; provider: string };
    fixtureFileUrl = file.url;
    assert.equal(file.provider, "filesystem");
    const description = `[sourceKey=${sourceKey}] isolated runtime fixture`;
    const metadata = await request("/api/admin/uploads", "admin", "POST", {
      title: `Runtime ${run}`, category: "knowledge_base", fileUrl: file.url, fileName: "runtime.pdf", mimeType: "application/pdf",
      language: "fr", visibility: "client_visible", description,
    });
    assert.equal(metadata.status, 201, await metadata.clone().text());
    const [resource] = await db.insert(resources).values({ title: `Runtime ${run}`, category: "pdf", language: "fr", fileUrl: file.url, description, status: "published", authorId: userId }).returning();
    await db.update(kbArticles).set({ status: "archived" }).where(orm.eq(kbArticles.id, articleIds[0]!));
    assert.equal((await request(file.url, "")).status, 401);
    assert.equal((await request(file.url)).status, 403, "archived linked article revokes copied PDF URL");
    await db.update(kbArticles).set({ status: "published" }).where(orm.eq(kbArticles.id, articleIds[0]!));
    const readable = await request(file.url);
    assert.equal(readable.status, 200);
    assert.equal(readable.headers.get("cache-control"), "private, no-store");
    assert.equal(readable.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await readable.arrayBuffer()), bytes);
    await db.update(resources).set({ status: "draft" }).where(orm.eq(resources.id, resource!.id));
    assert.equal((await request(file.url)).status, 403, "resource revocation blocks copied PDF URL");
    const admin = await request(file.url, "admin");
    assert.equal(admin.status, 200); await admin.arrayBuffer();
    await db.update(resources).set({ status: "published" }).where(orm.eq(resources.id, resource!.id));
    await db.update(kbArticles).set({ status: "draft" }).where(orm.eq(kbArticles.id, articleIds[0]!));
    assert.equal((await request(file.url)).status, 403);
  });

  await t.test("all 15 imported PDFs are readable for logged-in users and denied anonymously without metadata writes", {
    skip: !process.env.IMPORT_TEST_PRIVATE_STORAGE_DIR && "Set IMPORT_TEST_PRIVATE_STORAGE_DIR to explicitly enable read-only imported PDF checks",
  }, async () => {
    const files = (await db.select().from(uploads).where(
      orm.like(uploads.fileUrl, "/api/files/corrected-2026-09-10/%"),
    )).filter(file => file.fileUrl !== fixtureFileUrl);
    assert.equal(files.length, 15, "Expected 15 imported PDF upload records, excluding this run's fixture");
    process.env.PRIVATE_STORAGE_DIR = process.env.IMPORT_TEST_PRIVATE_STORAGE_DIR!;
    storage.resetStorageProvider();
    try {
      for (const file of files) {
        assert.equal((await request(file.fileUrl, "")).status, 401, file.title);
        const response = await request(file.fileUrl);
        assert.equal(response.status, 200, file.title);
        assert.match(response.headers.get("content-type") ?? "", /application\/pdf/);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.subarray(0, 5).toString(), "%PDF-", file.title);
        if (file.fileSize !== null) assert.equal(bytes.length, file.fileSize, file.title);
      }
    } finally { process.env.PRIVATE_STORAGE_DIR = privateRoot; storage.resetStorageProvider(); }
    const metadataAfter = await db.select().from(uploads).where(orm.inArray(uploads.id, files.map(file => file.id))).orderBy(uploads.id);
    assert.equal(JSON.stringify(metadataAfter), JSON.stringify([...files].sort((a, b) => a.id.localeCompare(b.id))));
  });
});
