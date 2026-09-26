import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as sessions from "./authSession";
import { consumeAuthCallback } from "../auth/authCallback";
import * as passwordSetup from "../auth/passwordSetup";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../auth/AuthProvider.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(
  source.replaceAll("import.meta.env", "__env"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const fixture = (id = "a", login = "session-a", version = 1) => ({
  access_token: `header.${Buffer.from(JSON.stringify({ sub: id, session_id: login, iat: version })).toString("base64url")}.signature`,
  user: { id, email: `${id}@example.com`, user_metadata: {} },
  refresh_token: "fixture-refresh",
});
const result = (session: unknown) => ({ data: { session }, error: null });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const storageListeners = new WeakMap<
  Map<string, string>,
  Set<(key: string | null) => void>
>();

function harness(path = "/", storage = new Map<string, string>()) {
  let stored: any = fixture();
  let listener: (event: string, session: any) => void = () => {};
  let index = 0;
  let first = true;
  const hooks: any[] = [];
  let effect: () => () => void;
  let cleanup: () => void;
  let unsubscribed = false;
  const calls: unknown[][] = [];
  let storageListener: ((event: { key: string | null }) => void) | undefined;
  const notifyStorage = (key: string | null) => storageListener?.({ key });
  const peers = storageListeners.get(storage) ?? new Set();
  storageListeners.set(storage, peers);
  const persistentStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
      for (const peer of peers) if (peer !== notifyStorage) peer(key);
    },
  };
  const transport = {
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(["password-request", url, init]);
      return new Response(JSON.stringify(fixture().user), { status: 200 });
    },
  };
  const auth: any = {
    getSession: async () => result(stored),
    onAuthStateChange: (next: typeof listener) => {
      listener = next;
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              unsubscribed = true;
            },
          },
        },
      };
    },
    signOut: async () => {
      listener("SIGNED_OUT", null);
      return { error: null };
    },
    verifyOtp: async (input: unknown) => {
      calls.push(["otp", input]);
      listener("SIGNED_IN", stored);
      return result(stored);
    },
    exchangeCodeForSession: async (code: string) => {
      calls.push(["code", code]);
      listener("SIGNED_IN", stored);
      return result(stored);
    },
    setSession: async (tokens: { access_token: string }) => {
      assert.equal(
        passwordSetup
          .createPasswordSetupStore(
            () => persistentStorage,
            "https://fixture.supabase.co",
          )
          .read(sessions.sessionIdentity(stored)),
        path.startsWith("/auth/callback") ? null : "required",
        "setup must be durable before SDK session publication",
      );
      assert.equal(tokens.access_token, stored.access_token);
      calls.push(["publish"]);
      listener("SIGNED_IN", stored);
      return result(stored);
    },
    updateUser: async () => {
      throw new Error("Shared mutable SDK updateUser must never run");
    },
  };
  const verificationAuth: any = {
    signUp: async (input: unknown) => {
      calls.push(["signup", input]);
      return { data: { session: null }, error: null };
    },
    verifyOtp: async (input: unknown) => {
      calls.push(["otp", input]);
      return result(stored);
    },
  };
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    URL,
    __env: {
      BASE_URL: "/",
      VITE_SUPABASE_URL: "https://fixture.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "public-fixture",
    },
    window: {
      addEventListener: (name: string, fn: typeof storageListener) => {
        assert.equal(name, "storage");
        storageListener = fn;
        peers.add(notifyStorage);
      },
      removeEventListener: () => {
        storageListener = undefined;
        peers.delete(notifyStorage);
      },
      location: {
        href: `https://hub.example${path}`,
        origin: "https://hub.example",
        assign: (to: string) => calls.push(["navigate", to]),
      },
      history: {
        replaceState: (_state: unknown, _title: unknown, url: string) =>
          calls.push(["clear", url]),
      },
    },
    localStorage: persistentStorage,
    sessionStorage: { getItem: () => null },
    require: (id: string) => {
      if (id === "react/jsx-runtime") return require(id);
      if (id === "react")
        return {
          createContext: () => ({ Provider: "provider" }),
          useState: (initial: any) => {
            const i = index++;
            if (first) hooks[i] = initial;
            return [
              hooks[i],
              (value: any) => {
                hooks[i] = value;
              },
            ];
          },
          useRef: (initial: any) => {
            const i = index++;
            if (first) hooks[i] = { current: initial };
            return hooks[i];
          },
          useEffect: (fn: typeof effect) => {
            if (first) effect = fn;
          },
          useMemo: (fn: () => any, deps: any[]) => {
            const i = index++;
            if (first || deps.some((dep, j) => dep !== hooks[i].deps[j]))
              hooks[i] = { deps, value: fn() };
            return hooks[i].value;
          },
        };
      if (id === "@supabase/supabase-js")
        return {
          createClient: (_url: string, _key: string, options: any) => {
            assert.equal(options.auth.detectSessionInUrl, false);
            if (options.auth.persistSession === false) {
              assert.equal(options.auth.autoRefreshToken, false);
              assert.equal(
                options.auth.storageKey,
                "halolight-auth-verification",
              );
              return { auth: verificationAuth };
            }
            assert.equal(options.auth.flowType, "pkce");
            return { auth };
          },
        };
      if (id === "@/lib/authSession") return sessions;
      if (id === "./authCallback") return { consumeAuthCallback };
      if (id === "./passwordSetup")
        return {
          ...passwordSetup,
          updatePasswordWithToken: (
            url: string,
            key: string,
            token: string,
            userId: string,
            password: string,
          ) =>
            passwordSetup.updatePasswordWithToken(
              url,
              key,
              token,
              userId,
              password,
              transport.fetch,
            ),
        };
      throw new Error(`Unexpected dependency ${id}`);
    },
  });
  const render = () => {
    index = 0;
    const value = module.exports.AuthProvider({ children: null }).props.value;
    first = false;
    return value;
  };
  return {
    auth,
    verificationAuth,
    transport,
    persistentStorage,
    calls,
    storage,
    render,
    mount: () => {
      const initial = render();
      cleanup = effect();
      return initial;
    },
    emit: (event: string, session: any) => {
      stored = session;
      listener(event, session);
    },
    cleanup: () => cleanup(),
    get unsubscribed() {
      return unsubscribed;
    },
  };
}

test("signup token hash verifies in isolation then publishes a normal session without password setup", async () => {
  const h = harness("/auth/callback?token_hash=signup-fixture&type=email");
  h.mount(); await tick();
  assert.equal(h.render().status, "signed-in");
  assert.equal(h.render().callbackComplete, true);
  assert.equal(h.render().requiresPassword, false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.filter(call => call[0] === "otp"))), [["otp", { token_hash: "signup-fixture", type: "email" }]]);
  assert.equal(h.calls.filter(call => call[0] === "publish").length, 1);
  assert.equal(h.storage.size, 0);
  h.cleanup();
});

test("signup requests confirmation without publishing a session and fails closed on autoconfirm", async () => {
  const h = harness(); h.mount(); await tick(); h.emit("SIGNED_OUT", null);
  await h.render().signUp(" purchase@example.com ", "private-password");
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(call => call[0] === "signup"))), ["signup", {
    email: "purchase@example.com", password: "private-password", options: { emailRedirectTo: "https://hub.example/auth/callback" },
  }]);
  assert.equal(h.render().status, "signed-out");
  h.verificationAuth.signUp = async () => result(fixture());
  await assert.rejects(h.render().signUp("purchase@example.com", "private-password"), /Unable to register/);
  assert.equal(h.render().status, "signed-out");
  assert.equal(h.calls.filter(call => call[0] === "publish").length, 0);
  h.cleanup();
});

test("provider ignores stale bootstrap result after a cross-tab logout", async () => {
  const h = harness();
  let finish!: (value: any) => void;
  h.auth.getSession = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  assert.equal(h.mount().status, "loading");
  h.emit("SIGNED_OUT", null);
  finish(result(fixture()));
  await tick();
  assert.equal(h.render().status, "signed-out");
  h.cleanup();
  assert.equal(h.unsubscribed, true);
});

test("provider preserves refresh cache keys and rejects old getters immediately on account change", async () => {
  const h = harness();
  h.mount();
  await tick();
  const first = h.render();
  h.emit("TOKEN_REFRESHED", fixture("a", "session-a", 2));
  const refreshed = h.render();
  assert.equal(first.sessionKey, refreshed.sessionKey);
  assert.equal(first.getToken, refreshed.getToken);
  h.emit("SIGNED_IN", fixture("b", "session-b"));
  await assert.rejects(first.getToken(), /session changed/);
  assert.notEqual(h.render().sessionKey, first.sessionKey);
  h.cleanup();
});

test("provider invalidates tokens before awaiting signout and stays blocked on signout failure", async () => {
  const h = harness();
  h.mount();
  await tick();
  const first = h.render();
  h.auth.signOut = async () => {
    throw new Error("offline");
  };
  await first.signOut();
  await assert.rejects(first.getToken(), /session changed/);
  h.emit("TOKEN_REFRESHED", fixture());
  assert.equal(h.render().status, "error");
  h.cleanup();
});

test("invalid callback never restores the already signed-in account, even on later refresh", async () => {
  const h = harness("/auth/invite?type=invite&token_hash=expired");
  h.verificationAuth.verifyOtp = async () => ({
    data: { session: null },
    error: new Error("expired"),
  });
  let reads = 0;
  h.auth.getSession = async () => {
    reads++;
    return result(fixture());
  };
  h.mount();
  await tick();
  assert.equal(h.render().status, "error");
  assert.equal(reads, 0);
  h.emit("TOKEN_REFRESHED", fixture());
  assert.equal(h.render().user, null);
  assert.ok(h.calls.some((call) => call[0] === "clear"));
  h.cleanup();
});

test("invite requires password setup across restart, then durably records completion", async () => {
  const h = harness("/auth/invite?type=invite&token_hash=fixture");
  h.mount();
  await tick();
  const invited = h.render();
  assert.equal(invited.requiresPassword, true);
  assert.equal(invited.callbackComplete, true);
  assert.equal(h.calls.filter((call) => call[0] === "otp").length, 1);
  h.cleanup();
  const reload = harness("/set-password", h.storage);
  reload.mount();
  await tick();
  assert.equal(reload.render().requiresPassword, true);
  await reload.render().setPassword("new-password-fixture");
  assert.equal(reload.render().requiresPassword, false);
  assert.equal([...reload.storage.values()][0], "complete");
  reload.cleanup();
});

test("password mutation stays bound to A when shared credentials switch to B during the request", async () => {
  const h = harness("/auth/recovery?type=recovery&token_hash=fixture");
  h.mount();
  await tick();
  let release!: () => void;
  let reached!: () => void;
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const mutations: string[] = [];
  h.transport.fetch = async (url, init) => {
    await new Promise<void>((resolve) => {
      release = resolve;
      reached();
    });
    assert.equal(url, "https://fixture.supabase.co/auth/v1/user");
    const bearer = new Headers(init?.headers).get("Authorization")!;
    mutations.push(bearer);
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(
      JSON.parse(String(init?.body)).password,
      "fixture-new-password",
    );
    return new Response(JSON.stringify(fixture().user), { status: 200 });
  };
  const pending = h.render().setPassword("fixture-new-password");
  const rejected = assert.rejects(pending, /Authentication session changed/);
  await started;
  const b = fixture("b", "session-b");
  const store = passwordSetup.createPasswordSetupStore(
    () => h.persistentStorage,
    "https://fixture.supabase.co",
  );
  store.require(sessions.sessionIdentity(b)!);
  h.emit("SIGNED_IN", b);
  release();
  await rejected;
  assert.deepEqual(mutations, [`Bearer ${fixture().access_token}`]);
  assert.ok(!mutations.includes(`Bearer ${b.access_token}`));
  assert.equal(h.render().user.id, "b");
  assert.equal(h.render().requiresPassword, true);
  assert.equal(store.read(sessions.sessionIdentity(b)), "required");
  assert.equal(store.read(sessions.sessionIdentity(fixture())), "complete");
  h.cleanup();
});

test("password failure never exposes diagnostics or records completion for the wrong response user", async () => {
  const h = harness("/auth/invite?type=invite&token_hash=fixture");
  h.mount();
  await tick();
  for (const response of [
    () =>
      new Response(JSON.stringify({ message: "private provider diagnostic" }), {
        status: 500,
      }),
    () =>
      new Response(JSON.stringify(fixture("b", "session-b").user), {
        status: 200,
      }),
    () => {
      throw new Error("private network diagnostic");
    },
  ]) {
    h.transport.fetch = async () => response();
    await assert.rejects(
      h.render().setPassword("fixture-password"),
      /^Error: Password update failed$/,
    );
    assert.equal(h.render().requiresPassword, true);
    assert.deepEqual([...h.storage.values()], ["required"]);
  }
  h.cleanup();
});

test("invite SIGNED_IN publication gates independent existing/new tabs before protected content can mount", async () => {
  for (const type of ["invite", "recovery"]) {
    const shared = new Map<string, string>();
    const existing = harness("/dashboard", shared);
    existing.mount();
    await tick();
    existing.emit("SIGNED_IN", fixture("b", "session-b"));
    const accepting = harness(
      `/auth/${type}?type=${type}&token_hash=fixture`,
      shared,
    );
    const publish = accepting.auth.setSession;
    accepting.auth.setSession = async (tokens: any) => {
      existing.emit("SIGNED_IN", fixture());
      assert.equal(
        existing.render().requiresPassword,
        true,
        "first SIGNED_IN render must already be gated",
      );
      return publish(tokens);
    };
    accepting.mount();
    await tick();
    assert.equal(accepting.render().requiresPassword, true);
    const freshTab = harness("/dashboard", shared);
    freshTab.mount();
    await tick();
    assert.equal(freshTab.render().requiresPassword, true);
    freshTab.emit("TOKEN_REFRESHED", fixture("a", "session-a", 2));
    assert.equal(freshTab.render().requiresPassword, true);
    await accepting.render().setPassword("fixture-password");
    assert.equal(existing.render().requiresPassword, false);
    assert.equal(freshTab.render().requiresPassword, false);
    accepting.cleanup();
    existing.cleanup();
    freshTab.cleanup();
    const restarted = harness("/dashboard", shared);
    restarted.mount();
    await tick();
    assert.equal(
      restarted.render().requiresPassword,
      false,
      "completion survives a browser restart",
    );
    restarted.cleanup();
  }
});

test("setup and completion are isolated by project, account, and login session", async () => {
  const shared = new Map<string, string>();
  const required = harness(
    "/auth/invite?type=invite&token_hash=fixture",
    shared,
  );
  required.mount();
  await tick();
  const other = harness("/dashboard", shared);
  other.mount();
  await tick();
  other.emit("SIGNED_IN", fixture("a", "different-login"));
  assert.equal(other.render().requiresPassword, false);
  other.emit("SIGNED_IN", fixture("b", "session-b"));
  assert.equal(other.render().requiresPassword, false);
  const store = passwordSetup.createPasswordSetupStore(
    () => other.persistentStorage,
    "https://other.supabase.co",
  );
  assert.equal(store.read(sessions.sessionIdentity(fixture())), null);
  assert.equal(
    required.render().requiresPassword,
    true,
    "another account's accept must not erase the requirement",
  );
  await required.render().setPassword("fixture-password");
  assert.equal(other.render().user.id, "b");
  assert.equal(other.render().requiresPassword, false);
  required.cleanup();
  other.cleanup();
});

test("storage failures cannot publish an unguarded invitation session", async () => {
  const h = harness("/auth/invite?type=invite&token_hash=fixture");
  h.persistentStorage.setItem = () => {
    throw new Error("storage unavailable");
  };
  h.mount();
  await tick();
  assert.equal(h.render().status, "error");
  assert.equal(h.calls.filter((call) => call[0] === "publish").length, 0);
  h.cleanup();
});

test("PASSWORD_RECOVERY without a callback also persists setup for independent tabs", async () => {
  const shared = new Map<string, string>();
  const recovery = harness("/dashboard", shared);
  recovery.mount();
  await tick();
  recovery.emit("PASSWORD_RECOVERY", fixture());
  assert.equal(recovery.render().requiresPassword, true);
  const tab = harness("/dashboard", shared);
  tab.mount();
  await tick();
  assert.equal(tab.render().requiresPassword, true);
  await recovery.render().setPassword("fixture-password");
  assert.equal(tab.render().requiresPassword, false);
  recovery.cleanup();
  tab.cleanup();
});
