import { sql, type SQL } from "drizzle-orm";
import { ownerMarker, type Bundle, type PlannedRow, type Row, type TableName } from "./manifest";
import { requireImport, sha256 } from "./private-files";

export interface QueryRunner { execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }> }
export interface Change { planned: PlannedRow; kind: "insert" | "update" | "unchanged"; changed: Record<string, unknown> }
export interface Diff { changes: Change[]; staleChunks: string[] }

function normalized(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(normalized).join(",")}]`;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)])));
  }
  return JSON.stringify(value);
}

export function owned(row: Record<string, unknown>, item: PlannedRow): boolean {
  const marker = ownerMarker(item.sourceKey);
  switch (item.table) {
    case "kb_articles": return row.source_key === item.sourceKey;
    case "kb_categories": return row.description === marker;
    case "resources": case "uploads": return typeof row.description === "string" && row.description.startsWith(`${marker} revision=`);
    case "ai_knowledge_documents": return Array.isArray(row.tags) && row.tags.includes(marker);
    case "ai_knowledge_chunks": return (row.metadata as Record<string, unknown> | undefined)?.sourceKey === item.sourceKey;
  }
}

export function compareRow(item: PlannedRow, matches: Record<string, unknown>[]): Change {
  requireImport(matches.length <= 1, "IDENTITY_COLLISION");
  const current = matches[0];
  if (!current) return { planned: item, kind: "insert", changed: item.values };
  requireImport(owned(current, item), "UNRELATED_ROW_COLLISION");
  requireImport(typeof current.id === "string", "INVALID_EXISTING_ID");
  const values: Row = { ...item.values, id: current.id };
  // Author, views, timestamps and user activity are not importer-owned on update.
  if (item.table === "kb_articles") values.author_id = current.author_id;
  const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => key !== "id" && normalized(current[key]) !== normalized(value)));
  // The hash-pinned canonical revision is our ownership snapshot. No prior
  // baseline exists for a different revision, so upgrades also require review.
  const fields = Object.keys(values).filter(key => key !== "id" && key !== "author_id");
  const snapshot = (row: Record<string, unknown>) => sha256(normalized(Object.fromEntries(fields.map(key => [key, row[key]]))));
  requireImport(snapshot(current) === snapshot(values), "LOCALLY_MODIFIED_ROW_OR_REVISION_REVIEW_REQUIRED");
  return { planned: { ...item, values }, kind: Object.keys(changed).length ? "update" : "unchanged", changed };
}

function identity(item: PlannedRow): SQL {
  const row = item.values;
  const terms = [sql`id = ${row.id}`];
  if (row.slug) terms.push(sql`slug = ${row.slug}`);
  if (item.table === "kb_articles") terms.push(sql`source_key = ${item.sourceKey}`);
  if (item.table === "uploads" || item.table === "resources") {
    terms.push(sql`file_url = ${row.file_url}`);
    terms.push(sql`description LIKE ${`${ownerMarker(item.sourceKey)} revision=%`}`);
  }
  if (item.table === "ai_knowledge_documents") terms.push(sql`tags @> ${JSON.stringify([ownerMarker(item.sourceKey)])}::jsonb`);
  if (item.table === "ai_knowledge_chunks") terms.push(sql`document_id = ${row.document_id} AND chunk_index = ${row.chunk_index}`);
  return sql.join(terms.map(term => sql`(${term})`), sql` OR `);
}

export async function checkSchema(runner: QueryRunner, bundle: Bundle, authorId: string): Promise<void> {
  const tables = new Map<TableName, Set<string>>();
  for (const item of bundle.rows) {
    const fields = tables.get(item.table) ?? new Set<string>();
    for (const key of Object.keys(item.values)) fields.add(key);
    tables.set(item.table, fields);
  }
  for (const [table, fields] of tables) await runner.execute(sql`SELECT ${sql.join([...fields].map(field => sql.identifier(field)), sql`, `)} FROM ${sql.identifier(table)} LIMIT 0`);
  const indexes = await runner.execute(sql`
    SELECT t.relname AS table_name, a.attname AS column_name
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = current_schema() AND i.indisunique AND i.indisvalid
      AND i.indnkeyatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
      AND t.relname IN ('kb_articles', 'kb_categories')
  `);
  for (const [table, column] of [["kb_articles", "source_key"], ["kb_articles", "slug"], ["kb_categories", "slug"]]) {
    requireImport(indexes.rows.some(row => row.table_name === table && row.column_name === column), "SCHEMA_UNIQUE_CONSTRAINT_REQUIRED");
  }
  const author = await runner.execute(sql`SELECT id FROM users WHERE id = ${authorId}`);
  requireImport(author.rows.length === 1, "EXISTING_AUTHOR_REQUIRED");
}

export async function planDatabase(runner: QueryRunner, bundle: Bundle): Promise<Diff> {
  const changes: Change[] = [];
  const ids = new Map<string, string>();
  for (const original of bundle.rows) {
    const item: PlannedRow = { ...original, values: { ...original.values } };
    for (const key of ["category_id", "document_id"] as const) {
      const value = item.values[key];
      if (typeof value === "string" && ids.has(value)) item.values[key] = ids.get(value)!;
    }
    if (typeof item.values.source_url === "string" && item.values.source_url.startsWith("/kb/articles/")) {
      const id = item.values.source_url.slice("/kb/articles/".length);
      item.values.source_url = `/kb/articles/${ids.get(id) ?? id}`;
    }
    const found = await runner.execute(sql`SELECT * FROM ${sql.identifier(item.table)} WHERE ${identity(item)}`);
    const change = compareRow(item, found.rows);
    ids.set(original.values.id, change.planned.values.id);
    changes.push(change);
  }
  const staleChunks: string[] = [];
  for (const document of changes.filter(change => change.planned.table === "ai_knowledge_documents")) {
    const existing = await runner.execute(sql`SELECT * FROM ai_knowledge_chunks WHERE document_id = ${document.planned.values.id}`);
    const expected = new Set(changes.filter(change => change.planned.table === "ai_knowledge_chunks" && change.planned.values.document_id === document.planned.values.id).map(change => change.planned.values.id));
    for (const row of existing.rows) {
      requireImport((row.metadata as Record<string, unknown> | undefined)?.sourceKey === document.planned.sourceKey, "UNRELATED_CHUNK_COLLISION");
      requireImport(expected.has(String(row.id)), "LOCALLY_MODIFIED_CHUNKS_REVIEW_REQUIRED");
    }
  }
  return { changes, staleChunks };
}

function parameter(table: TableName, column: string, value: unknown): SQL {
  if (column === "metadata" || (column === "tags" && table === "ai_knowledge_documents")) return sql`${JSON.stringify(value)}::jsonb`;
  if (column === "tags" && table === "kb_articles") return sql`ARRAY[${sql.join((value as string[]).map(tag => sql`${tag}`), sql`, `)}]::text[]`;
  return sql`${value}`;
}

export async function applyDiff(runner: QueryRunner, diff: Diff): Promise<void> {
  for (const change of diff.changes) {
    if (change.kind === "unchanged") continue;
    const { table, values } = change.planned;
    const entries = Object.entries(change.changed);
    if (change.kind === "insert") {
      const names = entries.map(([key]) => sql.identifier(key));
      const parameters = entries.map(([key, value]) => parameter(table, key, value));
      if (table === "kb_articles") { names.push(sql.identifier("published_at")); parameters.push(sql`now()`); }
      if (table === "ai_knowledge_documents") { names.push(sql.identifier("last_indexed_at")); parameters.push(sql`now()`); }
      await runner.execute(sql`INSERT INTO ${sql.identifier(table)} (${sql.join(names, sql`, `)}) VALUES (${sql.join(parameters, sql`, `)})`);
    } else {
      const updates = entries.map(([key, value]) => sql`${sql.identifier(key)} = ${parameter(table, key, value)}`);
      if (table !== "kb_categories" && table !== "ai_knowledge_chunks") updates.push(sql`updated_at = now()`);
      if (table === "ai_knowledge_documents") updates.push(sql`last_indexed_at = now()`);
      await runner.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.join(updates, sql`, `)} WHERE id = ${values.id}`);
    }
  }
  for (const id of diff.staleChunks) await runner.execute(sql`DELETE FROM ai_knowledge_chunks WHERE id = ${id}`);
}

export function summarizeDiff(diff: Diff): Record<string, number> {
  return { insert: diff.changes.filter(change => change.kind === "insert").length,
    update: diff.changes.filter(change => change.kind === "update").length,
    unchanged: diff.changes.filter(change => change.kind === "unchanged").length,
    staleOwnedChunks: diff.staleChunks.length };
}

// Exact database ID only. No title/substring heuristic and no archive/delete path.
export async function inventoryLegacyGuide(runner: QueryRunner, id: string): Promise<Record<string, number>> {
  requireImport(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id), "LEGACY_EXACT_UUID_REQUIRED");
  const result: Record<string, number> = {};
  for (const table of ["resources", "uploads", "kb_articles", "ai_knowledge_documents"] as const) {
    result[table] = (await runner.execute(sql`SELECT id FROM ${sql.identifier(table)} WHERE id = ${id}`)).rows.length;
  }
  return result;
}
