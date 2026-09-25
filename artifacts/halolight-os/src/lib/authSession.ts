import type { Session } from "@supabase/supabase-js";

export function sessionIdentity(session: Session | null): string | null {
  if (!session) return null;
  try {
    const encoded = session.access_token.split(".")[1];
    const claims = JSON.parse(
      atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (
      typeof claims.session_id !== "string" ||
      !claims.session_id ||
      claims.sub !== session.user.id
    )
      throw new Error();
    // This claim partitions local caches only. The API validates the token.
    return JSON.stringify([session.user.id, claims.session_id]);
  } catch {
    throw new Error("Invalid authentication session");
  }
}

export function safeRedirect(
  value: string | null,
  origin: string,
  base = "",
): string {
  const fallback = `${base}/dashboard`;
  if (!value) return fallback;
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin ||
      url.pathname.startsWith("//") ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(`${base}/`) ||
      /\/(?:auth|sign-in|sign-up|forgot-password|set-password)(?:\/|$)/.test(
        url.pathname,
      )
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function createSessionGuard() {
  let identity: string | null = null;
  let generation = 0;
  return {
    update(next: string | null) {
      if (identity !== next) {
        identity = next;
        generation++;
      }
      return identity ? `${identity}:${generation}` : null;
    },
    reset() {
      identity = null;
      generation++;
    },
    async token(expected: string | null, read: () => Promise<Session | null>) {
      const assertCurrent = () => {
        if (
          !expected ||
          !identity ||
          `${identity}:${generation}` !== expected
        ) {
          throw new Error("Authentication session changed");
        }
      };
      assertCurrent();
      const session = await read();
      assertCurrent();
      if (sessionIdentity(session) !== identity)
        throw new Error("Authentication session changed");
      return session!.access_token;
    },
  };
}
