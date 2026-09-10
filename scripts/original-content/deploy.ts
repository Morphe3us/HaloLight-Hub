import path from "node:path";
import os from "node:os";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { activateOfficialOriginals } from "../../artifacts/api-server/src/lib/ai/originalIndex";
import { readOfficialIndex, officialContent, OFFICIAL_INDEX_REVISION, type OfficialOriginal } from "../../artifacts/api-server/src/lib/ai/officialOriginals";
import { externalDirectory, ensurePrivateChild, publishPrivate, readRegular, requireImport, sha256, ImportError } from "../content/private-files";
import { verifyOriginals, type VerifiedPair } from "./files";
import { planRestoration, applyRestoration, type Runner, type Change } from "./database";
import { ORIGINAL_PREFIX, PINS } from "./pins";

export const PRODUCTION_APP = "/srv/customer/sites/hub.halolightbooth.com";
export const PRODUCTION_STORAGE = "/srv/customer/.local/share/halohub-private-files";
export const PRODUCTION_WORK = "/srv/customer/.HaloHub";
const TABLES = ["uploads", "resources", "kb_articles", "ai_knowledge_documents", "ai_knowledge_chunks", "ai_knowledge_tags"] as const;

export function targetFingerprint(value: string | undefined): string {
  requireImport(value, "DATABASE_TARGET_REQUIRED");
  const url = new URL(value);
  requireImport(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname && url.username && url.pathname.length > 1 && !url.hash, "INVALID_PRODUCTION_DATABASE_URL");
  requireImport([...url.searchParams].length <= 1 && [...url.searchParams].every(([key, value]) => key === "sslmode" && ["require", "verify-ca", "verify-full"].includes(value)), "DATABASE_URL_OPTIONS_REJECTED");
  // Match the lead's already-compared local/remote target fingerprint exactly.
  // URL parsing normalizes hostname; password and query credentials are absent.
  return sha256(`${url.hostname}:${url.port}/${url.pathname}/${url.username}`);
}

export function validateProductionTarget(env: NodeJS.ProcessEnv, approvedHash: string, cwd: string): URL {
  requireImport(env.NODE_ENV === "production" && cwd === PRODUCTION_APP, "PRODUCTION_APPLICATION_GUARD");
  requireImport(env.STORAGE_PROVIDER === "filesystem" && env.PRIVATE_STORAGE_DIR === PRODUCTION_STORAGE, "PRODUCTION_STORAGE_GUARD");
  requireImport(env.DATABASE_URL && /^[a-f0-9]{64}$/.test(approvedHash) && targetFingerprint(env.DATABASE_URL) === approvedHash, "PRODUCTION_DATABASE_FINGERPRINT_GUARD");
  const url = new URL(env.DATABASE_URL);
  requireImport(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname && url.username && url.pathname.length > 1 && !url.hash, "INVALID_PRODUCTION_DATABASE_URL");
  requireImport([...url.searchParams].every(([key, value]) => key === "sslmode" && ["require", "verify-ca", "verify-full"].includes(value)), "DATABASE_URL_OPTIONS_REJECTED");
  return url;
}

// Refuse symlink ancestors, hardlinked outputs, source-root outputs and existing
// filenames. Backup/receipt files never overwrite earlier runs or corpus data.
export async function privatePath(input: string, work: string): Promise<string> {
  requireImport(path.isAbsolute(input) && path.resolve(work) === await realpath(work), "PRIVATE_WORK_ROOT_REQUIRED");
  const resolved = path.resolve(input);
  requireImport(resolved.startsWith(`${work}${path.sep}`), "PRIVATE_OUTPUT_REQUIRED");
  let parent = path.dirname(resolved);
  while (parent !== path.dirname(work)) {
    const info = await lstat(parent);
    requireImport(info.isDirectory() && !info.isSymbolicLink(), "PRIVATE_PATH_SYMLINK");
    if (parent === work) break;
    parent = path.dirname(parent);
  }
  requireImport(((await lstat(work)).mode & 0o077) === 0, "PRIVATE_WORK_PERMISSIONS");
  return resolved;
}

export async function writeFreshJson(file: string, value: unknown): Promise<string> {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  const directory = await open(path.dirname(file), constants.O_RDONLY);
  try { await directory.sync(); } finally { await directory.close(); }
  requireImport((await readRegular(file)).equals(bytes), "BACKUP_VERIFICATION_FAILED");
  return sha256(bytes);
}

interface Bridge { id: string; content: string }
export interface DeploymentPlan {
  changes: Change[];
  bridges: Bridge[];
  before: Record<string, Record<string, unknown>[]>;
}

export async function planDeployment(tx: Runner, pairs: VerifiedPair[], documents: OfficialOriginal[], lock = true): Promise<DeploymentPlan> {
  requireImport(pairs.length === 15 && documents.length === 15 && new Set(documents.map(d => d.sourceKey)).size === 15, "EXACT_15_REQUIRED");
  for (const pin of PINS) {
    const p = pairs.find(p => p.key === pin.key);
    requireImport(p?.originalHash === pin.originalHash && p.originalBytes === pin.originalBytes, "ORIGINAL_PIN_MISMATCH");
    requireImport(documents.some(d => d.sourceKey === p.sourceKey && d.originalSha256 === p.originalHash && d.fileUrl === p.newFileUrl), "INDEX_PAIR_MISMATCH");
  }
  const changes = await planRestoration(tx, pairs, lock);
  const before = Object.fromEntries(TABLES.map(table => [table, []])) as DeploymentPlan["before"];
  for (const change of changes) before[change.table]!.push(change.before);
  const bridges: Bridge[] = [];
  const seen = new Set<string>();
  for (const doc of documents) {
    const change = changes.find(c => c.table === "kb_articles" && c.before.source_key === doc.sourceKey)!;
    const article = change.before;
    const marker = `[sourceKey=${doc.sourceKey}]`;
    const sourceUrl = `/kb/articles/${article.id}`;
    const linked = (await tx.execute(sql`SELECT * FROM ai_knowledge_documents WHERE source_url = ${sourceUrl} OR source_url = ${`kb:${article.id}`} OR tags @> ${JSON.stringify([marker])}::jsonb${lock ? sql` FOR UPDATE` : sql``}`)).rows;
    requireImport(linked.length <= 1, "AMBIGUOUS_LINKED_DOCUMENT");
    const existing = linked[0];
    requireImport(article.language === "fr", "ARTICLE_LANGUAGE_MISMATCH");
    const indexed = article.source_revision === OFFICIAL_INDEX_REVISION;
    if (indexed) {
      const content = officialContent(doc).content;
      requireImport(article.content === content && existing?.content === content, "INDEXED_CONTENT_DRIFT");
    } else {
      requireImport(article.source_revision === "2026-09-10" && article.status === "published", "ARTICLE_NOT_APPROVED_FOR_ACTIVATION");
    }
    if (existing) {
      requireImport(typeof existing.id === "string" && !seen.has(existing.id), "LINKED_DOCUMENT_REUSED");
      seen.add(existing.id);
      requireImport(existing.title === article.title && existing.language === "fr" && existing.source_url === sourceUrl && Array.isArray(existing.tags) && existing.tags.includes(marker), "LINKED_DOCUMENT_IDENTITY_MISMATCH");
      const restoredContent = change.updates.content ?? article.content;
      requireImport(existing.content === article.content || existing.content === restoredContent, "LINKED_DOCUMENT_CONTENT_DRIFT");
      if (existing.content !== restoredContent) bridges.push({ id: existing.id, content: String(restoredContent) });
      before.ai_knowledge_documents!.push(existing);
      for (const table of ["ai_knowledge_chunks", "ai_knowledge_tags"] as const) {
        before[table]!.push(...(await tx.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE document_id = ${existing.id}${lock ? sql` FOR UPDATE` : sql``}`)).rows);
      }
    }
  }
  return { changes, bridges, before };
}

export async function applyDeployment(tx: Runner, plan: DeploymentPlan, documents: OfficialOriginal[]) {
  const restored = await applyRestoration(tx, plan.changes);
  for (const bridge of plan.bridges) {
    const result = await tx.execute(sql`UPDATE ai_knowledge_documents SET content = ${bridge.content} WHERE id = ${bridge.id} RETURNING id`);
    requireImport(result.rows.length === 1, "LINKED_DOCUMENT_DISAPPEARED");
  }
  const activated = await activateOfficialOriginals(tx, documents);
  return { restored, bridged: plan.bridges.length, activated };
}

export async function deploymentTransaction(tx: Runner, pairs: VerifiedPair[], documents: OfficialOriginal[], options: {
  apply: boolean; backup: (plan: DeploymentPlan) => Promise<void>; publish: () => Promise<void>;
}) {
  await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
  await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
  if (options.apply) await tx.execute(sql`SELECT pg_advisory_xact_lock(726104, 20260910)`);
  // Briefly block writers, not readers, so the targeted backup and all linked
  // rows form one stable before-image, including currently absent documents.
  if (options.apply) await tx.execute(sql`LOCK TABLE ${sql.join(TABLES.map(t => sql.identifier(t)), sql`, `)} IN SHARE ROW EXCLUSIVE MODE`);
  const plan = await planDeployment(tx, pairs, documents, options.apply);
  if (!options.apply) return { planned: true, restored: plan.changes.filter(c => Object.keys(c.updates).length).length, bridged: plan.bridges.length, activated: documents.filter(d => plan.changes.find(c => c.table === "kb_articles" && c.before.source_key === d.sourceKey)!.before.source_revision !== OFFICIAL_INDEX_REVISION).length };
  await options.backup(plan);
  await options.publish();
  return { planned: false, ...await applyDeployment(tx, plan, documents) };
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    target: { type: "string" }, map: { type: "string" }, index: { type: "string" },
    "original-root": { type: "string" }, "corrected-root": { type: "string" },
    report: { type: "string" }, backup: { type: "string" }, confirm: { type: "string" },
  } });
  const mode = positionals[0];
  if (mode === "target-fingerprint") {
    requireImport(positionals.length === 1 && values.report, "FINGERPRINT_REPORT_REQUIRED");
    const work = process.cwd() === PRODUCTION_APP ? PRODUCTION_WORK : path.join(os.homedir(), ".HaloHub");
    const report = await privatePath(values.report, work);
    requireImport(path.dirname(report) === work && report.endsWith(".json"), "PRIVATE_APPROVAL_JSON_REQUIRED");
    await writeFreshJson(report, { targetSha256: targetFingerprint(process.env.DATABASE_URL) });
    console.log("DATABASE_TARGET_FINGERPRINT_WRITTEN_NO_CONNECTION");
    return;
  }
  requireImport(positionals.length === 1 && ["plan-production", "apply-production"].includes(mode!), "DEPLOYMENT_MODE_REQUIRED");
  requireImport(values.target && values.map && values.index && values["original-root"] && values["corrected-root"] && values.report, "DEPLOYMENT_ARGUMENTS_REQUIRED");
  const apply = mode === "apply-production";
  requireImport(!apply || values.confirm === "restore-exact-15-originals-and-index-production", "EXPLICIT_PRODUCTION_CONFIRMATION_REQUIRED");
  for (const input of [values.target, values.map, values.index]) await privatePath(input, PRODUCTION_WORK);
  for (const root of [values["original-root"], values["corrected-root"]]) await privatePath(path.join(root, "sentinel"), PRODUCTION_WORK);
  const report = await privatePath(values.report, PRODUCTION_WORK);
  requireImport(report.endsWith(".json"), "JSON_REPORT_REQUIRED");
  const target = JSON.parse((await readRegular(values.target)).toString("utf8"));
  const url = validateProductionTarget(process.env, target.targetSha256, await realpath(process.cwd()));
  const pairs = await verifyOriginals(values.map, values["original-root"], values["corrected-root"]);
  const documents = readOfficialIndex(await readRegular(values.index));
  const backup = apply ? await privatePath(values.backup ?? "", PRODUCTION_WORK) : undefined;
  requireImport(!backup || backup.endsWith(".json") && backup !== report, "DISTINCT_JSON_BACKUP_REQUIRED");
  for (const output of [report, backup].filter(Boolean) as string[]) {
    for (const root of [values["original-root"], values["corrected-root"]]) requireImport(!output.startsWith(`${path.resolve(root)}${path.sep}`), "OUTPUT_INSIDE_CORPUS");
  }
  const storage = await externalDirectory(PRODUCTION_STORAGE, await realpath(values["original-root"]), false);
  requireImport(storage === PRODUCTION_STORAGE, "PRODUCTION_STORAGE_ALIAS_REJECTED");
  await externalDirectory(storage, await realpath(values["corrected-root"]), false);
  // Reserve the receipt before opening the database; an existing path aborts.
  await writeFreshJson(report, { mode, state: "started", targetSha256: target.targetSha256, productionCommitted: false });
  const receipt = await open(`${report}.result.json`, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const { createDatabasePool } = await import("@workspace/db/poolConfig");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = createDatabasePool(url.href);
  let backupHash: string | undefined;
  try {
    const result = await drizzle(pool).transaction(async tx => {
      await tx.execute(sql`SET LOCAL search_path TO public`);
      const identity = (await tx.execute(sql`SELECT current_database() AS name, pg_is_in_recovery() AS replica`)).rows[0];
      requireImport(identity?.name === decodeURIComponent(url.pathname.slice(1)) && identity?.replica === false, "DATABASE_IDENTITY_MISMATCH");
      return deploymentTransaction(tx, pairs, documents, {
        apply,
        backup: async plan => {
          backupHash = await writeFreshJson(backup!, { version: 1, kind: "original-restoration-before-image", createdAt: new Date().toISOString(), targetSha256: target.targetSha256, schema: "public", sourceKeys: documents.map(d => d.sourceKey), rows: plan.before });
        },
        publish: async () => {
          const directory = await ensurePrivateChild(storage, ORIGINAL_PREFIX, true);
          for (const p of pairs) {
            requireImport(sha256(p.bytes) === p.originalHash, "ORIGINAL_BYTES_CHANGED");
            await publishPrivate(path.join(directory, `${p.originalHash}.pdf`), p.bytes);
          }
          const handle = await open(directory, constants.O_RDONLY);
          try { await handle.sync(); } finally { await handle.close(); }
        },
      });
    }, { isolationLevel: "serializable", accessMode: apply ? "read write" : "read only" });
    // Separate receipt avoids overwriting any private input or backup. A lost
    // connection/receipt error never claims rollback; inspect DB then re-plan.
    await receipt.writeFile(JSON.stringify({ ...result, backupHash, productionCommitted: apply, targetSha256: target.targetSha256 }, null, 2) + "\n");
    await receipt.sync();
    console.log(JSON.stringify({ ...result, productionCommitted: apply }));
  } finally { await pool.end(); await receipt.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => {
  console.error(error instanceof ImportError ? error.message : "DEPLOYMENT_FAILED_OR_COMMIT_UNCERTAIN_REPLAN_REQUIRED");
  process.exitCode = 1;
});
