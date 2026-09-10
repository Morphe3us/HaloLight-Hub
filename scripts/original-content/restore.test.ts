import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { PINS, NAMESPACE } from "./pins";
import { privateWorkPath, publishOriginals, verifyOriginals, type OriginalPair } from "./files";
import { applyRestoration, planRestoration, validateLocalTarget, type Runner } from "./database";

const dialect = new PgDialect();
const p = PINS[0];
const pair: OriginalPair = { ...p, sourceKey: `${NAMESPACE}:${p.key}`, originalPath: "original.pdf", correctedPath: "corrected.pdf",
  oldFileUrl: `/api/files/corrected-2026-09-10/${p.correctedHash}.pdf`, newFileUrl: `/api/files/original-2026-09-10/${p.originalHash}.pdf` };

test("restoration rejects production URLs, host overrides, default ports and non-disposable schemas", () => {
  for (const url of [undefined, "postgres://remote.invalid:55439/db", "postgres://127.0.0.1/db", "postgres://127.0.0.1:5432/db",
    "postgres://127.0.0.1:55439/db?host=remote.invalid", "https://127.0.0.1:55439/db"]) {
    assert.throws(() => validateLocalTarget(url, "original_restore_test_fixture"));
  }
  assert.throws(() => validateLocalTarget("postgres://127.0.0.1:55439/db", "public"));
  assert.equal(validateLocalTarget("postgres://127.0.0.1:55439/db", "original_restore_test_fixture").hostname, "127.0.0.1");
});

test("metadata restoration is exact-owner-only, bounded and idempotent", async () => {
  const rows = {
    uploads: { id: "upload-existing", description: `[sourceKey=${pair.sourceKey}] revision=2026-09-10 sha256=${pair.correctedHash}`, file_url: pair.oldFileUrl,
      mime_type: "application/pdf", file_size: pair.correctedBytes, visibility: "admin_only", status: "ready", uploaded_by: "untouched" },
    resources: { id: "resource-existing", description: `[sourceKey=${pair.sourceKey}] revision=2026-09-10 sha256=${pair.correctedHash}`, file_url: pair.oldFileUrl, status: "draft" },
    kb_articles: { id: "article-existing", source_key: pair.sourceKey, source_hash: pair.correctedHash, content: `Original commentary [PDF](${pair.oldFileUrl})`, status: "archived", ai_eligible: false, views: 72, author_id: "preserved" },
  };
  let writes = 0;
  const runner: Runner = { async execute(query) {
    const compiled = dialect.sqlToQuery(query);
    assert.ok(!/courses|lessons|progress|users|ai_knowledge/.test(compiled.sql));
    if (compiled.sql.startsWith("UPDATE")) { writes++; return { rows: [{ id: "updated" }] }; }
    const table = Object.keys(rows).find(name => compiled.sql.includes(`"${name}"`))! as keyof typeof rows;
    assert.ok(compiled.sql.includes("FOR UPDATE"));
    return { rows: [rows[table]] };
  } };
  const changes = await planRestoration(runner, [pair]);
  assert.deepEqual(changes.map(c => c.id), ["upload-existing", "resource-existing", "article-existing"]);
  assert.deepEqual(changes.map(c => Object.keys(c.updates).sort()), [["description", "file_size", "file_url"], ["description", "file_url"], ["content", "source_hash"]]);
  assert.equal(await applyRestoration(runner, changes), 3);
  for (const change of changes) Object.assign(rows[change.table], change.updates);
  assert.equal(await applyRestoration(runner, await planRestoration(runner, [pair])), 0);
  assert.equal(writes, 3);
  assert.equal(rows.kb_articles.status, "archived");
  assert.equal(rows.kb_articles.ai_eligible, false);
  assert.equal(rows.kb_articles.views, 72);
  assert.equal(rows.resources.status, "draft");
  assert.equal(rows.uploads.visibility, "admin_only");
  rows.uploads.description = "unrelated";
  await assert.rejects(planRestoration(runner, [pair]), /FOREIGN_METADATA_COLLISION/);
});

test("missing or ambiguous imported metadata aborts rather than guessing IDs", async () => {
  for (const rows of [[], [{ id: "first" }, { id: "second" }]]) {
    await assert.rejects(planRestoration({ execute: async () => ({ rows }) }, [pair]), /EXACT_OWNED_ROW_REQUIRED/);
  }
});

test("all 15 real pairs stay byte-identical to originals when copied; sources and symlinks stay protected", async (t) => {
  const work = path.join(os.homedir(), ".HaloHub");
  const originalRoot = path.join(work, "Halolight-hub");
  const correctedRoot = path.join(work, "Halolight-hub-corrige");
  const pairs = await verifyOriginals(path.join(work, "original-pdf-map.json"), originalRoot, correctedRoot);
  assert.equal(pairs.length, 15);
  const temp = await mkdtemp(path.join(work, "original-restoration-test-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await publishOriginals(pairs, temp, originalRoot, correctedRoot);
  await publishOriginals(pairs, temp, originalRoot, correctedRoot);
  for (const item of pairs) {
    const bytes = await readFile(path.join(temp, "original-2026-09-10", `${item.originalHash}.pdf`));
    assert.ok(bytes.equals(item.bytes), "restored PDF differs from original");
  }
  const alias = path.join(temp, "alias");
  await symlink(originalRoot, alias);
  await assert.rejects(privateWorkPath(path.join(alias, "forbidden.json")), /WORKFILE_INSIDE_SOURCE/);
  await assert.rejects(publishOriginals(pairs, originalRoot, originalRoot, correctedRoot));
  await verifyOriginals(path.join(work, "original-pdf-map.json"), originalRoot, correctedRoot);
});
