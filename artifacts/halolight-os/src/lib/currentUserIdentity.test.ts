import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  isPlaceholderDisplayName,
  resolveCurrentUserIdentity,
} from "./currentUserIdentity";

describe("resolveCurrentUserIdentity", () => {
  it("uses Clerk profile when the API user is still a placeholder", () => {
    const identity = resolveCurrentUserIdentity(
      {
        email: "user_123@placeholder.com",
        firstName: null,
        lastName: null,
        fullName: null,
      },
      {
        primaryEmailAddress: { emailAddress: "info@example.com" },
        firstName: "info",
        lastName: "halolight",
        fullName: "info halolight",
      },
    );

    assert.deepEqual(identity, {
      displayName: "info halolight",
      email: "info@example.com",
      initials: "IH",
    });
  });

  it("keeps complete API profile over Clerk fallback", () => {
    const identity = resolveCurrentUserIdentity(
      {
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "Local",
        fullName: "Owner Local",
      },
      {
        primaryEmailAddress: { emailAddress: "clerk@example.com" },
        firstName: "Clerk",
        lastName: "User",
        fullName: "Clerk User",
      },
    );

    assert.equal(identity.displayName, "Owner Local");
    assert.equal(identity.email, "owner@example.com");
    assert.equal(identity.initials, "OL");
  });

  it("detects visible fallback names as placeholders", () => {
    assert.equal(isPlaceholderDisplayName("User"), true);
    assert.equal(isPlaceholderDisplayName("User Member"), true);
    assert.equal(isPlaceholderDisplayName("Romak LB"), false);
  });

  it("does not rebuild User Member from placeholder first and last names", () => {
    const identity = resolveCurrentUserIdentity({
      email: "user_google@placeholder.com",
      firstName: "User", lastName: "Member", fullName: "User Member",
    }, {
      firstName: "Ada", lastName: "Lovelace",
      primaryEmailAddress: { emailAddress: "ada@example.com" },
    });
    assert.equal(identity.displayName, "Ada Lovelace");
    assert.equal(identity.initials, "AL");
  });

  it("discards another account's cached API name and email", () => {
    const identity = resolveCurrentUserIdentity({
      clerkId: "user_previous", fullName: "Previous Admin", email: "admin@example.com",
    }, {
      id: "user_current", fullName: "Current Member",
      primaryEmailAddress: { emailAddress: "member@example.com" },
    });
    assert.deepEqual(identity, {
      displayName: "Current Member", email: "member@example.com", initials: "CM",
    });
  });

  it("uses the real email when both name sources contain placeholders", () => {
    assert.equal(resolveCurrentUserIdentity({
      fullName: "User", firstName: "User", email: "ada.lovelace@example.com",
    }, { fullName: "User Member" }).displayName, "Ada Lovelace");
  });
});

// Exercise App's actual session boundary without a browser, Clerk network calls,
// or new test dependencies. Hook state/effect ordering is driven explicitly.
const require = createRequire(import.meta.url);
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const compiledApp = ts.transpileModule(`${appSource}\nexport { ClerkSession, ClerkSessionBoundary, LocalUserGate, AdminRouteContent, ClerkProviderWithRoutes };`, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  },
  transformers: { before: [(context) => (root) => {
    const visit = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isPropertyAccessExpression(node) && ts.isMetaProperty(node.expression) && node.name.text === "env") {
        return ts.factory.createIdentifier("__env");
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitNode(root, visit) as ts.SourceFile;
  }] },
}).outputText;

function appHarness(key = "pk_test_fixture") {
  let tokenGetter: null | (() => Promise<string | null>) = null;
  let auth = { isLoaded: true, userId: "user_a", sessionId: "session_a" };
  let token = async () => "token_a";
  let result: Record<string, unknown> = {};
  let hookIndex = 0;
  let states: unknown[] = [];
  let effects: Array<() => (() => void)> = [];
  let scheduleEffects = true;
  const clerk = {
    get user() { return { id: auth.userId }; },
    get session() { return { id: auth.sessionId }; },
    signOut() {},
  };
  const pass = ({ children }: { children: unknown }) => children;
  const redirect = () => null;
  const module = { exports: {} as Record<string, (props?: any) => any> };
  runInNewContext(compiledApp, {
    module, exports: module.exports,
    window: { location: { origin: "https://app.example.com", reload() {} } },
    __env: { VITE_CLERK_PUBLISHABLE_KEY: key, VITE_CLERK_PROXY_URL: "/api/__clerk", BASE_URL: "/", DEV: false },
    require: (id: string) => {
      if (id === "react") return {
        lazy: () => pass, Suspense: pass,
        useState: (init: unknown) => {
          const index = hookIndex++;
          if (!(index in states)) states[index] = typeof init === "function" ? init() : init;
          return [states[index], (value: unknown) => { states[index] = value; }];
        },
        useEffect: (effect: () => () => void) => { if (scheduleEffects) effects.push(effect); },
      };
      if (id === "react/jsx-runtime") return require(id);
      if (id === "react-i18next") return { useTranslation: () => ({ t: (key: string) => key }) };
      if (id === "@clerk/react") return {
        useAuth: () => ({ ...auth, getToken: () => token() }), useClerk: () => clerk,
        ClerkProvider: pass, ClerkLoading: pass, ClerkFailed: pass, Show: pass,
      };
      if (id === "@workspace/api-client-react") return {
        setAuthTokenGetter: (getter: typeof tokenGetter) => { tokenGetter = getter; },
        useGetCurrentUser: () => result,
      };
      if (id === "@tanstack/react-query") return { QueryClient, QueryClientProvider };
      if (id === "./lib/queryClient") return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: 1 } } }) };
      if (id === "@clerk/themes") return { shadcn: {} };
      if (id === "wouter") return { Redirect: redirect, useLocation: () => ["/", () => {}], Route: pass, Switch: pass };
      if (id === "./components/theme-provider") return { ThemeProvider: pass };
      if (id === "./components/layout/AppShell") return { AppShell: pass };
      if (id === "./components/LanguageSync") return { LanguageSync: pass };
      if (id === "@/components/ui/toaster") return { Toaster: pass };
      if (id === "@/components/ui/tooltip") return { TooltipProvider: pass };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return {
    components: module.exports, redirect,
    get getter() { return tokenGetter!; },
    setAuth: (next: typeof auth) => { auth = next; },
    setToken: (next: typeof token) => { token = next; },
    setResult: (next: typeof result) => { result = next; },
    mountSession: () => {
      states = []; effects = []; hookIndex = 0; scheduleEffects = true;
      const initial = module.exports.ClerkSession({ children: "protected content" });
      const cleanup = effects.map((effect) => effect());
      scheduleEffects = false; hookIndex = 0;
      const ready = module.exports.ClerkSession({ children: "protected content" });
      return { initial, ready, cleanup: () => cleanup.forEach((fn) => fn()) };
    },
  };
}

describe("auth loading and session isolation", () => {
  it("all auth loading and recovery labels exist in all eight locales", () => {
    for (const language of ["en", "fr", "es", "de", "it", "pl", "pt", "nl"]) {
      const locale = JSON.parse(readFileSync(new URL(`../i18n/locales/${language}.json`, import.meta.url), "utf8"));
      for (const [group, key] of [["common", "loading"], ["common", "error"], ["common", "retry"], ["nav", "sign_out"]]) {
        assert.equal(typeof locale[group]?.[key], "string", `${language}: ${group}.${key}`);
        assert.ok(locale[group][key].trim());
      }
    }
  });

  it("does not mount API queries until the token getter is registered", async () => {
    const h = appHarness();
    const session = h.mountSession();
    assert.notEqual(session.initial.type, QueryClientProvider);
    assert.equal(session.ready.type, QueryClientProvider);
    assert.equal(await h.getter(), "token_a");
    session.cleanup();
  });

  it("isolates cached admin data and late mutation writes across account switching", () => {
    const h = appHarness();
    const a = h.mountSession();
    const oldClient = a.ready.props.client as QueryClient;
    oldClient.setQueryData(["/api/users/me"], { role: "admin" });
    const oldKey = h.components.ClerkSessionBoundary({ children: "content" }).key;
    h.setAuth({ isLoaded: true, userId: "user_b", sessionId: "session_b" });
    a.cleanup();
    const b = h.mountSession();
    const newClient = b.ready.props.client as QueryClient;
    assert.notEqual(h.components.ClerkSessionBoundary({ children: "content" }).key, oldKey);
    assert.notEqual(newClient, oldClient);
    // A completion callback retaining the previous client's reference is harmless.
    oldClient.setQueryData(["/api/users/me"], { role: "admin" });
    assert.equal(newClient.getQueryData(["/api/users/me"]), undefined);
    b.cleanup(); oldClient.clear();
  });

  it("rejects a token that resolves after Clerk switches sessions", async () => {
    const h = appHarness();
    let resolve!: (token: string) => void;
    h.setToken(() => new Promise<string>((done) => { resolve = done; }));
    const a = h.mountSession();
    const pending = h.getter();
    h.setAuth({ isLoaded: true, userId: "user_b", sessionId: "session_b" });
    resolve("old_token");
    await assert.rejects(pending, /Authentication session changed/);
    a.cleanup();
  });

  it("does not mount the session subtree while Clerk is loading", () => {
    const h = appHarness();
    h.setAuth({ isLoaded: false, userId: "user_a", sessionId: "session_a" });
    assert.notEqual(h.components.ClerkSessionBoundary({ children: "content" }).type, h.components.ClerkSession);
  });

  it("blocks protected content for API errors, disabled users and mismatched identities", () => {
    const h = appHarness();
    for (const result of [
      { isError: true, data: { isActive: true, clerkId: "user_a" } },
      { data: { isActive: false, clerkId: "user_a" } },
      { data: { isActive: true, clerkId: "user_b" } },
    ]) {
      h.setResult(result);
      assert.equal(h.components.LocalUserGate({ children: "protected" }).props.role, "alert");
    }
    h.setResult({ data: { isActive: true, clerkId: "user_a" } });
    assert.equal(h.components.LocalUserGate({ children: "protected" }), "protected");
  });

  it("does not render admin content for a non-admin", () => {
    const h = appHarness();
    h.setResult({ data: { role: "client" } });
    assert.equal(h.components.AdminRouteContent({ component: () => "admin" }).type, h.redirect);
  });

  it("ignores the proxy for development keys in production builds", () => {
    assert.equal(appHarness().components.ClerkProviderWithRoutes().props.proxyUrl, undefined);
    assert.equal(appHarness("pk_live_fixture").components.ClerkProviderWithRoutes().props.proxyUrl, "/api/__clerk");
  });
});
