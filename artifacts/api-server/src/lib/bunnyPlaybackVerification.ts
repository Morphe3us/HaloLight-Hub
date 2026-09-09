import { createHash } from "node:crypto";
import { isExplicitDevelopment } from "./env";
import { BunnyPlaybackConfigurationError, signBunnyEmbedUrl } from "./bunnySecurity";

type Verification = { key: string; expiresAt: number; pending: Promise<void> };
let verified: Verification | undefined;

// Cache remote policy checks briefly so normal lesson navigation does not call Bunny.
export async function verifyBunnyPlaybackProtection(rawEmbedUrl: string): Promise<void> {
  if (isExplicitDevelopment()) return;
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY?.trim() ?? "";
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim() ?? "";
  const origin = process.env.APP_PUBLIC_URL ?? "";
  const key = createHash("sha256").update(JSON.stringify([libraryId, tokenKey, origin])).digest("hex");
  const signed = signBunnyEmbedUrl(rawEmbedUrl, {
    tokenKey, libraryId, expires: Math.floor(Date.now() / 1000) + 120,
  });
  if (verified?.key === key && verified.expiresAt > Date.now()) return verified.pending;

  const unsigned = new URL(signed);
  unsigned.searchParams.delete("token");
  unsigned.searchParams.delete("expires");
  const headers = origin ? { Referer: origin } : undefined;
  const probe = async (url: string) => {
    const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(5_000) });
    await response.body?.cancel();
    return response.status;
  };
  const entry: Verification = { key, expiresAt: Infinity, pending: Promise.resolve() };
  entry.pending = (async () => {
    try {
      const [unsignedStatus, signedStatus] = await Promise.all([probe(unsigned.toString()), probe(signed)]);
      if (unsignedStatus !== 403 || signedStatus !== 200) throw new BunnyPlaybackConfigurationError();
      entry.expiresAt = Date.now() + 60_000;
    } catch {
      if (verified === entry) verified = undefined;
      throw new BunnyPlaybackConfigurationError();
    }
  })();
  verified = entry;
  return entry.pending;
}
