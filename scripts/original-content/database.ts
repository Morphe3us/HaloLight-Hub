import { sql, type SQL } from "drizzle-orm";
import { requireImport } from "../content/private-files";
import { sourceKeyFrom, type OriginalPair } from "./files";

export interface Runner { execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }> }
type Table = "uploads" | "resources" | "kb_articles";
export interface Change { table: Table; id: string; before: Record<string, unknown>; updates: Record<string, unknown> }

export function validateLocalTarget(value: string | undefined, schema: string): URL {
  requireImport(value, "EXPLICIT_LOCAL_DATABASE_REQUIRED");
  const url = new URL(value);
  requireImport(["postgres:", "postgresql:"].includes(url.protocol) &&
    ["127.0.0.1", "[::1]"].includes(url.hostname) && /^\d+$/.test(url.port) &&
    Number(url.port) >= 1024 && Number(url.port) <= 65535 && url.port !== "5432" &&
    !url.search && !url.hash && /^original_restore_test_[a-z0-9]+$/.test(schema), "DISPOSABLE_DATABASE_REQUIRED");
  return url;
}

function changed(row: Record<string, unknown>, values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => row[key] !== value));
}

export async function planRestoration(runner: Runner, pairs: OriginalPair[], lock = true): Promise<Change[]> {
  const changes: Change[] = [];
  for (const p of pairs) {
    for (const table of ["uploads", "resources", "kb_articles"] as const) {
      const lookup = table === "kb_articles" ? sql`source_key = ${p.sourceKey}` :
        sql`file_url IN (${p.oldFileUrl}, ${p.newFileUrl}) OR description LIKE ${`[sourceKey=${p.sourceKey}] %`}`;
      const rows = (await runner.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE ${lookup}${lock ? sql` FOR UPDATE` : sql``}`)).rows;
      requireImport(rows.length === 1 && typeof rows[0]!.id === "string", "EXACT_OWNED_ROW_REQUIRED");
      const row = rows[0]!;
      requireImport(table === "kb_articles" ? row.source_key === p.sourceKey : sourceKeyFrom(row.description) === p.sourceKey, "FOREIGN_METADATA_COLLISION");
      let values: Record<string, unknown>;
      if (table === "kb_articles") {
        requireImport(typeof row.content === "string" && [p.correctedHash, p.originalHash].includes(String(row.source_hash)), "ARTICLE_REVIEW_REQUIRED");
        requireImport(row.content.includes(p.oldFileUrl) || row.content.includes(p.newFileUrl), "ARTICLE_LINK_REVIEW_REQUIRED");
        values = { content: row.content.replaceAll(p.oldFileUrl, p.newFileUrl), source_hash: p.originalHash };
      } else {
        requireImport([p.oldFileUrl, p.newFileUrl].includes(String(row.file_url)), "FILE_URL_REVIEW_REQUIRED");
        const description = String(row.description);
        const hashes = [...description.matchAll(/\bsha256=([a-f0-9]{64})\b/g)];
        requireImport(hashes.length === 1 && [p.correctedHash, p.originalHash].includes(hashes[0]![1]!), "DESCRIPTION_HASH_REVIEW_REQUIRED");
        values = { file_url: p.newFileUrl, description: description.replace(`sha256=${hashes[0]![1]}`, `sha256=${p.originalHash}`) };
        if (table === "uploads") {
          requireImport(row.mime_type === "application/pdf" &&
            [p.correctedBytes, p.originalBytes].includes(Number(row.file_size)), "UPLOAD_METADATA_REVIEW_REQUIRED");
          values.file_size = p.originalBytes;
        }
      }
      changes.push({ table, id: String(row.id), before: row, updates: changed(row, values) });
    }
  }
  return changes;
}

export async function applyRestoration(runner: Runner, changes: Change[]): Promise<number> {
  let count = 0;
  for (const change of changes) {
    const entries = Object.entries(change.updates);
    if (!entries.length) continue;
    const assignments = entries.map(([key, value]) => sql`${sql.identifier(key)} = ${value}`);
    const result = await runner.execute(sql`UPDATE ${sql.identifier(change.table)} SET ${sql.join(assignments, sql`, `)}, updated_at = now() WHERE id = ${change.id} RETURNING id`);
    requireImport(result.rows.length === 1, "RESTORATION_ROW_DISAPPEARED");
    count++;
  }
  return count;
}
