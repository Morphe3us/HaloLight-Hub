import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { assertDisposable, capture, decodeBackup, encodeBackup, restoreDisposable, TABLES, type Backup, type SqlClient } from "./backup";

const fixture = (): Backup => ({ version: 1, kind: "halolight-six-table-text-snapshot", schema: "public", snapshot: "1:2:", capturedAt: "2026-09-10 12:00:00.123456+00", serverVersion: "17",
  migrationPriorState: { kb_categories: [], kb_articles: [] },
  tables: TABLES.map(name => ({ name, schema: { columns: [{ name: "id", type: "uuid", nullable: false, default: null, identity: "", generated: "" }, { name: "value", type: "text", nullable: true, default: null, identity: "", generated: "" }], constraints: [], indexes: [], rls: false, forceRls: false, triggers: [] },
    rows: [[randomUUID(), '123456789012345678901234567890.123456789'], [randomUUID(), null]].sort((a, b) => a[0]!.localeCompare(b[0]!)) })) });

test("backup envelope preserves strings/nulls exactly and rejects tampering/extra tables", () => {
  const backup = fixture();
  backup.tables[0]!.rows[0]![1] = '2026-09-10 12:13:14.123456\n{"n":123456789012345678901234567890,"s":"é"}\n\\x00ff';
  assert.deepEqual(decodeBackup(encodeBackup(backup)), backup);
  const envelope = JSON.parse(encodeBackup(backup).toString()); envelope.payload += " ";
  assert.throws(() => decodeBackup(Buffer.from(JSON.stringify(envelope))), /BACKUP_CHECKSUM_MISMATCH/);
  const invalid = fixture(); invalid.tables[0]!.rows[0]![1] = 9007199254740993 as unknown as string;
  assert.throws(() => decodeBackup(encodeBackup(invalid)), /INVALID_BACKUP_CELL/);
  const extra = fixture(); extra.tables.push(extra.tables[0]!);
  assert.throws(() => decodeBackup(encodeBackup(extra)), /BACKUP_TABLE_ALLOWLIST_MISMATCH/);
});

test("restore rejects production, default port, host overrides and non-disposable schemas", () => {
  const schema = "backup_restore_aabbccdd";
  for (const url of ["postgresql://example.invalid:55439/db", "postgresql://localhost:5432/db", "postgresql://localhost/db", "postgresql://localhost:55439/db?host=elsewhere", "https://localhost:55439/db"])
    assert.throws(() => assertDisposable(url, schema));
  assert.throws(() => assertDisposable("postgresql://localhost:55439/db", "public"));
  assertDisposable("postgresql://localhost:55439/db", schema);
});

test("capture starts repeatable-read/read-only and rolls back on unavailable table", async () => {
  const statements: string[] = [];
  const client: SqlClient = { async query(sql) {
    statements.push(sql);
    if (sql.startsWith("LOCK TABLE")) throw new Error("fixture unavailable");
    return { rows: [] };
  } };
  await assert.rejects(capture(client), /fixture unavailable/);
  assert.equal(statements[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.ok(statements.includes("SET LOCAL row_security = off"));
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.ok(!statements.some(sql => /^(INSERT|UPDATE|DELETE|ALTER|CREATE)/.test(sql)));
});

test("invalid restore target is rejected before any SQL", async () => {
  let calls = 0;
  const client: SqlClient = { async query() { calls++; return { rows: [] }; } };
  await assert.rejects(restoreDisposable(client, fixture(), "postgresql://remote.invalid:55439/db", "backup_restore_aabbccdd"));
  assert.equal(calls, 0);
});

const testUrl = process.env.CONTENT_BACKUP_TEST_DATABASE_URL ?? process.env.IMPORT_TEST_DATABASE_URL;
test("real disposable PostgreSQL: exact text restore, consistent snapshot, prior migration state, rollback and external FK protection", { skip: !testUrl && "Explicit loopback test URL required; no real database verification claimed", timeout: 120_000 }, async () => {
  const source = `backup_restore_${randomUUID().replaceAll("-", "")}`;
  const target = `backup_restore_${randomUUID().replaceAll("-", "")}`;
  assertDisposable(testUrl!, source);
  const { createDatabasePool } = await import("@workspace/db/poolConfig");
  const pool = createDatabasePool(testUrl!);
  const client = await pool.connect();
  const writer = await pool.connect();
  const id = randomUUID();
  const q = (schema: string, table: string) => `"${schema}"."${table}"`;
  try {
    for (const schema of [source, target]) {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`CREATE TYPE "${schema}".backup_mood AS ENUM ('reviewed','pending')`);
      for (const table of TABLES) {
        const fk = table === "kb_articles" ? `, category_id uuid REFERENCES ${q(schema, "kb_categories")}(id)` : table === "ai_knowledge_chunks" ? `, document_id uuid REFERENCES ${q(schema, "ai_knowledge_documents")}(id)` : "";
        await client.query(`CREATE TABLE ${q(schema, table)} (id uuid PRIMARY KEY, title text, huge numeric(50,12), counter bigint, stamp timestamp, instant timestamptz, binary_data bytea, labels text[], data jsonb, raw_json json, flag boolean, optional text, mood "${schema}".backup_mood DEFAULT 'reviewed'${fk})`);
        await client.query(`INSERT INTO ${q(schema, table)} (id,title,huge,counter,stamp,instant,binary_data,labels,data,raw_json,flag,optional${table === "kb_articles" ? ",category_id" : table === "ai_knowledge_chunks" ? ",document_id" : ""}) VALUES ($1,'original',$2,$3,$4,$5,$6,$7,$8,$9,false,NULL${table === "kb_articles" || table === "ai_knowledge_chunks" ? ",$1" : ""})`, [id,
          "123456789012345678901234567890.123456789012", "9223372036854775807", "2026-09-10 12:34:56.123456", "2026-09-10 12:34:56.654321+07", "\\x00ff01",
          '{"é","comma,quote\\\"",NULL,"NULL",""}', '{"n":123456789012345678901234567890,"a":[true,null,"é"]}', '{ "exact" : 123456789012345678901234567890, "s": "é" }']);
      }
    }
    const baseline = await capture(client, source);
    let interleaved = false;
    const snapshotClient: SqlClient = { async query(sql, params) {
      if (!interleaved && sql.startsWith("FETCH")) {
        interleaved = true;
        await writer.query(`UPDATE ${q(source, "ai_knowledge_documents")} SET title='concurrent-new-value'`);
      }
      return client.query(sql, params);
    } };
    const concurrent = await capture(snapshotClient, source);
    assert.deepEqual(concurrent.tables, baseline.tables, "All six tables share the snapshot preceding the concurrent commit");
    assert.equal(interleaved, true);

    await client.query(`ALTER TABLE ${q(target, "kb_categories")} ADD COLUMN language text NOT NULL DEFAULT 'en'`);
    await client.query(`ALTER TABLE ${q(target, "kb_articles")} ADD COLUMN language text NOT NULL DEFAULT 'en', ADD COLUMN source_key text UNIQUE, ADD COLUMN source_revision text, ADD COLUMN source_hash text, ADD COLUMN ai_eligible boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE ${q(target, "ai_knowledge_chunks")} ADD COLUMN unexpected integer`);
    const beforeFailedRestore = await capture(client, target);
    await assert.rejects(restoreDisposable(client, baseline, testUrl!, target), /RESTORE_SCHEMA_MISMATCH/);
    assert.deepEqual((await capture(client, target)).tables, beforeFailedRestore.tables, "Schema removals and data must roll back together");
    await client.query(`ALTER TABLE ${q(target, "ai_knowledge_chunks")} DROP COLUMN unexpected`);
    for (const table of TABLES) await client.query(`UPDATE ${q(target, table)} SET title='changed', stamp='2000-01-01 00:00:00.000001'`);
    await restoreDisposable(client, decodeBackup(encodeBackup(baseline)), testUrl!, target);
    const restored = await capture(client, target);
    assert.deepEqual(restored.tables.map(table => table.rows), baseline.tables.map(table => table.rows));
    assert.deepEqual(restored.migrationPriorState, baseline.migrationPriorState);
    await restoreDisposable(client, baseline, testUrl!, target);
    assert.deepEqual((await capture(client, target)).tables.map(table => table.rows), baseline.tables.map(table => table.rows));

    const extra = randomUUID();
    await client.query(`CREATE TABLE "${target}".outside_tags (document_id uuid REFERENCES ${q(target, "ai_knowledge_documents")}(id) ON DELETE CASCADE)`);
    await client.query(`INSERT INTO ${q(target, "ai_knowledge_documents")} (id,title) VALUES ($1,'post-backup')`, [extra]);
    await client.query(`INSERT INTO "${target}".outside_tags VALUES ($1)`, [extra]);
    await assert.rejects(restoreDisposable(client, baseline, testUrl!, target), /RESTORE_WOULD_CHANGE_EXTERNAL_REFERENCES/);
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${target}".outside_tags`)).rows[0].n, 1);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${target}" CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS "${source}" CASCADE`);
    writer.release(); client.release(); await pool.end();
  }
});
