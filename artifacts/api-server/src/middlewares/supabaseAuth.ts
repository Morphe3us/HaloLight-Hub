import type { NextFunction, Request, Response } from "express";
import { getSupabase, supabaseUrl } from "../lib/supabase";

export type VerifiedAuth = {
  userId: string;
  accessToken: string;
  sessionClaims: Record<string, unknown>;
};

const authByRequest = new WeakMap<Request, VerifiedAuth>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getAuth(req: Request): VerifiedAuth | undefined {
  return authByRequest.get(req);
}

export async function supabaseAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  authByRequest.delete(req);
  const header = req.headers.authorization;
  if (header === undefined) { next(); return; }
  const match = typeof header === "string" && header.match(/^Bearer ([^\s,]+)$/i);
  if (!match || match[1].length > 16384) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  let issuer: string;
  let client: ReturnType<typeof getSupabase>;
  try {
    issuer = `${supabaseUrl()}/auth/v1`;
    client = getSupabase();
  } catch {
    res.status(503).json({ error: "Authentication unavailable" }); return;
  }
  try {
    // JWKS verification cannot detect remote logout before JWT expiry. Local
    // inactive/role checks still run against the DB on authenticated requests.
    const { data, error } = await client.auth.getClaims(match[1]);
    const claims = data?.claims;
    const now = Math.floor(Date.now() / 1000);
    if (error || !claims || claims.iss !== issuer ||
      !(claims.aud === "authenticated" || (Array.isArray(claims.aud) && claims.aud.includes("authenticated"))) ||
      typeof claims.sub !== "string" || !uuid.test(claims.sub) || claims.is_anonymous !== false || claims.role !== "authenticated" ||
      typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= now ||
      (claims.nbf !== undefined && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > now))) {
      res.status(401).json({ error: "Unauthorized" }); return;
    }
    authByRequest.set(req, { userId: claims.sub, accessToken: match[1], sessionClaims: claims });
  } catch {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  next();
}
