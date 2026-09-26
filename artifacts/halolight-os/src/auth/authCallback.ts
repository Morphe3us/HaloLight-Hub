import type { SupabaseClient } from "@supabase/supabase-js";

export async function consumeAuthCallback(
  auth: SupabaseClient["auth"],
  url: URL,
  clearUrl: () => void,
) {
  clearUrl();
  if (url.searchParams.has("error") || url.hash)
    throw new Error("Invalid authentication link");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  let result;
  let requiresPassword = false;
  if (url.pathname.endsWith("/auth/callback") && code && !tokenHash && !type) {
    result = await auth.exchangeCodeForSession(code);
  } else if (url.pathname.endsWith("/auth/callback") && type === "email" && tokenHash && !code) {
    result = await auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  } else if (
    (url.pathname.endsWith("/auth/invite") && type === "invite") ||
    (url.pathname.endsWith("/auth/recovery") && type === "recovery")
  ) {
    if (!tokenHash || code) throw new Error("Invalid authentication link");
    result = await auth.verifyOtp({ token_hash: tokenHash, type });
    requiresPassword = true;
  } else throw new Error("Invalid authentication link");
  if (result.error || !result.data.session)
    throw new Error("Invalid authentication link");
  return { session: result.data.session, requiresPassword };
}
