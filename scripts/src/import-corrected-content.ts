import { parseArgs } from "node:util";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { buildBundle, stageBundle, STORAGE_PREFIX, summarize } from "../content/manifest";
import { applyDiff, checkSchema, inventoryLegacyGuide, planDatabase, summarizeDiff } from "../content/database";
import { ensurePrivateChild, externalDirectory, ImportError, publishPrivate, readRegular, requireImport, sha256, validateApplyStorage } from "../content/private-files";

export function argumentsFor(argv: string[]) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    source: { type: "string" }, staging: { type: "string" }, "storage-dir": { type: "string" },
    "author-id": { type: "string" }, database: { type: "boolean", default: false },
    target: { type: "string" }, "backup-reference": { type: "string" },
    "confirm-apply": { type: "string" }, "legacy-guide-id": { type: "string" }, help: { type: "boolean", default: false },
  } });
  const mode = positionals[0] ?? "dry-run";
  requireImport(positionals.length <= 1 && ["prepare", "check", "dry-run", "apply"].includes(mode), "INVALID_MODE");
  if (values.help) return { ...values, mode };
  requireImport(values.source && values.staging, "SOURCE_AND_STAGING_REQUIRED");
  requireImport(!values.database || mode === "dry-run", "DATABASE_FLAG_REQUIRES_DRY_RUN");
  requireImport(!values["confirm-apply"] || mode === "apply", "CONFIRM_REQUIRES_APPLY");
  requireImport(!values["storage-dir"] || mode === "apply", "STORAGE_REQUIRES_APPLY");
  requireImport((!values.target && !values["backup-reference"]) || mode === "apply", "TARGET_AND_BACKUP_REQUIRE_APPLY");
  requireImport(!values["legacy-guide-id"] || (mode === "dry-run" && values.database), "LEGACY_INVENTORY_REQUIRES_DATABASE_DRY_RUN");
  if (mode === "apply") requireImport(values["confirm-apply"] === "corrected-content" && values["storage-dir"], "APPLY_CONFIRMATION_AND_STORAGE_REQUIRED");
  if (mode === "apply") {
    requireImport(["local", "staging", "production"].includes(values.target ?? ""), "EXPLICIT_TARGET_REQUIRED");
    if (values.target === "production") requireImport(/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(values["backup-reference"] ?? ""), "PRODUCTION_BACKUP_REFERENCE_REQUIRED");
  }
  if (mode === "apply" || values.database) requireImport(values["author-id"], "AUTHOR_REQUIRED");
  return { ...values, mode };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = argumentsFor(argv);
  if (options.help) {
    console.log("import-corrected-content [prepare|check|dry-run|apply] --source <dir> --staging <private-dir> [--database --author-id <id>] [--storage-dir <private-dir> --target local|staging|production --confirm-apply corrected-content --backup-reference <backup-id>] [--legacy-guide-id <exact-uuid>]\nDefault: offline dry-run. See docs/integration-import.md.");
    return;
  }
  const bundle = await buildBundle(options.source!, options["author-id"]);
  const staging = await stageBundle(bundle, options.staging!, options.source!, options.mode === "prepare");
  const summary: Record<string, unknown> = { mode: options.mode, counts: summarize(bundle) };
  if (options.mode !== "apply" && !options.database) { console.log(JSON.stringify(summary)); return; }
  if (options.mode === "apply") await validateApplyStorage(options["storage-dir"]!, await realpath(options.source!), staging);
  // Database modules and environment are accessed only after explicit DB intent.
  const url = process.env.DATABASE_URL;
  requireImport(url, "DATABASE_URL_REQUIRED");
  const { createDatabasePool } = await import("@workspace/db/poolConfig");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = createDatabasePool(url);
  const db = drizzle(pool);
  try {
    await db.transaction(async tx => {
      if (options.mode !== "apply") await tx.execute(sql`SET TRANSACTION READ ONLY`);
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(726104, 20260910)`);
      await checkSchema(tx, bundle, options["author-id"]!);
      if (options["legacy-guide-id"]) summary.legacyInventory = await inventoryLegacyGuide(tx, options["legacy-guide-id"]);
      const diff = await planDatabase(tx, bundle);
      summary.diff = summarizeDiff(diff);
      if (options.mode === "apply") {
        await validateApplyStorage(options["storage-dir"]!, await realpath(options.source!), staging);
        const storage = await externalDirectory(options["storage-dir"]!, await realpath(options.source!), true);
        await ensurePrivateChild(storage, STORAGE_PREFIX, true);
        for (const pdf of bundle.pdfs) await publishPrivate(path.join(storage, pdf.key), pdf.bytes);
        for (const pdf of bundle.pdfs) requireImport(sha256(await readRegular(path.join(storage, pdf.key))) === pdf.hash, "STORAGE_HASH_MISMATCH");
        await applyDiff(tx, diff);
      }
    }, { isolationLevel: "serializable" });
    console.log(JSON.stringify(summary));
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    // Native errors may contain SQL, credentials or filesystem paths. Never print them.
    console.error(error instanceof ImportError ? error.message : "IMPORT_FAILED: validation, filesystem or database operation failed; no sensitive details emitted");
    process.exitCode = 1;
  });
}
