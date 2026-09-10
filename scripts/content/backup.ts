/**
 * Targeted six-table backup, NOT pg_dump or a full database backup.
 *
 * Backup: CONTENT_BACKUP_DATABASE_URL=<injected> tsx content/backup.ts backup
 *   --output-dir <private-absolute-dir> [--schema public]
 * Verify: tsx content/backup.ts verify --file <private-backup.json>
 * Restore (isolated loopback test schema only):
 *   CONTENT_BACKUP_TEST_DATABASE_URL=<injected> tsx content/backup.ts restore-test
 *   --file <private-backup.json> --schema backup_restore_<unique-id>
 *   --confirm-restore replace-disposable-schema
 *
 * Target must already have the baseline tables/types/dependencies. Restoration
 * can remove only this migration's additive columns absent in the saved state;
 * all other schema differences abort. No saved SQL is executed. External users,
 * AI tags, file bytes, sequences, roles/grants, functions, triggers, policies,
 * extensions, migration journals and other tables are NOT backed up/restored.
 * Archive schema definitions are audit metadata, not standalone recreation DDL.
 * Restore refuses user triggers/RLS and refuses deletion of externally referenced
 * rows. Run with application writes stopped for operational recovery. A backup
 * is consistent at its snapshot, not a guarantee of no subsequent writes.
 */
import path from "node:path";
import { lstat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { externalDirectory, ImportError, publishPrivate, readRegular, requireImport, sha256 } from "./private-files";

export const TABLES = ["kb_categories", "resources", "uploads", "kb_articles", "ai_knowledge_documents", "ai_knowledge_chunks"] as const;
type Table = typeof TABLES[number];
type Cell = string | null;
export interface SqlClient { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, any>[] }> }
interface Column { name: string; type: string; nullable: boolean; default: string | null; identity: string; generated: string }
interface SchemaInfo { columns: Column[]; constraints: unknown[]; indexes: unknown[]; rls: boolean; forceRls: boolean; triggers: unknown[] }
interface TableBackup { name: Table; schema: SchemaInfo; rows: Cell[][] }
export interface Backup {
  version: 1; kind: "halolight-six-table-text-snapshot"; schema: string;
  snapshot: string; capturedAt: string; serverVersion: string;
  tables: TableBackup[]; migrationPriorState: Record<string, string[]>;
}
const ADDED: Partial<Record<Table, string[]>> = { kb_categories: ["language"], kb_articles: ["language", "source_key", "source_revision", "source_hash", "ai_eligible"] };
const MAX_BYTES = 128 * 1024 * 1024;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const qualified = (schema: string, table: string) => `${quote(schema)}.${quote(table)}`;
const stable = (value: unknown): string => JSON.stringify(value);
const releaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function settings(client: SqlClient, schema: string) {
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL TimeZone = 'UTC'");
  await client.query("SET LOCAL DateStyle = 'ISO, YMD'");
  await client.query("SET LOCAL IntervalStyle = 'postgres'");
  await client.query("SET LOCAL extra_float_digits = 3");
  await client.query("SET LOCAL bytea_output = 'hex'");
  await client.query("SET LOCAL row_security = off");
  await client.query(`SET LOCAL search_path = ${quote(schema)}, pg_catalog`);
}

async function schemaInfo(client: SqlClient, schema: string, table: Table): Promise<SchemaInfo> {
  const name = qualified(schema, table);
  const result = await client.query(`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
    NOT a.attnotnull AS nullable, pg_get_expr(d.adbin,d.adrelid) AS default,
    a.attidentity AS identity, a.attgenerated AS generated
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [name]);
  const columns = result.rows as Column[];
  requireImport(columns.some(column => column.name === "id" && column.type === "uuid"), "BACKUP_UUID_ID_REQUIRED");
  requireImport(columns.every(column => !column.identity && !column.generated), "GENERATED_OR_IDENTITY_COLUMNS_UNSUPPORTED");
  const constraints = (await client.query(`SELECT conname AS name, contype AS type, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname`, [name])).rows;
  const indexes = (await client.query(`SELECT ci.relname AS name, pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=$1::regclass ORDER BY ci.relname`, [name])).rows;
  const [flags] = (await client.query("SELECT relrowsecurity AS rls, relforcerowsecurity AS force_rls FROM pg_class WHERE oid=$1::regclass", [name])).rows;
  const triggers = (await client.query("SELECT tgname AS name, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname", [name])).rows;
  return { columns, constraints, indexes, rls: flags!.rls, forceRls: flags!.force_rls, triggers };
}

async function textRows(client: SqlClient, schema: string, table: Table, columns: Column[]): Promise<Cell[][]> {
  const rows: Cell[][] = [];
  let bytes = 0;
  // Each non-null cell uses PostgreSQL's native text output/input, not JS Date,
  // Number, or parsed jsonb. Microseconds and arbitrarily large numerics survive.
  await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT json_build_array(${columns.map(column => `${quote(column.name)}::text`).join(",")})::text AS encoded FROM ${qualified(schema, table)} ORDER BY id`);
  try {
    for (;;) {
      const batch = (await client.query("FETCH FORWARD 500 FROM backup_rows")).rows;
      if (!batch.length) break;
      for (const row of batch) {
        bytes += Buffer.byteLength(row.encoded);
        requireImport(bytes <= MAX_BYTES, "BACKUP_SIZE_LIMIT");
        rows.push(JSON.parse(row.encoded));
      }
    }
  } finally { await client.query("CLOSE backup_rows"); }
  return rows;
}

export async function capture(client: SqlClient, schema = "public"): Promise<Backup> {
  requireImport(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema), "INVALID_SCHEMA");
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await settings(client, schema);
    // Acquire all relation locks before the first snapshot; block DDL, not DML.
    await client.query(`LOCK TABLE ${TABLES.map(table => qualified(schema, table)).join(",")} IN ACCESS SHARE MODE`);
    const [info] = (await client.query("SELECT txid_current_snapshot()::text AS snapshot, clock_timestamp()::text AS captured_at, current_setting('server_version') AS server_version")).rows;
    const tables: TableBackup[] = [];
    for (const name of TABLES) {
      const definition = await schemaInfo(client, schema, name);
      tables.push({ name, schema: definition, rows: await textRows(client, schema, name, definition.columns) });
    }
    const backup: Backup = { version: 1, kind: "halolight-six-table-text-snapshot", schema, snapshot: info!.snapshot,
      capturedAt: info!.captured_at, serverVersion: info!.server_version, tables,
      migrationPriorState: Object.fromEntries(tables.filter(table => ADDED[table.name]).map(table => [table.name, table.schema.columns.map(column => column.name).filter(name => ADDED[table.name]!.includes(name))])) };
    requireImport(Buffer.byteLength(stable(backup)) <= MAX_BYTES, "BACKUP_SIZE_LIMIT");
    await client.query("COMMIT");
    return backup;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

export function encodeBackup(backup: Backup): Buffer {
  const payload = stable(backup);
  requireImport(Buffer.byteLength(payload) <= MAX_BYTES, "BACKUP_SIZE_LIMIT");
  return Buffer.from(`${JSON.stringify({ sha256: sha256(payload), payload })}\n`);
}

export function decodeBackup(bytes: Buffer): Backup {
  requireImport(bytes.length <= MAX_BYTES * 2 + 1024, "BACKUP_SIZE_LIMIT");
  const envelope = JSON.parse(bytes.toString("utf8"));
  requireImport(typeof envelope.payload === "string" && sha256(envelope.payload) === envelope.sha256, "BACKUP_CHECKSUM_MISMATCH");
  const backup = JSON.parse(envelope.payload) as Backup;
  requireImport(backup.version === 1 && backup.kind === "halolight-six-table-text-snapshot" && typeof backup.schema === "string", "INVALID_BACKUP_FORMAT");
  requireImport(Array.isArray(backup.tables) && stable(backup.tables.map(table => table.name)) === stable(TABLES), "BACKUP_TABLE_ALLOWLIST_MISMATCH");
  for (const table of backup.tables) {
    requireImport(Array.isArray(table.schema?.columns) && table.schema.columns.length > 0 && Array.isArray(table.rows), "INVALID_BACKUP_TABLE");
    const names = table.schema.columns.map(column => column.name);
    requireImport(names.every(name => typeof name === "string") && new Set(names).size === names.length && names.includes("id"), "INVALID_BACKUP_COLUMNS");
    const ids = new Set<string>();
    for (const row of table.rows) {
      requireImport(Array.isArray(row) && row.length === names.length && row.every(cell => cell === null || typeof cell === "string"), "INVALID_BACKUP_CELL");
      const id = row[names.indexOf("id")];
      requireImport(typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) && !ids.has(id), "INVALID_BACKUP_ID");
      ids.add(id);
    }
  }
  return backup;
}

export function assertDisposable(url: string, schema: string): void {
  const parsed = new URL(url);
  requireImport(["postgres:", "postgresql:"].includes(parsed.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
    && parsed.port === "55439" && !parsed.search && !parsed.hash && parsed.pathname.length > 1, "DISPOSABLE_LOOPBACK_DATABASE_REQUIRED");
  requireImport(/^backup_restore_[a-f0-9_]{8,}$/.test(schema), "DISPOSABLE_SCHEMA_REQUIRED");
}

function comparable(info: SchemaInfo, schema: string): string {
  // Normalization is comparison-only; these recorded SQL definitions are never executed.
  const normalized = stable({ ...info, columns: [...info.columns].sort((a, b) => a.name.localeCompare(b.name)) });
  return normalized.replaceAll(`${schema}.`, "<schema>.").replaceAll(`${quote(schema)}.`, "<schema>.");
}

async function protectExternalReferences(client: SqlClient, schema: string, backup: Backup) {
  for (const table of backup.tables) {
    const refs = (await client.query(`SELECT ns.nspname AS schema, rel.relname AS table,
      a.attname AS column, cardinality(c.conkey) AS key_count, target.attname AS target_column
      FROM pg_constraint c JOIN pg_class rel ON rel.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      JOIN pg_attribute target ON target.attrelid=c.confrelid AND target.attnum=c.confkey[1]
      WHERE c.contype='f' AND c.confrelid=$1::regclass`, [qualified(schema, table.name)])).rows;
    const ids = table.rows.map(row => row[table.schema.columns.findIndex(column => column.name === "id")]);
    for (const ref of refs) {
      if (ref.schema === schema && TABLES.includes(ref.table)) continue;
      requireImport(ref.key_count === 1 && ref.target_column === "id", "UNSUPPORTED_EXTERNAL_FOREIGN_KEY");
      const used = await client.query(`SELECT 1 FROM ${qualified(ref.schema, ref.table)} r JOIN ${qualified(schema, table.name)} t ON r.${quote(ref.column)}=t.id WHERE NOT(t.id=ANY($1::uuid[])) LIMIT 1`, [ids]);
      requireImport(!used.rows.length, "RESTORE_WOULD_CHANGE_EXTERNAL_REFERENCES");
    }
  }
}

export async function restoreDisposable(client: SqlClient, backup: Backup, url: string, schema: string): Promise<void> {
  assertDisposable(url, schema);
  decodeBackup(encodeBackup(backup));
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await settings(client, schema);
    await client.query(`LOCK TABLE ${TABLES.map(table => qualified(schema, table)).join(",")} IN ACCESS EXCLUSIVE MODE`);
    for (const saved of backup.tables) {
      let current = await schemaInfo(client, schema, saved.name);
      requireImport(!current.rls && !current.forceRls && !current.triggers.length, "RESTORE_RLS_OR_TRIGGERS_UNSUPPORTED");
      for (const column of ADDED[saved.name] ?? []) {
        if (!saved.schema.columns.some(item => item.name === column) && current.columns.some(item => item.name === column)) {
          await client.query(`ALTER TABLE ${qualified(schema, saved.name)} DROP COLUMN ${quote(column)}`);
        }
      }
      current = await schemaInfo(client, schema, saved.name);
      requireImport(comparable(current, schema) === comparable(saved.schema, backup.schema), "RESTORE_SCHEMA_MISMATCH");
    }
    await protectExternalReferences(client, schema, backup);
    // Existing IDs are updated in place, avoiding cascades to unbacked AI tags.
    for (const table of backup.tables) {
      const columns = table.schema.columns.map(column => column.name);
      const updates = columns.filter(column => column !== "id").map(column => `${quote(column)}=EXCLUDED.${quote(column)}`).join(",");
      for (const row of table.rows) await client.query(`INSERT INTO ${qualified(schema, table.name)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT(id) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`, row);
    }
    for (const table of [...backup.tables].reverse()) {
      const idIndex = table.schema.columns.findIndex(column => column.name === "id");
      await client.query(`DELETE FROM ${qualified(schema, table.name)} WHERE NOT(id=ANY($1::uuid[]))`, [table.rows.map(row => row[idIndex])]);
    }
    for (const table of backup.tables) {
      const restored = await textRows(client, schema, table.name, table.schema.columns);
      requireImport(stable(restored) === stable(table.rows), "RESTORE_SERIALIZATION_MISMATCH");
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    "output-dir": { type: "string" }, file: { type: "string" }, schema: { type: "string" }, "confirm-restore": { type: "string" }, help: { type: "boolean" },
  } });
  const mode = positionals[0];
  if (values.help) { console.log("backup --output-dir <private-dir> [--schema public] | verify --file <private-json> | restore-test --file <private-json> --schema backup_restore_<id> --confirm-restore replace-disposable-schema. Backup uses CONTENT_BACKUP_DATABASE_URL; restore uses CONTENT_BACKUP_TEST_DATABASE_URL (loopback:55439 only). This is NOT a full database backup; see backup.ts header."); return; }
  requireImport(positionals.length === 1 && ["backup", "verify", "restore-test"].includes(mode!), "INVALID_BACKUP_MODE");
  let backup: Backup | undefined;
  if (mode !== "backup") {
    requireImport(values.file && path.isAbsolute(values.file), "PRIVATE_BACKUP_FILE_REQUIRED");
    await externalDirectory(path.dirname(values.file), releaseRoot);
    requireImport(((await lstat(values.file)).mode & 0o077) === 0, "PRIVATE_FILE_PERMISSIONS");
    backup = decodeBackup(await readRegular(values.file));
    if (mode === "verify") { console.log(JSON.stringify({ verified: true, tables: backup.tables.map(table => ({ name: table.name, rows: table.rows.length })) })); return; }
  }
  const schema = values.schema ?? "public";
  const url = mode === "backup" ? process.env.CONTENT_BACKUP_DATABASE_URL : process.env.CONTENT_BACKUP_TEST_DATABASE_URL;
  requireImport(url, "EXPLICIT_BACKUP_DATABASE_URL_REQUIRED");
  if (mode === "restore-test") {
    requireImport(values["confirm-restore"] === "replace-disposable-schema", "RESTORE_CONFIRMATION_REQUIRED");
    assertDisposable(url, schema);
  }
  let output: string | undefined;
  if (mode === "backup") {
    requireImport(values["output-dir"], "PRIVATE_OUTPUT_DIRECTORY_REQUIRED");
    output = await externalDirectory(values["output-dir"], releaseRoot, true);
  }
  const { createDatabasePool } = await import("@workspace/db/poolConfig");
  const pool = createDatabasePool(url);
  try {
    const client = await pool.connect();
    try {
      if (mode === "backup") {
        const captured = await capture(client, schema);
        const bytes = encodeBackup(captured);
        const hash = sha256(bytes);
        const filename = `targeted-six-table-${hash}.json`;
        const file = path.join(output!, filename);
        await publishPrivate(file, bytes);
        const readback = await readRegular(file);
        requireImport(sha256(readback) === hash, "BACKUP_READBACK_MISMATCH");
        decodeBackup(readback);
        console.log(JSON.stringify({ filename, sha256: hash, bytes: bytes.length, tables: captured.tables.map(table => ({ name: table.name, rows: table.rows.length })), fullDatabaseBackup: false }));
      } else {
        await restoreDisposable(client, backup!, url, schema);
        console.log(JSON.stringify({ restored: true, disposableOnly: true, fullDatabaseBackup: false }));
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof ImportError ? error.message : "BACKUP_OPERATION_FAILED: no sensitive details emitted"); process.exitCode = 1; });
}
