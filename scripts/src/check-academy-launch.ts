import { loadEnvFile } from "node:process";
import path from "node:path";
import { signBunnyEmbedUrl } from "../../artifacts/api-server/src/lib/bunnySecurity";
import { fetchBunnyJson, getBunnyLibrarySecurity } from "../../artifacts/api-server/src/lib/bunnyApi";

try {
  loadEnvFile(path.resolve(import.meta.dirname, "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

let failures = 0;
function report(name: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    report("Database", false, "DATABASE_URL is missing");
    return;
  }
  const { pool } = await import("@workspace/db");
  pool.options.connectionTimeoutMillis = 5_000;
  try {
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 5000");
      const { rows } = await client.query<{ courses: number; lessons: number }>(`
        SELECT (SELECT count(*)::int FROM courses WHERE is_published) AS courses,
        (SELECT count(*)::int FROM lessons l
         JOIN course_modules m ON m.id = l.module_id
         JOIN courses c ON c.id = m.course_id
         WHERE l.is_published AND c.is_published) AS lessons
      `);
      const row = rows[0];
      report("Database", true, "Connection and academy schema available");
      report("Academy content", Boolean(row && row.courses > 0 && row.lessons > 0),
        `${row?.courses ?? 0} published courses, ${row?.lessons ?? 0} published lessons`);
    } finally {
      client.release();
    }
  } catch {
    report("Database", false, "Connection or academy query failed; check the Supabase project and connection settings");
  } finally {
    await pool.end();
  }
}

async function checkBunny() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim();
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY?.trim();
  report("Bunny signing key", Boolean(tokenKey), "BUNNY_STREAM_TOKEN_AUTH_KEY must contain the embed token key, not the Stream API key");
  if (!libraryId || !apiKey) {
    report("Bunny API", false, "Stream library ID or API key is missing");
    return;
  }
  try {
    const videos = await fetchBunnyJson(`/library/${encodeURIComponent(libraryId)}/videos?page=1&itemsPerPage=100`, apiKey);
    report("Bunny API", true, `${Number(videos.totalItems ?? 0)} videos found`);
    const video = (Array.isArray(videos.items) ? videos.items : [])
      .find((item) => item && typeof item === "object" && item.status === 4 && typeof item.guid === "string");
    if (!video) {
      report("Bunny playback", false, "No ready video available for the playback probe");
      return;
    }
    const rawUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${video.guid}`;
    const headers = { Referer: process.env.APP_PUBLIC_URL ?? "http://localhost:18205/" };
    const unsigned = await fetch(rawUrl, { headers, signal: AbortSignal.timeout(10_000) });
    await unsigned.body?.cancel();
    report("Bunny unsigned access", unsigned.status === 403,
      `Unsigned player HTTP ${unsigned.status}; expected 403 with embed token authentication enabled`);
    if (tokenKey) {
      const signedUrl = signBunnyEmbedUrl(rawUrl, {
        libraryId, tokenKey, expires: Math.floor(Date.now() / 1000) + 120,
      });
      const signed = await fetch(signedUrl, { headers, signal: AbortSignal.timeout(10_000) });
      await signed.body?.cancel();
      report("Bunny signed access", signed.status === 200, `Signed player HTTP ${signed.status}; expected 200`);
    }
    try {
      const security = await getBunnyLibrarySecurity(libraryId);
      if (security) {
        report("Bunny remote settings", security.playerTokenAuthenticationEnabled && security.allowDirectPlay === false,
          "Embed token authentication must be enabled and direct play disabled");
      } else {
        report("Bunny remote settings", false,
          "Cannot verify direct-play restrictions without BUNNY_API_KEY (account API key)");
      }
    } catch {
      report("Bunny remote settings", false, "Account API access failed; continuing the playback probes");
    }
    const cdn = process.env.BUNNY_STREAM_CDN_HOSTNAME?.trim();
    if (cdn) {
      const playlist = await fetch(`https://${cdn}/${video.guid}/playlist.m3u8`, {
        method: "HEAD", signal: AbortSignal.timeout(10_000),
      });
      report("Bunny direct video access", playlist.status === 403,
        `Unauthenticated HLS HTTP ${playlist.status}; expected 403`);
    }
  } catch {
    report("Bunny checks", false, "API or playback probe failed; inspect Bunny configuration without sharing keys");
  }
}

async function main() {
  const secret = process.env.CLERK_SECRET_KEY ?? "";
  const publicKey = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
  report("Clerk production", secret.startsWith("sk_live_") && publicKey.startsWith("pk_live_"),
    "Hosted production requires live keys from the same Clerk application");
  let publicUrlOk = false;
  try {
    const url = new URL(process.env.APP_PUBLIC_URL ?? "");
    publicUrlOk = url.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { /* Invalid or missing URL is reported below. */ }
  report("Public URL", publicUrlOk, "APP_PUBLIC_URL must be the final HTTPS hub URL");
  await Promise.all([checkDatabase(), checkBunny()]);
  console.log(`${failures} blocking check(s). This command is read-only; no seed or migration was run.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch(() => {
  console.error("Launch check could not complete. No credentials are printed.");
  process.exitCode = 1;
});
