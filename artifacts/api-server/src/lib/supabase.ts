import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let publicClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

export function supabaseUrl(): string {
  const value = process.env.SUPABASE_URL;
  const localMode = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  // Validate raw input before URL normalization can hide credentials or paths.
  const hosted = typeof value === "string" && /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(value);
  const loopback = localMode && typeof value === "string" &&
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?\/?$/.test(value);
  if (hosted || loopback) {
    try { return new URL(value!).origin; } catch { /* Reject invalid ports. */ }
  }
  throw new Error("Authentication is not configured");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validKey(key: string | undefined, admin: boolean, url: string): key is string {
  if (!key || key.length > 4096) return false;
  const prefix = admin ? /^sb_secret_[A-Za-z0-9_-]+$/ : /^sb_publishable_[A-Za-z0-9_-]+$/;
  if (prefix.test(key)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const [encodedHeader, encodedPayload] = key.split(".");
    const header: unknown = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!record(header) || header.alg !== "HS256" || header.typ !== "JWT" || !record(payload)) return false;
    // Configuration rejection checks only, not signature verification. Supabase
    // must authenticate the key; decoding must never grant application permissions.
    const hostname = new URL(url).hostname;
    const matchingProject = hostname.endsWith(".supabase.co")
      ? payload.iss === "supabase" && payload.ref === hostname.split(".")[0]
      : (payload.iss === "supabase" || payload.iss === "supabase-demo") &&
        (payload.ref === undefined || payload.ref === "supabase-demo");
    return matchingProject && payload.role === (admin ? "service_role" : "anon") &&
      typeof payload.exp === "number" && Number.isSafeInteger(payload.exp) && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

function client(admin: boolean): SupabaseClient {
  const url = supabaseUrl();
  const key = admin ? process.env.SUPABASE_SECRET_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!validKey(key, admin, url)) throw new Error("Authentication is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
  });
}

// Keep the verifier alive so the SDK can reuse its JWKS cache. Never set a session.
export function getSupabase(): SupabaseClient {
  return publicClient ??= client(false);
}

export function getSupabaseAdmin(): SupabaseClient {
  return adminClient ??= client(true);
}

export function invitationRedirectUrl(): string {
  const value = process.env.APP_PUBLIC_URL?.trim();
  if (!value) throw new Error("Invitations are not configured");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Invitations are not configured");
  }
  return new URL("/auth/invite", url.origin).href;
}
