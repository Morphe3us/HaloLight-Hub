import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import { transformSync } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pg-proxy";
import { courses, courseModules, lessons } from "@workspace/db/schema";
import type { PublishedAcademyCatalog } from "./academyCatalog";

const require = createRequire(import.meta.url);

// Isolate module-level cache state and dependencies without loading a real DB or env.
function loadModule(path: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { code } = transformSync(source, { loader: "ts", format: "cjs" });
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", "Date", code)(
    (name: string) => dependencies[name] ?? require(name),
    module,
    module.exports,
    dependencies.process,
    dependencies.Date ?? Date,
  );
  return module.exports;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function catalog(id: string): PublishedAcademyCatalog {
  const createdAt = new Date("2026-01-01T00:00:00Z");
  return {
    courses: [
      {
        id,
        slug: id,
        title: { en: id },
        description: {},
        category: "business",
        level: "beginner",
        thumbnailUrl: "",
        order: 1,
        isPublished: true,
        totalDurationSeconds: 60,
        instructorName: null,
        isFeatured: false,
        estimatedDuration: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    modules: [
      {
        id: `${id}-module`,
        courseId: id,
        title: { en: "English" },
        order: 1,
        createdAt,
      },
    ],
    lessons: [
      {
        id: `${id}-lesson`,
        moduleId: `${id}-module`,
        title: { en: id },
        description: null,
        videoUrl: "",
        videoUrls: null,
        thumbnailUrl: null,
        videoAssets: null,
        durationSeconds: 60,
        order: 1,
        isPublished: true,
        notes: null,
        createdAt,
      },
    ],
  };
}

function setupCache(ttl?: string) {
  const queries: Array<{
    sql: string;
    params: unknown[];
    table: "courses" | "modules" | "lessons";
    result: ReturnType<typeof deferred<Record<string, unknown>[]>>;
  }> = [];
  const tables = { courses, modules: courseModules, lessons };
  let now = 1_000;
  const db = drizzle(async (sql, params) => {
    const table = sql.includes(' from "course_modules"')
      ? "modules"
      : sql.includes(' from "lessons"')
        ? "lessons"
        : "courses";
    const result = deferred<Record<string, unknown>[]>();
    queries.push({ sql, params, table, result });
    const rows = await result.promise;
    const keys = Object.keys(getTableColumns(tables[table]));
    return {
      rows: rows.map((row) =>
        keys.map((key) => {
          const value = row[key];
          return value instanceof Date
            ? value.toISOString().slice(0, -1)
            : value;
        }),
      ),
    };
  });
  const api = loadModule("./academyCatalog.ts", {
    "@workspace/db": { db, ...tables, courseModules },
    process: { env: { ACADEMY_CATALOG_CACHE_TTL_MS: ttl } },
    Date: { now: () => now },
  }) as typeof import("./academyCatalog");

  return {
    ...api,
    queries,
    advance: (ms: number) => {
      now += ms;
    },
    resolveLoad: (index: number, data: PublishedAcademyCatalog) => {
      const batch = queries.slice(index * 3, index * 3 + 3);
      assert.equal(batch.length, 3, "each catalog load executes three queries");
      for (const query of batch) query.result.resolve(data[query.table]);
    },
  };
}

test("catalog deduplicates concurrent loads and reuses the completed cache", async () => {
  const cache = setupCache();
  const waiting = Array.from({ length: 20 }, () =>
    cache.getPublishedAcademyCatalog(),
  );
  await setImmediate();
  assert.equal(cache.queries.length, 3);
  cache.resolveLoad(0, catalog("published"));
  const results = await Promise.all(waiting);
  assert.deepEqual(results[0], catalog("published"));
  assert.ok(results.every((result) => result === results[0]));
  assert.strictEqual(await cache.getPublishedAcademyCatalog(), results[0]);
  assert.equal(cache.queries.length, 3);
});

test("invalidation discards a stale load and moves its waiters to the current load", async () => {
  const cache = setupCache();
  const stale = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.clearAcademyCatalogCache();
  const current = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.resolveLoad(0, catalog("now-unpublished"));
  let staleSettled = false;
  void stale.then(() => {
    staleSettled = true;
  });
  await setImmediate();
  assert.equal(
    staleSettled,
    false,
    "invalidated content must not reach waiting requests",
  );
  const concurrent = cache.getPublishedAcademyCatalog();
  await setImmediate();
  assert.equal(
    cache.queries.length,
    6,
    "old cleanup must not erase the newer in-flight load",
  );
  cache.resolveLoad(1, catalog("current"));
  for (const result of await Promise.all([stale, current, concurrent])) {
    assert.deepEqual(result, catalog("current"));
  }
});

test("a stale load finishing last cannot overwrite a newer cached result", async () => {
  const cache = setupCache();
  const stale = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.clearAcademyCatalogCache();
  const current = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.resolveLoad(1, catalog("current"));
  const fresh = await current;
  cache.resolveLoad(0, catalog("now-unpublished"));
  assert.strictEqual(await stale, fresh);
  assert.strictEqual(await cache.getPublishedAcademyCatalog(), fresh);
  assert.equal(cache.queries.length, 6);
});

test("an invalidated load retries even when no new request starts a replacement", async () => {
  const cache = setupCache();
  const waiting = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.clearAcademyCatalogCache();
  cache.resolveLoad(0, catalog("old"));
  await setImmediate();
  assert.equal(cache.queries.length, 6);
  cache.resolveLoad(1, { courses: [], modules: [], lessons: [] });
  assert.deepEqual(await waiting, { courses: [], modules: [], lessons: [] });
});

test("repeated invalidations only return the latest catalog generation", async () => {
  const cache = setupCache();
  const waiting: Array<Promise<PublishedAcademyCatalog>> = [];
  for (let index = 0; index < 3; index++) {
    waiting.push(cache.getPublishedAcademyCatalog());
    await setImmediate();
    if (index < 2) cache.clearAcademyCatalogCache();
  }
  cache.resolveLoad(1, catalog("middle"));
  cache.resolveLoad(0, catalog("old"));
  await setImmediate();
  assert.equal(cache.queries.length, 9);
  cache.resolveLoad(2, catalog("latest"));
  for (const result of await Promise.all(waiting))
    assert.deepEqual(result, catalog("latest"));
});

test("each query failure rejects all waiters, is not cached, and permits a retry", async (t) => {
  for (const failedQuery of [0, 1, 2]) {
    await t.test(`query ${failedQuery}`, async () => {
      const cache = setupCache();
      const first = cache.getPublishedAcademyCatalog();
      const second = cache.getPublishedAcademyCatalog();
      const queryError = new Error("query failed");
      const failures = Promise.all([
        assert.rejects(first, { cause: queryError }),
        assert.rejects(second, { cause: queryError }),
      ]);
      await setImmediate();
      cache.queries[failedQuery]!.result.reject(queryError);
      await failures;
      const retry = cache.getPublishedAcademyCatalog();
      await setImmediate();
      cache.resolveLoad(1, catalog("recovered"));
      cache.resolveLoad(0, catalog("partial"));
      assert.deepEqual(await retry, catalog("recovered"));
      assert.deepEqual(
        await cache.getPublishedAcademyCatalog(),
        catalog("recovered"),
      );
      assert.equal(cache.queries.length, 6);
    });
  }
});

test("an invalidated query failure does not clear the newer in-flight request", async () => {
  const cache = setupCache();
  const stale = cache.getPublishedAcademyCatalog();
  const queryError = new Error("old query failed");
  const failure = assert.rejects(stale, { cause: queryError });
  await setImmediate();
  cache.clearAcademyCatalogCache();
  const current = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.queries[0]!.result.reject(queryError);
  await failure;
  cache.resolveLoad(0, catalog("old"));
  const concurrent = cache.getPublishedAcademyCatalog();
  await setImmediate();
  assert.equal(cache.queries.length, 6);
  cache.resolveLoad(1, catalog("current"));
  assert.deepEqual(await current, catalog("current"));
  assert.deepEqual(await concurrent, catalog("current"));
});

test("TTL starts on completion and expires at the boundary", async () => {
  const cache = setupCache("100");
  const pending = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.advance(1_000);
  cache.resolveLoad(0, catalog("first"));
  const first = await pending;
  cache.advance(99);
  assert.strictEqual(await cache.getPublishedAcademyCatalog(), first);
  cache.advance(1);
  const refresh = cache.getPublishedAcademyCatalog();
  await setImmediate();
  assert.equal(cache.queries.length, 6);
  cache.resolveLoad(1, catalog("refreshed"));
  assert.deepEqual(await refresh, catalog("refreshed"));
});

test("TTL zero disables completed caching but still deduplicates in-flight queries", async () => {
  const cache = setupCache("0");
  const first = cache.getPublishedAcademyCatalog();
  const sameLoad = cache.getPublishedAcademyCatalog();
  await setImmediate();
  assert.equal(cache.queries.length, 3);
  cache.resolveLoad(0, catalog("first"));
  await Promise.all([first, sameLoad]);
  const next = cache.getPublishedAcademyCatalog();
  await setImmediate();
  assert.equal(cache.queries.length, 6);
  cache.resolveLoad(1, catalog("next"));
  assert.deepEqual(await next, catalog("next"));
});

test("an expired cache is never served after a refresh query fails", async () => {
  const cache = setupCache("100");
  const pending = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.resolveLoad(0, catalog("expired"));
  await pending;
  cache.advance(100);
  const queryError = new Error("refresh failed");
  const failure = assert.rejects(cache.getPublishedAcademyCatalog(), {
    cause: queryError,
  });
  await setImmediate();
  cache.queries[3]!.result.reject(queryError);
  cache.resolveLoad(1, catalog("partial"));
  await failure;
  const retry = cache.getPublishedAcademyCatalog();
  await setImmediate();
  assert.equal(cache.queries.length, 9);
  cache.resolveLoad(2, catalog("recovered"));
  assert.deepEqual(await retry, catalog("recovered"));
});

test("invalidation evicts completed catalogs before TTL expiry", async () => {
  const cache = setupCache();
  const pending = cache.getPublishedAcademyCatalog();
  await setImmediate();
  cache.resolveLoad(0, catalog("now-unpublished"));
  await pending;
  cache.clearAcademyCatalogCache();
  const refresh = cache.getPublishedAcademyCatalog();
  await setImmediate();
  assert.equal(cache.queries.length, 6);
  cache.resolveLoad(1, { courses: [], modules: [], lessons: [] });
  assert.deepEqual(await refresh, { courses: [], modules: [], lessons: [] });
});

test("invalid TTL values use the default cache duration", async (t) => {
  for (const ttl of [undefined, "invalid", "-1", "Infinity", "", "   "]) {
    await t.test(String(ttl), async () => {
      const cache = setupCache(ttl);
      const pending = cache.getPublishedAcademyCatalog();
      await setImmediate();
      cache.resolveLoad(0, catalog("first"));
      const first = await pending;
      cache.advance(59_999);
      const hit = cache.getPublishedAcademyCatalog();
      await setImmediate();
      assert.equal(cache.queries.length, 3);
      assert.strictEqual(await hit, first);
    });
  }
});

test("catalog queries restrict modules and lessons to published courses", async () => {
  const cache = setupCache();
  const pending = cache.getPublishedAcademyCatalog();
  await setImmediate();
  const [courseQuery, moduleQuery, lessonQuery] = cache.queries;
  assert.match(courseQuery!.sql, /where "courses"\."is_published" = \$1/);
  assert.match(moduleQuery!.sql, /inner join "courses"/);
  assert.match(moduleQuery!.sql, /where "courses"\."is_published" = \$1/);
  assert.match(lessonQuery!.sql, /inner join "course_modules"/);
  assert.match(lessonQuery!.sql, /inner join "courses"/);
  assert.match(lessonQuery!.sql, /"lessons"\."is_published" = \$\d/);
  assert.match(lessonQuery!.sql, /"courses"\."is_published" = \$\d/);
  assert.deepEqual(lessonQuery!.params, [true, true]);
  cache.resolveLoad(0, catalog("published"));
  assert.deepEqual(await pending, catalog("published"));
});

test("catalog excludes descendants whose ancestors are missing from the loaded snapshot", async () => {
  const cache = setupCache();
  const pending = cache.getPublishedAcademyCatalog();
  await setImmediate();
  const published = catalog("published");
  const removed = catalog("removed");
  cache.resolveLoad(0, {
    courses: published.courses,
    modules: [...published.modules, ...removed.modules],
    lessons: [
      ...published.lessons,
      ...removed.lessons,
      {
        ...published.lessons[0]!,
        id: "orphan",
        moduleId: "missing-module",
      },
    ],
  });
  assert.deepEqual(await pending, published);
});

test("module updates invalidate the catalog before a follow-up query can fail", async () => {
  let handler!: (request: unknown, response: unknown) => Promise<void>;
  const events: string[] = [];
  const router = {
    get() {},
    post() {},
    delete() {},
    put(path: string, ...handlers: Array<typeof handler>) {
      if (path === "/admin/academy/modules/:id")
        handler = handlers[handlers.length - 1]!;
    },
  };
  const query = {
    set() {
      return query;
    },
    where() {
      return query;
    },
    returning: async () => [
      { id: "module", courseId: "course", title: { en: "English" }, order: 1 },
    ],
  };
  loadModule("../routes/academy-admin.ts", {
    express: { Router: () => router },
    "@workspace/db": {
      courses,
      courseModules,
      lessons,
      db: {
        update: () => query,
        select() {
          events.push("select");
          throw new Error("follow-up query failed");
        },
      },
    },
    "../middlewares/requireAuth": { requireAuth() {} },
    "../lib/userSync": { getOrCreateUser: async () => ({ role: "admin" }) },
    "../lib/academyCatalog": {
      clearAcademyCatalogCache: () => events.push("invalidate"),
    },
  });
  await assert.rejects(
    handler({ params: { id: "module" }, body: { order: 2 } }, {}),
    /follow-up query failed/,
  );
  assert.deepEqual(events, ["invalidate", "select"]);
});
