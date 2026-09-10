import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import test from "node:test";
import * as crypto from "node:crypto";
import express from "express";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { kbArticles, kbCategories } from "../../../../lib/db/src/schema/kb";
import * as kbQuery from "../lib/kbQuery";

test("KB HTTP routes preserve published/admin access, bound queries and reset AI approval without a database", async t => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const article = { id, categoryId: id, title: "Écran", content: "Texte", excerpt: null, tags: null,
    language: "fr", status: "published", aiEligible: true, sourceKey: "guide", sourceRevision: "2", sourceHash: "abc", views: 1, updatedAt: new Date("2026-09-10T00:00:00.000Z") };
  const reads: Array<{ columns?: Record<string, unknown>; where?: drizzle.SQL; limit?: number; offset?: number }> = [];
  const writes: Array<Record<string, unknown>> = [];
  let concurrentUpdate = false;
  let lastUpdateWhere: drizzle.SQL | undefined;
  const db = {
    select(columns?: Record<string, unknown>) {
      const record: typeof reads[number] = { columns };
      reads.push(record);
      const chain = {
        from: () => chain,
        where: (where?: drizzle.SQL) => { record.where = where; return chain; },
        orderBy: () => chain,
        limit: (limit: number) => { record.limit = limit; return chain; },
        offset: (offset: number) => { record.offset = offset; return chain; },
        then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(columns?.count ? [{ count: 63 }] : [article]).then(resolve),
      };
      return chain;
    },
    update: () => ({ set: (values: Record<string, unknown>) => {
      writes.push(values);
      return { where: (where: drizzle.SQL) => {
        lastUpdateWhere = where;
        return { returning: async () => concurrentUpdate ? [] : [{ ...article, ...values, views: 2 }] };
      } };
    } }),
    insert: () => ({ values: (values: Record<string, unknown>) => {
      writes.push(values); return { returning: async () => [{ id, ...values }] };
    } }),
    delete: () => ({ where: async () => {} }),
  };
  const dependencies: Record<string, unknown> = {
    express, "node:crypto": crypto, "drizzle-orm": drizzle, "@workspace/db": { db, kbArticles, kbCategories }, "../lib/kbQuery": kbQuery,
    "../middlewares/requireAuth": { requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.headers["x-role"]) { res.status(401).json({ error: "Unauthorized" }); return; }
      next();
    } },
    "../lib/userSync": { getOrCreateUser: async (req: express.Request) => ({ id: "user", role: req.headers["x-role"] }) },
  };
  const module = { exports: {} as { default: express.Router } };
  const code = transformSync(readFileSync(new URL("./kb.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  const app = express();
  app.use(express.json()); app.use(module.exports.default);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  }));
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, role = "client", method = "GET", body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { ...(role ? { "x-role": role } : {}), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(method === "PUT" ? { expectedUpdatedAt: article.updatedAt.toISOString(), ...body as object } : body) }),
  });
  const compiled = (index: number) => new PgDialect().sqlToQuery(reads[index]!.where ?? drizzle.sql``);

  assert.equal((await request("/kb/articles", "")).status, 401);
  assert.equal(reads.length, 0);
  for (const query of ["limit=-1", "limit=101", "offset=NaN", "categoryId=bad", "language=fr&language=en", "status=bad"]) {
    assert.equal((await request(`/kb/articles?${query}`)).status, 400, query);
    assert.equal(reads.length, 0);
  }
  for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await request("/kb/articles/bad", "admin", method, method === "PUT" ? {} : undefined)).status, 400);
  assert.equal(reads.length, 0);

  assert.equal((await request("/kb/articles?status=draft&language=fr&search=%C3%A9cran&limit=20&offset=40")).status, 200);
  assert.equal(reads[0]?.limit, 20); assert.equal(reads[0]?.offset, 40);
  assert.equal(Object.hasOwn(reads[0]?.columns ?? {}, "content"), false);
  assert.ok(compiled(0).params.includes("published"));
  assert.ok(!compiled(0).params.includes("draft"));
  assert.ok(compiled(0).params.includes("fr"));
  assert.ok(compiled(0).params.includes("%ecran%"));
  assert.match(compiled(0).sql, /"tags"/);
  assert.deepEqual(compiled(0), compiled(1), "count and list share all filters");
  reads.length = 0;
  await request("/kb/articles", "admin");
  assert.ok(Object.hasOwn(reads[0]?.columns ?? {}, "content"), "admin editor keeps full content");
  assert.equal(compiled(0).sql, "", "omitted language/status stay unfiltered for admin");
  reads.length = 0;
  await request("/kb/categories?language=fr");
  assert.ok(compiled(0).params.includes("fr"));
  assert.ok(reads[0]?.columns?.language);
  assert.equal(reads[0]?.limit, 200);
  reads.length = 0;
  await request("/kb/categories");
  assert.equal(compiled(0).sql, "");

  for (const role of ["client", "partner", "distributor"]) {
    reads.length = 0;
    assert.equal((await request(`/kb/articles/${id}`, role)).status, 200);
    assert.ok(compiled(0).params.includes("published"), role);
    assert.equal((await request(`/kb/articles/${id}`, role, "PUT", { aiEligible: true })).status, 403);
  }
  writes.length = 0;
  const edited = await request(`/kb/articles/${id}`, "admin", "PUT", { content: "Revised", aiEligible: true });
  assert.equal(edited.status, 200);
  const updated = await edited.json() as typeof article;
  assert.equal(updated.aiEligible, false);
  assert.match(updated.sourceRevision, /^local-/);
  assert.equal(updated.sourceHash, crypto.createHash("sha256").update("Revised").digest("hex"));
  assert.match(new PgDialect().sqlToQuery(lastUpdateWhere!).sql, /date_trunc\('milliseconds', "kb_articles"\."updated_at"\)/);
  assert.ok(!Object.hasOwn(writes[0]!, "sourceKey"), "editing does not overwrite import provenance");
  const approved = await request(`/kb/articles/${id}`, "admin", "PUT", { aiEligible: true });
  assert.equal((await approved.json() as typeof article).aiEligible, true);
  for (const change of [{ language: "en" }, { title: "New" }, { tags: ["new"] }, { excerpt: "new" }]) {
    const result = await request(`/kb/articles/${id}`, "admin", "PUT", { ...change, aiEligible: true });
    assert.equal((await result.json() as typeof article).aiEligible, false);
  }
  assert.equal((await request(`/kb/articles/${id}`, "admin", "PUT", { aiEligible: "true" })).status, 400);
  assert.equal((await request(`/kb/articles/${id}`, "admin", "PUT", { expectedUpdatedAt: null })).status, 400);
  assert.equal((await request(`/kb/articles/${id}`, "admin", "PUT", { expectedUpdatedAt: "2020-01-01T00:00:00Z", aiEligible: true })).status, 409);
  concurrentUpdate = true;
  assert.equal((await request(`/kb/articles/${id}`, "admin", "PUT", { aiEligible: true })).status, 409, "atomic write conflict cannot restore stale approval");
  concurrentUpdate = false;
  const created = await request("/kb/articles", "admin", "POST", { title: "New", content: "Text", categoryId: id });
  const createdBody = await created.json() as typeof article;
  assert.equal(created.status, 201);
  assert.equal(createdBody.aiEligible, false);
  assert.equal(createdBody.language, "en");
});
