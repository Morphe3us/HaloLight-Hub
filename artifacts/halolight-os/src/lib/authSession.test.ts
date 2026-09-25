import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  createSessionGuard,
  safeRedirect,
  sessionIdentity,
} from "./authSession";
import { consumeAuthCallback } from "../auth/authCallback";

export function session(user = "a", login = "login-a", refresh = 1): Session {
  return {
    access_token: `header.${Buffer.from(JSON.stringify({ sub: user, session_id: login, iat: refresh })).toString("base64url")}.signature`,
    user: { id: user, user_metadata: {} },
    refresh_token: "fixture",
    token_type: "bearer",
    expires_in: 3600,
  } as Session;
}

test("token refresh keeps cache identity; same-user new login changes it", async () => {
  const guard = createSessionGuard();
  const first = guard.update(sessionIdentity(session()));
  assert.equal(
    guard.update(sessionIdentity(session("a", "login-a", 2))),
    first,
  );
  assert.equal(
    await guard.token(first, async () => session("a", "login-a", 2)),
    session("a", "login-a", 2).access_token,
  );
  assert.notEqual(
    guard.update(sessionIdentity(session("a", "login-b"))),
    first,
  );
  await assert.rejects(
    guard.token(first, async () => session()),
    /session changed/,
  );
});

test("late token rejects account switch, logout, and logout/login to the same identity", async () => {
  for (const change of ["switch", "logout", "relogin"]) {
    const guard = createSessionGuard();
    const key = guard.update(sessionIdentity(session()));
    let resolve!: (value: Session) => void;
    const pending = guard.token(
      key,
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    if (change === "switch")
      guard.update(sessionIdentity(session("b", "login-b")));
    else {
      guard.reset();
      if (change === "relogin") guard.update(sessionIdentity(session()));
    }
    resolve(session());
    await assert.rejects(pending, /session changed/);
  }
});

test("token reader cannot return a different stored account before subscription catches up", async () => {
  const guard = createSessionGuard();
  const key = guard.update(sessionIdentity(session()));
  await assert.rejects(
    guard.token(key, async () => session("b", "login-b")),
    /session changed/,
  );
  await assert.rejects(
    guard.token(key, async () => null),
    /session changed/,
  );
});

test("missing session identity and mismatched subject fail closed", () => {
  assert.throws(
    () => sessionIdentity({ ...session(), access_token: "invalid" }),
    /Invalid/,
  );
  assert.throws(
    () =>
      sessionIdentity({
        ...session(),
        user: { ...session().user, id: "other" },
      }),
    /Invalid/,
  );
});

test("redirects remain same-origin and inside the router base", () => {
  const origin = "https://hub.example";
  assert.equal(safeRedirect("https://hub.example//evil.example", origin), "/dashboard");
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "https://user:pass@hub.example/app/dashboard",
    "/other",
    "/app/auth/callback?code=bad",
    "/app/sign-in",
  ]) {
    assert.equal(safeRedirect(value, origin, "/app"), "/app/dashboard");
  }
  assert.equal(
    safeRedirect("/app/academy?lang=fr", origin, "/app"),
    "/app/academy?lang=fr",
  );
  assert.equal(
    safeRedirect("https://hub.example/app/settings", origin, "/app"),
    "/app/settings",
  );
});

function callbackHarness(
  result: unknown = { data: { session: session() }, error: null },
) {
  const calls: unknown[][] = [];
  let cleared = false;
  const auth = {
    exchangeCodeForSession: async (...args: unknown[]) => {
      assert.equal(cleared, true);
      calls.push(["code", ...args]);
      return result;
    },
    verifyOtp: async (...args: unknown[]) => {
      assert.equal(cleared, true);
      calls.push(["otp", ...args]);
      return result;
    },
  } as unknown as SupabaseClient["auth"];
  return {
    calls,
    run: (path: string) =>
      consumeAuthCallback(auth, new URL(path, "https://hub.example"), () => {
        cleared = true;
      }),
    get cleared() {
      return cleared;
    },
  };
}

test("OAuth code is exchanged once with credentials stripped first", async () => {
  const h = callbackHarness();
  const result = await h.run("/auth/callback?code=oauth-code");
  assert.equal(result.requiresPassword, false);
  assert.deepEqual(h.calls, [["code", "oauth-code"]]);
});

test("invite and recovery use token hash verification and require password setup", async () => {
  for (const type of ["invite", "recovery"]) {
    const h = callbackHarness();
    const result = await h.run(`/auth/${type}?type=${type}&token_hash=fixture`);
    assert.equal(result.requiresPassword, true);
    assert.deepEqual(h.calls, [["otp", { token_hash: "fixture", type }]]);
  }
});

test("empty, expired, wrong-type, fragment, and mixed callback credentials never fall back to stored sessions", async () => {
  for (const path of [
    "/auth/callback",
    "/auth/invite?code=unsupported",
    "/auth/invite?type=recovery&token_hash=fixture",
    "/auth/callback?code=code&token_hash=fixture",
    "/auth/invite#access_token=fixture&refresh_token=fixture&type=invite",
    "/auth/callback?error=access_denied",
  ]) {
    const h = callbackHarness();
    await assert.rejects(h.run(path), /Invalid/);
    assert.equal(h.cleared, true);
    assert.equal(h.calls.length, 0);
  }
  for (const result of [
    { data: { session: null }, error: null },
    { data: { session: session() }, error: new Error("expired") },
  ]) {
    await assert.rejects(
      callbackHarness(result).run(
        "/auth/invite?type=invite&token_hash=expired",
      ),
      /Invalid/,
    );
  }
});
