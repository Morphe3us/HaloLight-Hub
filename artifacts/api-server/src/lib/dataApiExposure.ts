import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

const LOCK_DOWN_SCRIPT = "scripts/migrations/2026-10-29-lock-down-data-api.sql";

/**
 * Public tables that Supabase's Data API lets the publishable key (anon) or any
 * signed-in user (authenticated) reach directly, bypassing the Express API:
 * granted to those roles and not closed by RLS without policies.
 */
export async function findDataApiExposedTables(): Promise<string[]> {
  const roles = await db.execute(sql`select rolname from pg_roles where rolname in ('anon', 'authenticated')`);
  // Plain Postgres (local dev, tests) has no Data API roles.
  if (roles.rows.length < 2) return [];
  const result = await db.execute(sql`
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
      and (not c.relrowsecurity or exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
          and p.roles && array['anon', 'authenticated', 'public']::name[]))
    order by 1`);
  return result.rows.map((row) => String(row.name));
}

/** Startup check: logs exposed tables loudly, never blocks the server. */
export async function warnIfDataApiExposed(): Promise<void> {
  try {
    const tables = await findDataApiExposedTables();
    if (tables.length > 0) {
      logger.error({ tables }, `Tables reachable through the Supabase Data API with the public key; run ${LOCK_DOWN_SCRIPT}`);
    }
  } catch (error) {
    logger.warn({ err: error }, "Could not check Supabase Data API exposure");
  }
}
