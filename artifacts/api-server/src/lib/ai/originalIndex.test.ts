import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { activateOfficialOriginals, localIndexTarget } from "./originalIndex";
import {
  officialContent,
  readOfficialIndex,
  OFFICIAL_INDEX_REVISION,
  type OfficialOriginal,
} from "./officialOriginals";

const original: OfficialOriginal = {
  sourceKey: "halolight:corrected-content:fr:fixture",
  originalSha256: "a".repeat(64),
  fileUrl: `/api/files/original-2026-09-10/${"a".repeat(64)}.pdf`,
  pages: [
    { page: 1, text: "Approved original passage" },
    { page: 2, text: "" },
  ],
  emptyPages: [2],
};

function fixture(
  overrides: Record<string, unknown> = {},
  linked: Record<string, unknown>[] = [],
) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const article = {
    id: "article-id",
    title: "Official guide",
    language: "fr",
    source_hash: original.originalSha256,
    source_revision: "2026-09-10",
    status: "published",
    content: "Old overview",
    ...overrides,
  };
  const runner = {
    async execute(query: Parameters<PgDialect["sqlToQuery"]>[0]) {
      const statement = new PgDialect().sqlToQuery(query);
      statements.push(statement);
      if (statement.sql.includes("SELECT * FROM kb_articles"))
        return { rows: [article] };
      if (statement.sql.includes("SELECT * FROM ai_knowledge_documents"))
        return { rows: linked };
      return { rows: [] };
    },
  };
  return { runner, statements };
}

test("official activation synchronizes existing KB, new knowledge and page chunks using current flags", async () => {
  const f = fixture();
  assert.equal(await activateOfficialOriginals(f.runner, [original]), 1);
  const writes = f.statements.filter((s) =>
    /^(UPDATE|INSERT|DELETE)/.test(s.sql),
  );
  assert.ok(writes.some((s) => s.sql.includes("ai_eligible = true")));
  const doc = writes.find((s) =>
    s.sql.includes("INSERT INTO ai_knowledge_documents"),
  )!;
  assert.ok(doc.sql.includes("true, 'indexed'"));
  assert.ok(doc.params.includes("/kb/articles/article-id"));
  assert.ok(doc.params.includes(officialContent(original).content));
  const chunk = writes.find((s) =>
    s.sql.includes("INSERT INTO ai_knowledge_chunks"),
  )!;
  assert.ok(chunk.params.includes(officialContent(original).pages[0].content));
  assert.ok(
    officialContent(original).content.includes(String(chunk.params[1])),
  );
  assert.equal(
    writes.filter((s) => s.sql.includes("INSERT INTO ai_knowledge_chunks"))
      .length,
    1,
  );
  assert.ok(writes.every((s) => !/UPDATE (uploads|resources)/.test(s.sql)));
  assert.equal(original.pages[0].text, "Approved original passage");
});

test("activation rejects unrestored hashes and locally changed article snapshots before writes", async () => {
  for (const changes of [
    { source_hash: "wrong" },
    { source_revision: "local-edit" },
    { status: "archived" },
  ]) {
    const f = fixture(changes);
    await assert.rejects(activateOfficialOriginals(f.runner, [original]));
    assert.ok(!f.statements.some((s) => /^(UPDATE|INSERT|DELETE)/.test(s.sql)));
  }
});

test("idempotent retry does not undo later publication or AI revocation", async () => {
  const content = officialContent(original).content;
  const f = fixture(
    {
      source_revision: OFFICIAL_INDEX_REVISION,
      content,
      status: "archived",
      ai_eligible: false,
    },
    [
      {
        id: "doc-id",
        content,
        title: "Official guide",
        language: "fr",
        source_url: "/kb/articles/article-id",
        ai_active: false,
      },
    ],
  );
  assert.equal(await activateOfficialOriginals(f.runner, [original]), 0);
  assert.ok(!f.statements.some((s) => /^(UPDATE|INSERT|DELETE)/.test(s.sql)));
});

test("arbitrary derivatives and non-disposable DB destinations cannot activate uploads", () => {
  assert.throws(
    () =>
      readOfficialIndex(Buffer.from(JSON.stringify({ documents: [original] }))),
    /HASH_MISMATCH/,
  );
  for (const url of [
    undefined,
    "postgres://example.com:5433/db",
    "postgres://127.0.0.1:5432/db",
    "postgres://localhost:5433/db",
  ])
    assert.throws(() => localIndexTarget(url, "original_restore_test_ai"));
  assert.throws(() =>
    localIndexTarget("postgres://127.0.0.1:5544/db", "public"),
  );
  assert.equal(
    localIndexTarget("postgres://127.0.0.1:5544/db", "original_restore_test_ai")
      .port,
    "5544",
  );
});

const sidecar = process.env.HALOHUB_TEST_ORIGINAL_INDEX;
test(
  "private official sidecar remains exactly pinned with all 15 originals and 324 pages",
  { skip: !sidecar || !existsSync(sidecar) },
  () => {
    const bytes = readFileSync(sidecar!);
    const documents = readOfficialIndex(bytes);
    assert.equal(documents.length, 15);
    assert.equal(
      documents.reduce((count, doc) => count + doc.pages.length, 0),
      324,
    );
    const altered = Buffer.from(bytes);
    altered[altered.length - 1] ^= 1;
    assert.throws(() => readOfficialIndex(altered), /HASH_MISMATCH/);
  },
);
