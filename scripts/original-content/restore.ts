import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { ImportError, requireImport } from "../content/private-files";
import { privateWorkPath, publishOriginals, verifyOriginals } from "./files";
import { applyRestoration, planRestoration, validateLocalTarget } from "./database";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    map: { type: "string" }, "original-root": { type: "string" }, "corrected-root": { type: "string" },
    "storage-dir": { type: "string" }, schema: { type: "string" }, report: { type: "string" }, confirm: { type: "string" },
  } });
  const mode = positionals[0] ?? "plan";
  requireImport(positionals.length <= 1 && ["plan", "prepare", "apply-local"].includes(mode), "INVALID_RESTORATION_MODE");
  requireImport(values.map && values["original-root"] && values["corrected-root"] && values.report, "RESTORATION_ARGUMENTS_REQUIRED");
  const report = await privateWorkPath(values.report);
  requireImport(report.endsWith(".json") && report !== path.resolve(values.map), "INVALID_REPORT_PATH");
  const pairs = await verifyOriginals(values.map, values["original-root"], values["corrected-root"]);
  let updated = 0;
  if (mode === "prepare") {
    requireImport(values["storage-dir"] && values.confirm === "copy-original-bytes", "PREPARE_CONFIRMATION_REQUIRED");
    await publishOriginals(pairs, values["storage-dir"], values["original-root"], values["corrected-root"]);
  }
  if (mode === "apply-local") {
    requireImport(values["storage-dir"] && values.schema && values.confirm === "restore-originals-local", "LOCAL_CONFIRMATION_REQUIRED");
    const url = validateLocalTarget(process.env.ORIGINAL_TEST_DATABASE_URL, values.schema);
    requireImport(process.env.STORAGE_PROVIDER === "filesystem" && process.env.PRIVATE_STORAGE_DIR === values["storage-dir"], "RUNTIME_STORAGE_MISMATCH");
    const { createDatabasePool } = await import("@workspace/db/poolConfig");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = createDatabasePool(url.href);
    try {
      await drizzle(pool).transaction(async tx => {
        await tx.execute(sql`SET LOCAL search_path TO ${sql.identifier(values.schema!)}`);
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(726104, 20260910)`);
        const changes = await planRestoration(tx, pairs);
        await publishOriginals(pairs, values["storage-dir"]!, values["original-root"]!, values["corrected-root"]!);
        updated = await applyRestoration(tx, changes);
      }, { isolationLevel: "serializable" });
    } finally { await pool.end(); }
  }
  await writeFile(report, JSON.stringify({ mode, verifiedOriginals: pairs.length, updated,
    files: pairs.map(({ key, originalHash, originalBytes, newFileUrl }) => ({ key, originalHash, originalBytes, newFileUrl })),
    productionApplied: false }, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ mode, verifiedOriginals: pairs.length, updated, productionApplied: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof ImportError ? error.message : "ORIGINAL_RESTORATION_FAILED");
    process.exitCode = 1;
  });
}
