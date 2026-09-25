import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { retryablePageLoader } from "./pageLoader";
import { apiErrorStatus } from "./apiErrorMessage";
import {
  isPlaceholderDisplayName,
  resolveCurrentUserIdentity,
} from "./currentUserIdentity";

describe("resolveCurrentUserIdentity", () => {
  it("uses Auth profile when the API user is still a placeholder", () => {
    const identity = resolveCurrentUserIdentity(
      {
        authId: "user_fixture",
        email: "user_123@placeholder.com",
        firstName: null,
        lastName: null,
        fullName: null,
      },
      {
        id: "user_fixture",
        email: "info@example.com",
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

  it("keeps complete API profile over Auth fallback", () => {
    const identity = resolveCurrentUserIdentity(
      {
        authId: "user_fixture",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "Local",
        fullName: "Owner Local",
      },
      {
        id: "user_fixture",
        email: "auth@example.com",
        firstName: "Auth",
        lastName: "User",
        fullName: "Auth User",
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
    const identity = resolveCurrentUserIdentity(
      {
        authId: "user_fixture",
        email: "user_google@placeholder.com",
        firstName: "User",
        lastName: "Member",
        fullName: "User Member",
      },
      {
        id: "user_fixture",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
      },
    );
    assert.equal(identity.displayName, "Ada Lovelace");
    assert.equal(identity.initials, "AL");
  });

  it("discards another account's cached API name and email", () => {
    const identity = resolveCurrentUserIdentity(
      {
        authId: "user_previous",
        fullName: "Previous Admin",
        email: "admin@example.com",
      },
      {
        id: "user_current",
        fullName: "Current Member",
        email: "member@example.com",
      },
    );
    assert.deepEqual(identity, {
      displayName: "Current Member",
      email: "member@example.com",
      initials: "CM",
    });
  });

  it("uses the real email when both name sources contain placeholders", () => {
    assert.equal(
      resolveCurrentUserIdentity(
        {
          authId: "user_fixture",
          fullName: "User",
          firstName: "User",
          email: "ada.lovelace@example.com",
        },
        { id: "user_fixture", fullName: "User Member" },
      ).displayName,
      "Ada Lovelace",
    );
  });
});

// Exercise App's actual session boundary without a browser, Auth network calls,
// or new test dependencies. Hook state/effect ordering is driven explicitly.
const require = createRequire(import.meta.url);
const { matchRoute } = require("wouter");
const { parse } = createRequire(require.resolve("wouter"))("regexparam");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const compiledRoutes = ts.transpileModule(
  readFileSync(new URL("./pageRoutes.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const compiledApp = ts.transpileModule(
  `${appSource}\nexport { AuthSession, AuthSessionBoundary, LocalUserGate, AdminRouteContent, AuthRoutes, RequestedRoutePreloader, ProtectedRoutes };`,
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    transformers: {
      before: [
        (context) => (root) => {
          const visit = (node: ts.Node): ts.VisitResult<ts.Node> => {
            if (
              ts.isPropertyAccessExpression(node) &&
              ts.isMetaProperty(node.expression) &&
              node.name.text === "env"
            ) {
              return ts.factory.createIdentifier("__env");
            }
            return ts.visitEachChild(node, visit, context);
          };
          return ts.visitNode(root, visit) as ts.SourceFile;
        },
      ],
    },
  },
).outputText;

function appHarness() {
  let tokenGetter: null | (() => Promise<string | null>) = null;
  let auth = { isLoaded: true, userId: "user_a", sessionId: "session_a" };
  let token = async () => "token_a";
  let result: Record<string, unknown> = {};
  let hookIndex = 0;
  let states: unknown[] = [];
  let effects: Array<() => () => void> = [];
  let scheduleEffects = true;
  let location = "/";
  let signedIn = true;
  let failImport = false;
  const imports: string[] = [];
  let pageMounts = 0;
  let userQueries = 0;
  let preloadDeps: unknown[] | undefined;
  let renderingPreloader = false;
  const pass = ({ children }: { children: unknown }) => children;
  const redirect = () => null;
  const module = { exports: {} as Record<string, (props?: any) => any> };
  runInNewContext(compiledApp, {
    module,
    exports: module.exports,
    window: { location: { origin: "https://app.example.com", reload() {} } },
    __env: { BASE_URL: "/", DEV: false },
    require: (id: string) => {
      if (id === "react")
        return {
          lazy: () => pass,
          Suspense: pass,
          useState: (init: unknown) => {
            const index = hookIndex++;
            if (!(index in states))
              states[index] = typeof init === "function" ? init() : init;
            return [
              states[index],
              (value: unknown) => {
                states[index] = value;
              },
            ];
          },
          useEffect: (effect: () => () => void, deps: unknown[]) => {
            if (renderingPreloader) {
              if (
                !preloadDeps ||
                deps.some(
                  (value, index) => !Object.is(value, preloadDeps![index]),
                )
              ) {
                effects.push(effect);
              }
              preloadDeps = deps;
            } else if (scheduleEffects) effects.push(effect);
          },
        };
      if (id === "react/jsx-runtime") return require(id);
      if (id === "react-i18next")
        return { useTranslation: () => ({ t: (key: string) => key }) };
      if (id === "./auth/AuthProvider")
        return {
          useAuth: () => {
            const expected = JSON.stringify(auth);
            return {
              status: !auth.isLoaded
                ? "loading"
                : signedIn
                  ? "signed-in"
                  : "signed-out",
              user: { id: auth.userId },
              sessionKey: JSON.stringify([auth.userId, auth.sessionId]),
              requiresPassword: false,
              signOut() {},
              getToken: async () => {
                const value = await token();
                if (JSON.stringify(auth) !== expected)
                  throw new Error("Authentication session changed");
                return value;
              },
            };
          },
          AuthProvider: pass,
        };
      if (id === "./pages/Auth") return { AuthPage: pass };
      if (id === "@workspace/api-client-react")
        return {
          setAuthTokenGetter: (getter: typeof tokenGetter) => {
            tokenGetter = getter;
          },
          useGetCurrentUser: () => {
            userQueries++;
            return result;
          },
        };
      if (id === "@tanstack/react-query")
        return { QueryClient, QueryClientProvider };
      if (id === "./lib/queryClient")
        return {
          queryClient: new QueryClient({
            defaultOptions: { queries: { retry: 1 } },
          }),
        };
      if (id === "./lib/pageRoutes") {
        const routes = { exports: {} };
        runInNewContext(compiledRoutes, {
          module: routes,
          exports: routes.exports,
          require: (name: string) => {
            if (name === "react") return { lazy: () => pass };
            if (name === "./pageLoader") return { retryablePageLoader };
            if (name.startsWith("../pages/")) {
              imports.push(name.replace("../pages/", "./pages/"));
              if (failImport) throw new Error("Chunk unavailable");
              return {
                default: () => {
                  pageMounts++;
                  return null;
                },
              };
            }
            throw new Error(`Unexpected route dependency: ${name}`);
          },
        });
        return routes.exports;
      }
      if (id === "./lib/apiErrorMessage") return { apiErrorStatus };
      if (id === "wouter")
        return {
          Redirect: redirect,
          useLocation: () => [location, () => {}],
          useRouter: () => ({ parser: parse }),
          matchRoute,
          Route: pass,
          Switch: pass,
        };
      if (id === "./components/theme-provider") return { ThemeProvider: pass };
      if (id === "./components/layout/AppShell") return { AppShell: pass };
      if (id === "./components/LanguageSync") return { LanguageSync: pass };
      if (id === "./components/ConsentGate") return { ConsentGate: pass };
      if (id === "@/components/ui/toaster") return { Toaster: pass };
      if (id === "@/components/ui/tooltip") return { TooltipProvider: pass };
      if (id.startsWith("./pages/")) {
        imports.push(id);
        if (failImport) throw new Error("Chunk unavailable");
        return {
          default: () => {
            pageMounts++;
            return null;
          },
        };
      }
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return {
    components: module.exports,
    redirect,
    imports,
    get pageMounts() {
      return pageMounts;
    },
    get userQueries() {
      return userQueries;
    },
    setLocation: (next: string) => {
      location = next;
    },
    setSignedIn: (next: boolean) => {
      signedIn = next;
    },
    setImportFailure: (next: boolean) => {
      failImport = next;
    },
    preload: async () => {
      effects = [];
      scheduleEffects = true;
      renderingPreloader = true;
      module.exports.RequestedRoutePreloader();
      renderingPreloader = false;
      effects.forEach((effect) => effect());
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    get getter() {
      return tokenGetter!;
    },
    setAuth: (next: typeof auth) => {
      auth = next;
    },
    setToken: (next: typeof token) => {
      token = next;
    },
    setResult: (next: typeof result) => {
      result = next;
    },
    mountSession: () => {
      states = [];
      effects = [];
      hookIndex = 0;
      scheduleEffects = true;
      const initial = module.exports.AuthSession({
        children: "protected content",
      });
      const cleanup = effects.map((effect) => effect());
      scheduleEffects = false;
      hookIndex = 0;
      const ready = module.exports.AuthSession({
        children: "protected content",
      });
      return { initial, ready, cleanup: () => cleanup.forEach((fn) => fn()) };
    },
  };
}

describe("auth loading and session isolation", () => {
  it("all auth loading and recovery labels exist in all eight locales", () => {
    for (const language of ["en", "fr", "es", "de", "it", "pl", "pt", "nl"]) {
      const locale = JSON.parse(
        readFileSync(
          new URL(`../i18n/locales/${language}.json`, import.meta.url),
          "utf8",
        ),
      );
      for (const [group, key] of [
        ["common", "loading"],
        ["common", "error"],
        ["common", "access_not_validated"],
        ["common", "retry"],
        ["nav", "sign_out"],
      ]) {
        assert.equal(
          typeof locale[group]?.[key],
          "string",
          `${language}: ${group}.${key}`,
        );
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
    const oldKey = h.components.AuthSessionBoundary({
      children: "content",
    }).key;
    h.setAuth({ isLoaded: true, userId: "user_b", sessionId: "session_b" });
    a.cleanup();
    const b = h.mountSession();
    const newClient = b.ready.props.client as QueryClient;
    assert.notEqual(
      h.components.AuthSessionBoundary({ children: "content" }).key,
      oldKey,
    );
    assert.notEqual(newClient, oldClient);
    // A completion callback retaining the previous client's reference is harmless.
    oldClient.setQueryData(["/api/users/me"], { role: "admin" });
    assert.equal(newClient.getQueryData(["/api/users/me"]), undefined);
    b.cleanup();
    oldClient.clear();
  });

  it("rejects a token that resolves after Auth switches sessions", async () => {
    const h = appHarness();
    let resolve!: (token: string) => void;
    h.setToken(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const a = h.mountSession();
    const pending = h.getter();
    h.setAuth({ isLoaded: true, userId: "user_b", sessionId: "session_b" });
    resolve("old_token");
    await assert.rejects(pending, /Authentication session changed/);
    a.cleanup();
  });

  it("does not mount the session subtree while Auth is loading", () => {
    const h = appHarness();
    h.setAuth({ isLoaded: false, userId: "user_a", sessionId: "session_a" });
    assert.notEqual(
      h.components.AuthSessionBoundary({ children: "content" }).type,
      h.components.AuthSession,
    );
  });

  it("blocks protected content for API errors, disabled users and mismatched identities", () => {
    const h = appHarness();
    for (const result of [
      { isError: true, data: { isActive: true, authId: "user_a" } },
      { data: { isActive: false, authId: "user_a" } },
      { data: { isActive: true, authId: "user_b" } },
      { data: { isActive: true } },
      { data: { isActive: true, authId: "" } },
    ]) {
      h.setResult(result);
      assert.equal(
        h.components.LocalUserGate({ children: "protected" }).props.role,
        "alert",
      );
    }
    h.setResult({ data: { isActive: true, authId: "user_a" } });
    assert.equal(
      h.components.LocalUserGate({ children: "protected" }),
      "protected",
    );
  });

  it("explains access validation failures without exposing API diagnostics", () => {
    const h = appHarness();
    for (const result of [
      {
        isError: true,
        error: { status: 401, data: { error: "Internal identity diagnostic" } },
      },
      { isError: true, error: { status: 403 } },
      {
        isError: true,
        error: { status: 401 },
        data: { isActive: true, authId: "user_a" },
      },
      { data: { isActive: false, authId: "user_a" } },
      { data: { isActive: true, authId: "user_b" } },
    ]) {
      h.setResult(result);
      const alert = h.components.LocalUserGate({ children: "protected" });
      assert.equal(alert.props.role, "alert");
      assert.equal(
        alert.props.children[0].props.children,
        "common.access_not_validated",
      );
      const buttons = alert.props.children[1].props.children;
      assert.equal(buttons[0].props.children, "common.retry");
      assert.equal(buttons[1].props.children, "nav.sign_out");
    }
  });

  it("keeps network, server and other errors generic even without valid user data", () => {
    const h = appHarness();
    for (const error of [
      new Error("Failed to fetch"),
      { status: 500 },
      { status: 503 },
      { status: 404 },
      { status: "401" },
      null,
    ]) {
      for (const data of [
        undefined,
        { isActive: false, authId: "user_b" },
        { isActive: true, authId: "user_a" },
      ]) {
        h.setResult({ isError: true, error, data });
        const alert = h.components.LocalUserGate({ children: "protected" });
        assert.equal(alert.props.role, "alert");
        assert.equal(alert.props.children[0].props.children, "common.error");
      }
    }
  });

  it("keeps pending access validation in the loading state", () => {
    const h = appHarness();
    h.setResult({ isPending: true });
    const pending = h.components.LocalUserGate({ children: "protected" });
    assert.equal(pending.type().props.role, "status");
  });

  it("does not render admin content for a non-admin", () => {
    const h = appHarness();
    h.setResult({ data: { role: "client" } });
    assert.equal(
      h.components.AdminRouteContent({ component: () => "admin" }).type,
      h.redirect,
    );
  });

  it("does not expose public signup", () => {
    assert.ok(!appSource.includes("ALLOW_PUBLIC_SIGNUPS"));
    assert.ok(appSource.includes('<Redirect to="/sign-in" />'));
  });
});

describe("requested route code preloading", () => {
  it("preloads only the requested academy or admin module during local validation", async () => {
    for (const [path, page] of [
      ["/academy", "Academy"],
      ["/academy/course-1", "AcademyCourse"],
      ["/academy/course-1/lesson-2", "AcademyLesson"],
      ["/admin/academy", "AdminAcademy"],
      ["/admin/clients/client-1", "Client360"],
      ["/kb/admin", "KBAdmin"],
      ["/community/posts/post-1", "PostDetail"],
    ]) {
      const h = appHarness();
      h.setLocation(path);
      h.setResult({ isPending: true });
      await h.preload();
      assert.deepEqual(h.imports, [`./pages/${page}`]);
      assert.equal(h.userQueries, 0);
      assert.equal(h.pageMounts, 0);
      assert.equal(
        h.components.LocalUserGate({ children: "protected" }).type().props.role,
        "status",
      );
    }
  });

  it("does not burst-prefetch or unblock content when local authorization fails", async () => {
    for (const result of [
      { isError: true, error: { status: 403 } },
      { data: { isActive: false, authId: "user_a" } },
      { data: { isActive: true, authId: "user_b" } },
    ]) {
      const h = appHarness();
      h.setLocation("/academy/course-1/lesson-2");
      h.setResult(result);
      await h.preload();
      await h.preload();
      assert.deepEqual(h.imports, ["./pages/AcademyLesson"]);
      assert.equal(
        h.components.LocalUserGate({ children: "protected" }).props.role,
        "alert",
      );
      assert.equal(h.pageMounts, 0);
    }
  });

  it("skips signed-out, public and unmatched paths", async () => {
    const h = appHarness();
    h.setSignedIn(false);
    h.setLocation("/admin/academy");
    await h.preload();
    h.setSignedIn(true);
    for (const path of [
      "/",
      "/sign-in",
      "/sign-in/factor-one",
      "/sign-up",
      "/missing",
      "/academy/a/b/extra",
    ]) {
      h.setLocation(path);
      await h.preload();
    }
    assert.deepEqual(h.imports, []);
  });

  it("reacts to navigation and sign-in without reloading on validation rerenders", async () => {
    const h = appHarness();
    h.setSignedIn(false);
    h.setLocation("/academy/course-1");
    await h.preload();
    h.setSignedIn(true);
    await h.preload();
    h.setResult({ data: { isActive: true, authId: "user_a" } });
    await h.preload();
    h.setLocation("/academy/course-1/lesson-2");
    await h.preload();
    assert.deepEqual(h.imports, [
      "./pages/AcademyCourse",
      "./pages/AcademyLesson",
    ]);
  });

  it("handles speculative import failures without bypassing admin authorization", async () => {
    const h = appHarness();
    h.setLocation("/admin/academy");
    h.setImportFailure(true);
    await h.preload();
    h.setResult({ data: { role: "client" } });
    assert.equal(
      h.components.AdminRouteContent({ component: () => "admin" }).type,
      h.redirect,
    );
    assert.deepEqual(h.imports, ["./pages/AdminAcademy"]);
    assert.equal(h.pageMounts, 0);
  });

  it("keeps the application shell and route switch inside LocalUserGate", () => {
    const h = appHarness();
    assert.equal(
      h.components.ProtectedRoutes().type,
      h.components.LocalUserGate,
    );
  });
});
