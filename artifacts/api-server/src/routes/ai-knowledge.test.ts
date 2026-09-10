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
  const docs = { id: "docs.id" };
  const tags = { documentId: "tags.documentId" };
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
          where: (id: string) => ({
            returning: async () => {
              assert.equal(id, document?.id);
              document = { ...document!, ...patch };
              writes++;
              return [structuredClone(document)];
            },
          }),
        }),
      };
    },
    delete: (table: unknown) => {
      assert.equal(table, tags);
      assert.ok(locked);
      return {
        where: async () => {
          storedTags = [];
          writes++;
        },
      };
    },
    insert: (table: unknown) => {
      assert.equal(table, tags);
      assert.ok(locked);
      return {
        values: async (rows: Array<{ tag: string }>) => {
          if (failTags) throw new Error("simulated tag write failure");
          storedTags = rows.map((row) => row.tag);
          writes++;
        },
      };
    },
  };
  const router = {
    get() {},
    post() {},
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
      aiKnowledgeChunks: {},
      aiKnowledgeTags: tags,
      db: {
        transaction: async (callback: (db: typeof tx) => Promise<unknown>) => {
          transactions++;
          locked = false;
          const snapshot = structuredClone(document);
          const oldTags = [...storedTags];
          const oldWrites = writes;
          try {
            return await callback(tx);
          } catch (error) {
            document = snapshot;
            storedTags = oldTags;
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
      transactions,
      writes,
    }),
    failTags: () => {
      failTags = true;
    },
    put: async (
      body: Record<string, unknown>,
      role = "admin",
      id = seed.id,
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
      await handler({ params: { id }, body, role }, response);
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
