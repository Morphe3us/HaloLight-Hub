-- Close Supabase's Data API (PostgREST) over the app tables.
--
-- The browser only uses Supabase Auth; every data query goes through the
-- Express API, which connects as the table owner (postgres) and is therefore
-- not affected by RLS or by the anon/authenticated grants below. Supabase,
-- however, grants anon and authenticated full access to new public tables by
-- default, and the publishable key that reaches those roles ships in the
-- frontend bundle. Without this file, anyone holding that key could call
-- https://<ref>.supabase.co/rest/v1/<table> directly whenever RLS is off.
--
-- Idempotent and data-free: changes privileges only. Run it once in the
-- Supabase SQL editor (as postgres), or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/2026-10-29-lock-down-data-api.sql
-- Re-run after drizzle-kit creates new tables to switch RLS on for them too
-- (the default-privilege change already keeps them out of the Data API).

BEGIN;

-- RLS with no policy denies every row to anon/authenticated; the owner bypasses it.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Tables and sequences drizzle-kit creates later (as postgres) start without Data API access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

COMMIT;

-- Check: every row must show rls = true, anon_read = false, anon_write = false.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_read,
       has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE')
         OR has_table_privilege('anon', c.oid, 'DELETE') AS anon_write
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY (c.relrowsecurity AND NOT has_table_privilege('anon', c.oid, 'SELECT')), c.relname;
