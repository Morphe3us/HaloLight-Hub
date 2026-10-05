import helmet from "helmet";
import type { RequestHandler } from "express";

const BUNNY_FRAME_SOURCES = [
  "https://iframe.mediadelivery.net",
  "https://player.mediadelivery.net",
  "https://video.bunnycdn.com",
  "https://*.b-cdn.net",
];
// Academy lessons may also reference YouTube videos (see AcademyLesson getVideoEmbedUrl).
const YOUTUBE_FRAME_SOURCES = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
];

/** Supabase project origins for the auth/REST (https) and realtime (wss) clients. */
export function supabaseConnectSources(env: NodeJS.ProcessEnv = process.env): string[] {
  for (const value of [env.SUPABASE_URL, env.VITE_SUPABASE_URL]) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:") continue;
      return [url.origin, `wss://${url.host}`];
    } catch {
      // Ignore malformed values; startup validation reports them elsewhere.
    }
  }
  return ["https://*.supabase.co", "wss://*.supabase.co"];
}

export function buildContentSecurityPolicy(env: NodeJS.ProcessEnv = process.env) {
  const directives: Record<string, string[] | null> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    // Vite emits only external module scripts; no inline script is allowed.
    "script-src": ["'self'"],
    "script-src-attr": ["'none'"],
    // React style attributes and the print windows' inline <style> need 'unsafe-inline'.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    // Logos are data URLs; avatars, thumbnails and resources are arbitrary https hosts.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https:"],
    "connect-src": ["'self'", ...supabaseConnectSources(env)],
    "frame-src": ["'self'", "blob:", ...BUNNY_FRAME_SOURCES, ...YOUTUBE_FRAME_SOURCES],
    // PDF files opened as blob: documents inherit this policy; keep the viewer working.
    "object-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "upgrade-insecure-requests": env.NODE_ENV === "production" ? [] : null,
  };
  return Object.fromEntries(
    Object.entries(directives).filter(([, value]) => value !== null),
  ) as Record<string, string[]>;
}

export function createSecurityHeaders(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: buildContentSecurityPolicy(env),
    },
    // Cross-origin Bunny/YouTube iframes do not send CORP/COEP headers.
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: {
      maxAge: 31_536_000,
      includeSubDomains: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xFrameOptions: { action: "deny" },
  });
}
