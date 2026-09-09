import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// ─── Admin-only guard ─────────────────────────────────────────────────────────

async function requireAdmin(req: Request, res: Response): Promise<{ id: string } | null> {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return null; }
  return user;
}

// ─── GET /admin/backup/status ─────────────────────────────────────────────────
// Returns table count and estimated DB size from pg_catalog.

router.get("/admin/backup/status", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    // Count user-created tables (exclude pg_catalog, information_schema)
    const tableCountResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);

    // Get human-readable DB size
    const sizeResult = await db.execute(sql`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
             pg_database_size(current_database()) AS size_bytes
    `);

    const tableCount = Number((tableCountResult.rows[0] as Record<string, unknown>)?.count ?? 0);
    const sizeRow = sizeResult.rows[0] as Record<string, unknown> | undefined;
    const estimatedSize = String(sizeRow?.size ?? "unknown");
    const sizeBytes = Number(sizeRow?.size_bytes ?? 0);

    // Get individual table row counts for the summary
    const tableStatsResult = await db.execute(sql`
      SELECT
        schemaname,
        relname AS table_name,
        n_live_tup AS row_count
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
      LIMIT 20
    `);

    const tables = (tableStatsResult.rows as Array<Record<string, unknown>>).map((r) => ({
      name: String(r.table_name ?? ""),
      rowCount: Number(r.row_count ?? 0),
    }));

    res.json({
      tableCount,
      estimatedSize,
      sizeBytes,
      tables,
      databaseName: process.env.DATABASE_URL
        ? new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "") || "halolight"
        : "halolight",
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch backup status");
    res.status(500).json({ error: "Failed to fetch database status" });
  }
});

// ─── POST /admin/backup/export ────────────────────────────────────────────────
// Returns a shell script / pg_dump command for the admin to run.
// Actual execution happens server-side via cron / CI — not via this endpoint.
// This endpoint records the intent and returns the command.

router.post("/admin/backup/export", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `halolight-backup-${timestamp}.sql`;

    // Return commands that read DATABASE_URL in the execution environment
    // instead of exposing the secret connection string in the API response.
    const requireDatabaseUrl = `: "\${DATABASE_URL:?DATABASE_URL is required}"`;
    const pgDumpCommand = `set -euo pipefail\n${requireDatabaseUrl}\npg_dump "$DATABASE_URL" --no-password --format=custom --compress=9 --file="${filename}"`;
    const tarCommand = `set -euo pipefail\n${requireDatabaseUrl}\npg_dump "$DATABASE_URL" | gzip > "${filename}.gz"`;

    res.json({
      message: "Backup command generated. Run this on your server or in your CI/CD pipeline.",
      filename,
      pgDumpCommand,
      tarCommand,
      instructions: [
        "1. SSH into your server or open a terminal with DATABASE_URL set.",
        "2. Run one of the commands above.",
        `3. Upload the resulting file (${filename}) to S3 or Cloudflare R2.`,
        "4. Verify the backup with: pg_restore --list <file>",
        "5. Set up a cron job to automate this process daily.",
      ],
      automationExample: `0 2 * * * pg_dump "$DATABASE_URL" --format=custom --compress=9 --file="/backups/halolight-$(date +%Y%m%d).dump"`,
      generatedAt: new Date().toISOString(),
      requestedBy: user.id,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate backup export");
    res.status(500).json({ error: "Failed to generate backup command" });
  }
});

export default router;
