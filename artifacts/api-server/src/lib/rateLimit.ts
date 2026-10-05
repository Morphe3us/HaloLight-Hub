import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { getAuth } from "../middlewares/supabaseAuth";

export const RATE_LIMITED_RESPONSE = {
  error: "Too Many Requests",
  code: "RATE_LIMITED",
} as const;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const RATE_LIMIT_DEFAULTS = {
  apiPerMinute: 600,
  aiPerMinute: 20,
  aiPerDay: 300,
} as const;

/** Positive integer from env; "0" disables the limiter; invalid values keep the default. */
export function readLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Authenticated requests are counted per Supabase user id; anonymous requests
 * per client IP (IPv6 grouped by /56 so a single host cannot rotate addresses).
 * Must run after supabaseAuth so the verified user id is available.
 */
export function rateLimitKey(req: Request): string {
  const userId = getAuth(req)?.userId;
  if (userId) return `user:${userId}`;
  return `ip:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown")}`;
}

export function createRateLimiter(options: {
  windowMs: number;
  limit: number;
  skip?: (req: Request) => boolean;
}): RequestHandler {
  const { windowMs, limit, skip } = options;
  if (limit <= 0) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    skip,
    handler(_req, res) {
      res.setHeader("Cache-Control", "no-store");
      res.status(429).json(RATE_LIMITED_RESPONSE);
    },
  });
}

const PROBE_PATHS = new Set(["/healthz", "/readyz"]);

/** General per-user/IP limiter for everything under /api (mount on "/api"). */
export function createApiRateLimiter(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  return createRateLimiter({
    windowMs: MINUTE_MS,
    limit: readLimit(env.API_RATE_LIMIT_PER_MINUTE, RATE_LIMIT_DEFAULTS.apiPerMinute),
    skip: (req) => PROBE_PATHS.has(req.path.replace(/\/+$/, "")),
  });
}

/** Burst + daily caps for routes that call the paid LLM provider. */
export function createAiRateLimiters(env: NodeJS.ProcessEnv = process.env): RequestHandler[] {
  return [
    createRateLimiter({
      windowMs: MINUTE_MS,
      limit: readLimit(env.AI_RATE_LIMIT_PER_MINUTE, RATE_LIMIT_DEFAULTS.aiPerMinute),
    }),
    createRateLimiter({
      windowMs: DAY_MS,
      limit: readLimit(env.AI_RATE_LIMIT_PER_DAY, RATE_LIMIT_DEFAULTS.aiPerDay),
    }),
  ];
}

/**
 * Express "trust proxy" value. Production sits behind exactly one Infomaniak
 * reverse proxy hop by default; TRUST_PROXY overrides (number of hops, true/false,
 * or a comma-separated list of proxy addresses/subnets accepted by Express).
 */
export function resolveTrustProxy(env: NodeJS.ProcessEnv = process.env): boolean | number | string {
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) return env.NODE_ENV === "production" ? 1 : false;
  const lowered = raw.toLowerCase();
  if (lowered === "false") return false;
  // `true` trusts every hop, letting clients spoof X-Forwarded-For; map it to 1.
  if (lowered === "true") return 1;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}
