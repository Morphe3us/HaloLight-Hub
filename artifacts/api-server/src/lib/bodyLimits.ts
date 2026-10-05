import express, { type RequestHandler } from "express";

/** Default JSON/urlencoded body limit for every API route not listed below. */
export const DEFAULT_BODY_LIMIT = "1mb";

type LargeBodyRoute = { method: string; pattern: RegExp; limit: string };

/**
 * Routes that legitimately receive large JSON bodies (base64 files or data URLs).
 * Limits are sized from each route's own decoded-size validation plus base64
 * (4/3) and JSON overhead. Keep this list as narrow as possible.
 */
export const LARGE_BODY_ROUTES: readonly LargeBodyRoute[] = [
  // Admin file upload: 20 MiB decoded max -> ~26.7 MiB base64.
  { method: "POST", pattern: /^\/api\/admin\/uploads\/file\/?$/i, limit: "28mb" },
  // Support ticket creation: up to 3 attachments, 10 MiB decoded total.
  { method: "POST", pattern: /^\/api\/support\/tickets\/?$/i, limit: "15mb" },
  // Profile update can carry the company logo as a data URL (2 MB file max).
  { method: "PATCH", pattern: /^\/api\/users\/me\/?$/i, limit: "4mb" },
  // Contract content may embed the provider logo data URL through template variables.
  { method: "POST", pattern: /^\/api\/contracts\/?$/i, limit: "4mb" },
  { method: "PUT", pattern: /^\/api\/contracts\/[^/]+\/?$/i, limit: "4mb" },
  // Admin AI knowledge documents carry pasted long-form text.
  { method: "POST", pattern: /^\/api\/admin\/ai-knowledge\/?$/i, limit: "5mb" },
  { method: "PUT", pattern: /^\/api\/admin\/ai-knowledge\/[^/]+\/?$/i, limit: "5mb" },
];

export function largeBodyLimitFor(method: string, path: string): string | undefined {
  return LARGE_BODY_ROUTES.find(
    (route) => route.method === method && route.pattern.test(path),
  )?.limit;
}

/**
 * Route-specific large parsers run first; body-parser skips a request whose body
 * stream was already consumed, so the strict global parsers below never re-read it.
 */
export function createBodyParsers(): RequestHandler[] {
  const largeParsers = new Map<string, RequestHandler>();
  for (const { limit } of LARGE_BODY_ROUTES) {
    if (!largeParsers.has(limit)) largeParsers.set(limit, express.json({ limit }));
  }
  const large: RequestHandler = (req, res, next) => {
    const limit = largeBodyLimitFor(req.method, req.path);
    if (!limit) {
      next();
      return;
    }
    largeParsers.get(limit)!(req, res, next);
  };
  return [
    large,
    express.json({ limit: DEFAULT_BODY_LIMIT }),
    express.urlencoded({ extended: false, limit: DEFAULT_BODY_LIMIT }),
  ];
}
