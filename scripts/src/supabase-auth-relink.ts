import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseRelinkOptions, validateSupabaseConfig, runRelink, safeRelinkError } from "../auth-migration/relink";

const HELP = `One-account Supabase Auth relink (dry-run by default).

node --import tsx scripts/src/supabase-auth-relink.ts \\
  --local-user-id <exact-local-uuid> \\
  --expected-auth-id <exact-existing-auth-id> \\
  --new-auth-id <supabase-user-uuid>

Apply additionally requires: --apply --backup-reference <existing-backup-reference>
Environment: DATABASE_URL, SUPABASE_URL and SUPABASE_SECRET_KEY.
SUPABASE_URL must be the explicitly trusted https://<20-character-project-ref>.supabase.co.
SUPABASE_SECRET_KEY must be sb_secret_... or that project's legacy service_role JWT.
UUIDs must be canonical lowercase. Legacy IDs may include letters, digits, _ and -.
No env files are loaded. Credentials must never be passed as CLI arguments.
Dry-run reads the database and Supabase Admin API; it performs no database writes.
The backup reference is an operator attestation, not backup creation/verification.
Only authId (physical clerk_id column) changes. Local ID, role, active status,
timestamps and data ownership are preserved. Supabase users are never modified.
No automatic retries. A repeated completed mapping fails its old-ID precondition.`;

export async function main(argv = process.argv.slice(2), env = process.env): Promise<void> {
  if (argv.length === 1 && argv[0] === "--help") {
    console.log(HELP);
    return;
  }
  const options = parseRelinkOptions(argv);
  validateSupabaseConfig(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_REQUIRED");

  // Import only the pool factory, never the runtime DB initializer or dotenv.
  const { createDatabasePool } = await import("@workspace/db/poolConfig");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = createDatabasePool(env.DATABASE_URL);
  try {
    const database = drizzle(pool);
    const result = await runRelink(options, {
      supabaseUrl: env.SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
      fetch: globalThis.fetch,
      transaction: (work, config) => database.transaction(work, config),
    });
    console.log(JSON.stringify(result));
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(safeRelinkError(error));
    process.exitCode = 1;
  });
}
