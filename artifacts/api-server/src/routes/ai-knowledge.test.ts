import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as policy from "../lib/ai/documentUpdatePolicy";

const marker = "[sourceKey=halolight:corrected-content:fr:definition-calque]";
const linkedUrl = "/kb/articles/12345678-1234-8234-9234-123456789abc";
const initial = () => ({
  id: "document-id",
  title: "Calque",
  content: "Approved definition",
  language: "fr",
  category: "support_article",
  productModel: null as string | null,
  sourceUrl: linkedUrl as string | null,
  tags: ["demarrer", marker],
  aiActive: true,
  status: "indexed",
  lastIndexedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Run the actual PUT handler with a strict in-memory transaction double. No
// database/auth modules, sockets, environment secrets or external services.
function fixture(seed = initial()) {
  let document: ReturnType<typeof initial> | undefined = structuredClone(seed);
  let storedTags = [...seed.tags];
  let locked = false;
  let transactions = 0;
  let writes = 0;
  let failTags = false;
  let storedChunks: Array<{ content: string }> = [{ content: "old chunk" }];
  let failChunks = false;
  type Request = {
    params: { id: string };
    body: Record<string, unknown>;
    role: string;
  };
  type Response = {
    status: (status: number) => Response;
    json: (body: unknown) => void;
  };
  let handler: (req: Request, res: Response) => Promise<void>;
  let reindexHandler: typeof handler;
  const docs = { id: "docs.id" };
  const tags = { documentId: "tags.documentId" };
  const chunks = { documentId: "chunks.documentId" };
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        assert.equal(table, docs);
        return {
          where: (id: string) => ({
            for: async (mode: string) => {
              assert.equal(mode, "update");
              locked = true;
              return document?.id === id ? [structuredClone(document)] : [];
            },
          }),
        };
      },
    }),
    update: (table: unknown) => {
      assert.equal(table, docs);
      assert.ok(locked);
      return {
        set: (patch: Partial<ReturnType<typeof initial>>) => ({
          where: (id: string) => {
            const execute = async () => {
              assert.equal(id, document?.id);
              document = { ...document!, ...patch };
              writes++;
              return [structuredClone(document)];
            };
            return {
              returning: execute,
              then: (resolve: (value: unknown) => void) =>
                execute().then(resolve),
            };
          },
        }),
      };
    },
    delete: (table: unknown) => {
      assert.ok(table === tags || table === chunks);
      assert.ok(locked);
      return {
        where: async () => {
          if (table === tags) storedTags = [];
          else storedChunks = [];
          writes++;
        },
      };
    },
    insert: (table: unknown) => {
      assert.ok(table === tags || table === chunks);
      assert.ok(locked);
      return {
        values: async (rows: Array<{ tag: string; content: string }>) => {
          if (table === chunks) {
            if (failChunks) throw new Error("simulated chunk write failure");
            storedChunks = rows.map((row) => ({ content: row.content }));
            writes++;
            return;
          }
          if (failTags) throw new Error("simulated tag write failure");
          storedTags = rows.map((row) => row.tag);
          writes++;
        },
      };
    },
  };
  const router = {
    get() {},
    post(path: string, ...handlers: unknown[]) {
      if (path.endsWith("/reindex"))
        reindexHandler = handlers.at(-1) as typeof handler;
    },
    delete() {},
    put(_path: string, ...handlers: unknown[]) {
      handler = handlers.at(-1) as typeof handler;
    },
  };
  const dependencies: Record<string, unknown> = {
    express: { Router: () => router },
    "drizzle-orm": { eq: (_column: unknown, value: unknown) => value },
    "@workspace/db": {
      aiKnowledgeDocuments: docs,
      aiKnowledgeChunks: chunks,
      aiKnowledgeTags: tags,
      db: {
        transaction: async (callback: (db: typeof tx) => Promise<unknown>) => {
          transactions++;
          locked = false;
          const snapshot = structuredClone(document);
          const oldTags = [...storedTags];
          const oldChunks = structuredClone(storedChunks);
          const oldWrites = writes;
          try {
            return await callback(tx);
          } catch (error) {
            document = snapshot;
            storedTags = oldTags;
            storedChunks = oldChunks;
            writes = oldWrites;
            throw error;
          } finally {
            locked = false;
          }
        },
      },
    },
    "../middlewares/requireAuth": { requireAuth() {} },
    "../lib/userSync": {
      getOrCreateUser: async (req: Request) =>
        req.role === "anonymous" ? null : { role: req.role },
    },
    "../lib/ai/documentUpdatePolicy": policy,
  };
  const module = { exports: {} };
  const code = transformSync(
    readFileSync(new URL("./ai-knowledge.ts", import.meta.url), "utf8"),
    { loader: "ts", format: "cjs" },
  ).code;
  new Function("require", "module", "exports", code)(
    (name: string) => {
      assert.ok(
        Object.hasOwn(dependencies, name),
        `Unexpected dependency: ${name}`,
      );
      return dependencies[name];
    },
    module,
    module.exports,
  );
  return {
    read: () => ({
      document: structuredClone(document),
      storedTags: [...storedTags],
      storedChunks: structuredClone(storedChunks),
      transactions,
      writes,
    }),
    failTags: () => {
      failTags = true;
    },
    failChunks: () => {
      failChunks = true;
    },
    put: async (
      body: Record<string, unknown>,
      role = "admin",
      id = seed.id,
      reindex = false,
    ) => {
      let status = 200;
      let result: unknown;
      const response: Response = {
        status(value) {
          status = value;
          return response;
        },
        json(value) {
          result = value;
        },
      };
      await (reindex ? reindexHandler : handler)(
        { params: { id }, body, role },
        response,
      );
      return { status, body: result as Record<string, unknown> };
    },
  };
}

test("imported copies reject URL changes, clearing, marker removal and marker replacement", async () => {
  for (const body of [
    { sourceUrl: null },
    { sourceUrl: "" },
    { sourceUrl: "https://example.invalid/manual" },
    { sourceUrl: "/kb/articles/other" },
    { tags: [] },
    { tags: ["demarrer"] },
    { tags: ["[sourceKey=other]"] },
    { sourceUrl: "", tags: [] },
    { sourceUrl: "", tags: [marker], aiActive: true },
  ]) {
    const f = fixture();
    const before = f.read();
    assert.equal((await f.put(body)).status, 409, JSON.stringify(body));
    assert.deepEqual(f.read().document, before.document);
    assert.equal(f.read().writes, 0);
  }
});

test("reindex uses a locked transaction, indexes current content and preserves revocation", async () => {
  for (const status of ["indexed", "needs_review", "archived"]) {
    const f = fixture({ ...initial(), status, aiActive: false });
    const response = await f.put({}, "admin", "document-id", true);
    assert.equal(response.status, 200);
    assert.equal(f.read().document?.status, status);
    assert.equal(f.read().document?.aiActive, false);
    assert.deepEqual(f.read().storedChunks, [{ content: initial().content }]);
    assert.equal(f.read().transactions, 1);
  }
  const f = fixture();
  await f.put({ content: "Latest edited original extraction" });
  await f.put({}, "admin", "document-id", true);
  assert.equal(f.read().document?.status, "needs_review");
  assert.deepEqual(f.read().storedChunks, [
    { content: "Latest edited original extraction" },
  ]);
});

test("reindex chunk failure rolls back deletion and leaves document unchanged", async () => {
  const f = fixture();
  const before = f.read();
  f.failChunks();
  await assert.rejects(
    f.put({}, "admin", "document-id", true),
    /chunk write failure/,
  );
  assert.deepEqual(f.read().document, before.document);
  assert.deepEqual(f.read().storedChunks, before.storedChunks);
  assert.equal(f.read().writes, 0);
});

test("neither URL-first nor tags-first sequential updates can detach imported provenance", async () => {
  for (const patches of [
    [{ sourceUrl: null }, { tags: [] }],
    [{ tags: [] }, { sourceUrl: "https://example.invalid" }],
  ]) {
    const f = fixture();
    for (const patch of patches) assert.equal((await f.put(patch)).status, 409);
    assert.equal(
      (await f.put({ aiActive: true, status: "indexed" })).status,
      200,
    );
    assert.equal(f.read().document?.sourceUrl, linkedUrl);
    assert.ok(f.read().document?.tags.includes(marker));
  }
});

test("imported legacy links remain locked even when the marker is missing", async () => {
  const f = fixture({ ...initial(), sourceUrl: "kb:article-id", tags: [] });
  assert.equal((await f.put({ sourceUrl: null })).status, 409);
  assert.equal((await f.put({ tags: ["ordinary"] })).status, 200);
  assert.equal(
    (await f.put({ sourceUrl: "https://example.invalid" })).status,
    409,
  );
});

test("an already detached marked copy cannot erase its remaining marker", async () => {
  const f = fixture({ ...initial(), sourceUrl: null });
  assert.equal((await f.put({ tags: [] })).status, 409);
  assert.equal(
    (await f.put({ sourceUrl: "https://example.invalid" })).status,
    409,
  );
});

test("ordinary tag edits retain imported provenance in both stores and response", async () => {
  const f = fixture();
  const response = await f.put({
    sourceUrl: linkedUrl,
    tags: [marker, "updated-tag"],
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.tags, [marker, "updated-tag"]);
  assert.deepEqual(f.read().storedTags, [marker, "updated-tag"]);
  assert.equal(f.read().document?.aiActive, true);
});

test("manual documents remain editable but source/content changes override activation until re-review", async () => {
  for (const patch of [
    { sourceUrl: null },
    { sourceUrl: "https://example.invalid/new" },
    { content: "New content" },
  ]) {
    const f = fixture({
      ...initial(),
      sourceUrl: "https://example.invalid/old",
      tags: ["manual"],
    });
    const response = await f.put({
      ...patch,
      aiActive: true,
      status: "indexed",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.aiActive, false);
    assert.equal(response.body.status, "needs_review");
    assert.equal(
      (await f.put({ aiActive: true, status: "indexed" })).body.aiActive,
      true,
    );
  }
  const f = fixture({ ...initial(), sourceUrl: null, tags: ["manual"] });
  assert.equal((await f.put({ tags: [] })).body.aiActive, true);
});

test("tag write failures roll back the document and provenance together", async () => {
  const f = fixture();
  const before = f.read();
  f.failTags();
  await assert.rejects(
    f.put({ content: "Changed", tags: [marker, "new"] }),
    /simulated tag write failure/,
  );
  assert.deepEqual(f.read().document, before.document);
  assert.deepEqual(f.read().storedTags, before.storedTags);
});

test("PUT still enforces admin authorization, existence and narrow field validation", async () => {
  const f = fixture();
  assert.equal((await f.put({}, "anonymous")).status, 401);
  assert.equal((await f.put({}, "client")).status, 403);
  assert.equal(f.read().transactions, 0);
  assert.equal((await f.put({}, "admin", "missing")).status, 404);
  for (const body of [
    { tags: null },
    { tags: [3] },
    { sourceUrl: {} },
    { content: null },
    { aiActive: "true" },
  ])
    assert.equal((await f.put(body)).status, 400);
  assert.equal(f.read().writes, 0);
});
