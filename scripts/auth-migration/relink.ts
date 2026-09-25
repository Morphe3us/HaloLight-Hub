import { isDeepStrictEqual, parseArgs } from "node:util";
import { sql, type SQL } from "drizzle-orm";

export interface RelinkOptions {
  localUserId: string;
  expectedAuthId: string;
  newAuthId: string;
  apply: boolean;
  backupReference?: string;
}

export interface Runner {
  execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface RelinkResult {
  mode: "dry-run" | "apply";
  validated: 1;
  updated: 0 | 1;
}

export interface RelinkDependencies {
  supabaseUrl: string | undefined;
  secretKey: string | undefined;
  fetch: typeof fetch;
  transaction: (
    work: (tx: Runner) => Promise<RelinkResult>,
    config: { isolationLevel: "serializable"; accessMode: "read only" | "read write" },
  ) => Promise<RelinkResult>;
}

const failures = {
  ARGUMENTS_INVALID: "Invalid migration arguments; use --help.",
  SUPABASE_URL_INVALID: "An explicit trusted hosted HTTPS Supabase project URL is required.",
  ADMIN_KEY_REQUIRED: "A Supabase secret key or matching legacy service_role key is required.",
  BACKUP_REFERENCE_REQUIRED: "Apply requires a nonempty backup reference.",
  LOCAL_IDENTITY_MISMATCH: "The exact local identity precondition failed.",
  EMAIL_AMBIGUOUS: "The local email is invalid or ambiguous.",
  TARGET_ALREADY_LINKED: "The target identity is already linked.",
  SUPABASE_LOOKUP_FAILED: "Supabase identity lookup failed.",
  SUPABASE_IDENTITY_MISMATCH: "Supabase identity verification failed.",
  EMAIL_MISMATCH: "The verified email does not match the local account.",
  UPDATE_PRECONDITION_FAILED: "The update precondition failed.",
  UNEXPECTED_ROW_CHANGE: "A field other than the identity binding changed.",
} as const;

type FailureCode = keyof typeof failures;
class RelinkError extends Error {
  constructor(readonly code: FailureCode) { super(failures[code]); }
}

function requireRelink(condition: unknown, code: FailureCode): asserts condition {
  if (!condition) throw new RelinkError(code);
}

export function safeRelinkError(error: unknown): string {
  return error instanceof RelinkError
    ? `${error.code}: ${failures[error.code]}`
    : "RELINK_FAILED_OR_COMMIT_UNCERTAIN: Inspect the account before retrying; no automatic retry was performed.";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function validateRelinkOptions(options: RelinkOptions): void {
  for (const id of [options.localUserId, options.newAuthId]) {
    requireRelink(typeof id === "string" && UUID.test(id), "ARGUMENTS_INVALID");
  }
  requireRelink(typeof options.expectedAuthId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,254}$/.test(options.expectedAuthId), "ARGUMENTS_INVALID");
  requireRelink(options.expectedAuthId !== options.newAuthId && typeof options.apply === "boolean", "ARGUMENTS_INVALID");
  const reference = options.backupReference;
  requireRelink(reference === undefined || (typeof reference === "string" &&
    reference.trim().length > 0 && reference.length <= 512 && !/[\x00-\x1f\x7f]/.test(reference)), "ARGUMENTS_INVALID");
  requireRelink(!options.apply || reference !== undefined, "BACKUP_REFERENCE_REQUIRED");
}

export function parseRelinkOptions(argv: string[]): RelinkOptions {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, strict: true, allowPositionals: false, tokens: true, options: {
      "local-user-id": { type: "string" },
      "expected-auth-id": { type: "string" },
      "new-auth-id": { type: "string" },
      apply: { type: "boolean" },
      "backup-reference": { type: "string" },
    } });
  } catch { throw new RelinkError("ARGUMENTS_INVALID"); }
  const names = parsed.tokens.filter(token => token.kind === "option").map(token => token.name);
  requireRelink(new Set(names).size === names.length, "ARGUMENTS_INVALID");
  const options: RelinkOptions = {
    localUserId: parsed.values["local-user-id"] ?? "",
    expectedAuthId: parsed.values["expected-auth-id"] ?? "",
    newAuthId: parsed.values["new-auth-id"] ?? "",
    apply: parsed.values.apply ?? false,
    backupReference: parsed.values["backup-reference"],
  };
  validateRelinkOptions(options);
  return options;
}

export function validateSupabaseConfig(supabaseUrl: string | undefined, secretKey: string | undefined): {
  url: string; headers: Record<string, string>;
} {
  // Match the raw value so URL normalization cannot hide credentials, paths,
  // encoded hosts, ports, query strings, fragments or surrounding whitespace.
  requireRelink(typeof supabaseUrl === "string" &&
    /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(supabaseUrl), "SUPABASE_URL_INVALID");
  requireRelink(typeof secretKey === "string" && secretKey.length <= 4096, "ADMIN_KEY_REQUIRED");
  const url = supabaseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { apikey: secretKey, Accept: "application/json" };
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey)) return { url, headers };
  try {
    requireRelink(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(secretKey), "ADMIN_KEY_REQUIRED");
    const [encodedHeader, encodedPayload] = secretKey.split(".");
    const header: unknown = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    // These are rejection checks, not signature verification. The hosted admin
    // endpoint must authenticate the key before its identity response is trusted.
    requireRelink(record(header) && header.alg === "HS256" && header.typ === "JWT" &&
      record(payload) && payload.role === "service_role" && payload.iss === "supabase" &&
      payload.ref === new URL(url).hostname.split(".")[0] &&
      typeof payload.exp === "number" && Number.isSafeInteger(payload.exp) && payload.exp > Date.now() / 1000,
    "ADMIN_KEY_REQUIRED");
    headers.Authorization = `Bearer ${secretKey}`;
    return { url, headers };
  } catch { throw new RelinkError("ADMIN_KEY_REQUIRED"); }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(email) && !email.endsWith("@placeholder.com") ? email : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): number {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? Date.parse(value) : NaN;
}

export function verifiedEmail(identity: unknown, expectedId: string): string {
  const now = Date.now();
  requireRelink(record(identity) && identity.id === expectedId && identity.is_anonymous === false &&
    identity.deleted_at == null && timestamp(identity.email_confirmed_at) <= now &&
    (identity.banned_until == null || timestamp(identity.banned_until) <= now), "SUPABASE_IDENTITY_MISMATCH");
  const email = normalizeEmail(identity.email);
  requireRelink(email, "SUPABASE_IDENTITY_MISMATCH");
  return email;
}

async function lookupIdentity(id: string, config: ReturnType<typeof validateSupabaseConfig>, fetcher: typeof fetch): Promise<unknown> {
  try {
    const response = await fetcher(`${config.url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: config.headers,
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    requireRelink(response.status === 200, "SUPABASE_LOOKUP_FAILED");
    return await response.json();
  } catch { throw new RelinkError("SUPABASE_LOOKUP_FAILED"); }
}

export async function runRelink(options: RelinkOptions, dependencies: RelinkDependencies): Promise<RelinkResult> {
  validateRelinkOptions(options);
  const config = validateSupabaseConfig(dependencies.supabaseUrl, dependencies.secretKey);
  return dependencies.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '15s'`);
    const selected = await tx.execute(sql`SELECT * FROM public.users WHERE id = ${options.localUserId}${options.apply ? sql` FOR UPDATE` : sql``}`);
    const before = selected.rows[0];
    requireRelink(selected.rows.length === 1 && before?.id === options.localUserId &&
      before.clerk_id === options.expectedAuthId, "LOCAL_IDENTITY_MISMATCH");
    const email = normalizeEmail(before.email);
    requireRelink(email, "EMAIL_AMBIGUOUS");
    // Use the identical normalization for all candidates; PostgreSQL btrim
    // does not remove the same whitespace as JavaScript trim.
    const candidates = await tx.execute(sql`SELECT id, email FROM public.users`);
    const matches = candidates.rows.filter(candidate => normalizeEmail(candidate.email) === email);
    requireRelink(matches.length === 1 && matches[0]?.id === options.localUserId, "EMAIL_AMBIGUOUS");
    const target = await tx.execute(sql`SELECT id FROM public.users WHERE clerk_id = ${options.newAuthId}`);
    requireRelink(target.rows.length === 0, "TARGET_ALREADY_LINKED");
    const identity = await lookupIdentity(options.newAuthId, config, dependencies.fetch);
    requireRelink(verifiedEmail(identity, options.newAuthId) === email, "EMAIL_MISMATCH");
    if (!options.apply) return { mode: "dry-run", validated: 1, updated: 0 };

    // Raw SQL deliberately avoids Drizzle's updatedAt hook. Every other field
    // must remain equivalent, including role and active status.
    const updated = await tx.execute(sql`
      UPDATE public.users SET clerk_id = ${options.newAuthId}
      WHERE id = ${options.localUserId} AND clerk_id = ${options.expectedAuthId}
        AND email = ${before.email}
        AND NOT EXISTS (SELECT 1 FROM public.users WHERE clerk_id = ${options.newAuthId})
      RETURNING *
    `);
    requireRelink(updated.rows.length === 1, "UPDATE_PRECONDITION_FAILED");
    requireRelink(isDeepStrictEqual(updated.rows[0], { ...before, clerk_id: options.newAuthId }), "UNEXPECTED_ROW_CHANGE");
    const persisted = await tx.execute(sql`SELECT * FROM public.users WHERE id = ${options.localUserId} FOR UPDATE`);
    requireRelink(persisted.rows.length === 1 &&
      isDeepStrictEqual(persisted.rows[0], { ...before, clerk_id: options.newAuthId }), "UNEXPECTED_ROW_CHANGE");
    return { mode: "apply", validated: 1, updated: 1 };
  }, { isolationLevel: "serializable", accessMode: options.apply ? "read write" : "read only" });
}
