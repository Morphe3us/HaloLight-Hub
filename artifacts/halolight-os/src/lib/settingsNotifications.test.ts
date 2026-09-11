import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { QueryClient, MutationObserver, QueryObserver } from "@tanstack/react-query";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
const component = source.slice(source.indexOf("export function NotificationPreferences()"), source.indexOf("export default function Settings()"));

function fixture(client?: QueryClient) {
  const prefs = { data: undefined as undefined | { userId: string; inAppEnabled: boolean; emailEnabled: boolean }, isLoading: true, isFetching: true, isError: false, refetch: () => { retries++; } };
  let retries = 0;
  const requests: any[] = [];
  let callbacks: any;
  let hookOptions: any;
  const mutation = { isPending: false, isError: false, isSuccess: false, mutate(body: unknown, handlers: unknown) {
    requests.push(body); callbacks = handlers; mutation.isPending = true; mutation.isError = false; mutation.isSuccess = false;
  } };
  const refs: any[] = [];
  let cursor = 0;
  const deps: Record<string, any> = {
    useRef: (value: unknown) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
    useTranslation: () => ({ t: (key: string) => key }),
    useQueryClient: () => client ?? ({ getQueryData: () => ({ id: "A" }), cancelQueries: async () => {}, setQueryData: (_key: unknown, data: typeof prefs.data) => { prefs.data = data; } }),
    useGetNotificationPreferences: () => prefs,
    useUpdateNotificationPreferences: (options: any) => { hookOptions = options.mutation; return mutation; },
    getGetNotificationPreferencesQueryKey: () => ["notifications/preferences"],
    getGetCurrentUserQueryKey: () => ["/api/users/me"],
  };
  for (const name of ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent", "Label", "Switch", "Alert", "AlertDescription", "Button", "RefreshCw"]) deps[name] = name;
  const module = { exports: {} as any };
  const code = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", ...Object.keys(deps), code)(require, module, module.exports, ...Object.values(deps));
  const walk = (node: any): any[] => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
  const render = () => { cursor = 0; return walk(module.exports.NotificationPreferences()); };
  const ready = () => { prefs.data = { userId: "A", inAppEnabled: true, emailEnabled: true }; prefs.isLoading = false; prefs.isFetching = false; };
  const settle = async (success: boolean) => {
    mutation.isPending = false; mutation.isError = !success; mutation.isSuccess = success;
    if (success) await hookOptions.onSuccess({ ...prefs.data, inAppEnabled: requests.at(-1).data.inAppEnabled });
    callbacks.onSettled();
  };
  return { prefs, mutation, requests, render, ready, settle, retries: () => retries, hookOptions: () => hookOptions };
}

test("loading is local, switch is controlled and disabled, email is informational only", () => {
  const f = fixture(); const nodes = f.render();
  const switches = nodes.filter(n => n.type === "Switch");
  assert.equal(switches.length, 1);
  assert.equal(switches[0].props.checked, false);
  assert.equal(switches[0].props.disabled, true);
  switches[0].props.onCheckedChange(true);
  assert.equal(f.requests.length, 0);
  assert.ok(nodes.some(n => n.props.children === "settings.email_notifications_desc"));
  assert.ok(!source.includes("isLoadingUser || isLoadingPrefs"));
});

test("failed preferences block writes and offer retry, including stale cached data", () => {
  const f = fixture(); f.ready(); f.prefs.isError = true;
  let nodes = f.render();
  assert.equal(nodes.find(n => n.type === "Switch").props.disabled, true);
  nodes.find(n => n.type === "Button").props.onClick();
  assert.equal(f.retries(), 1);
  assert.equal(f.requests.length, 0);
  f.prefs.isFetching = true; nodes = f.render();
  assert.equal(nodes.find(n => n.type === "Button").props.disabled, true);
});

test("save sends only in-app choice, prevents duplicate writes and commits response to cache", async () => {
  const f = fixture(); f.ready();
  const change = f.render().find(n => n.type === "Switch").props.onCheckedChange;
  change(false); change(false);
  assert.deepEqual(f.requests, [{ data: { inAppEnabled: false } }]);
  assert.equal(f.render().find(n => n.type === "Switch").props.disabled, true);
  assert.equal(f.render().find(n => n.props.role === "status").props.children, "settings.saving");
  await f.settle(true);
  assert.equal(f.prefs.data?.emailEnabled, true);
  assert.equal(f.render().find(n => n.type === "Switch").props.checked, false);
  assert.equal(f.render().find(n => n.props.role === "status").props.children, "settings.saved");
});

test("save failure keeps server choice and retries the attempted value without exposing raw error", async () => {
  const f = fixture(); f.ready();
  f.render().find(n => n.type === "Switch").props.onCheckedChange(false);
  await f.settle(false);
  const nodes = f.render();
  assert.equal(nodes.find(n => n.type === "Switch").props.checked, true);
  assert.ok(nodes.some(n => n.props.children === "common.error"));
  nodes.find(n => n.type === "Button").props.onClick();
  assert.deepEqual(f.requests[1], { data: { inAppEnabled: false } });
});

test("switch has linked label/description and stable narrow-layout constraints", () => {
  const f = fixture(); f.ready(); const nodes = f.render();
  const control = nodes.find(n => n.type === "Switch");
  assert.ok(nodes.some(n => n.type === "Label" && n.props.htmlFor === control.props.id));
  assert.ok(nodes.some(n => n.props.id === control.props["aria-describedby"]));
  assert.match(control.props.className, /shrink-0/);
  assert.ok(nodes.some(n => /min-w-0/.test(n.props.className ?? "")));
  assert.equal(nodes.find(n => n.props.role === "status").props["aria-live"], "polite");
});

test("real mutation cache updates after unmount and cancels a stale GET before remount", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300000, retry: false }, mutations: { retry: false } } });
  const key = ["notifications/preferences"];
  const old = { userId: "A", inAppEnabled: true, emailEnabled: true };
  const saved = { userId: "A", inAppEnabled: false, emailEnabled: true };
  client.setQueryData(["/api/users/me"], { id: "A" });
  client.setQueryData(key, old);
  const f = fixture(client); f.ready(); f.render();
  let finishPut!: (data: typeof saved) => void;
  let finishGet!: (data: typeof old) => void;
  let observerCallbackRan = false;
  const observer = new MutationObserver(client, {
    ...f.hookOptions(),
    mutationFn: () => new Promise<typeof saved>(resolve => { finishPut = resolve; }),
  });
  const unmount = observer.subscribe(() => {});
  try {
    const pending = observer.mutate(undefined, { onSuccess: () => { observerCallbackRan = true; } });
    await Promise.resolve(); await Promise.resolve();
    unmount();
    const staleFetch = client.fetchQuery({ queryKey: key, staleTime: 0,
      queryFn: () => new Promise<typeof old>(resolve => { finishGet = resolve; }),
    }).catch(() => undefined);
    finishPut(saved);
    await pending;
    finishGet(old);
    await staleFetch;
    assert.equal(observerCallbackRan, false, "per-call callbacks really are dropped after unmount");
    assert.deepEqual(client.getQueryData(key), saved);
    const remounted = new QueryObserver(client, { queryKey: key, queryFn: async () => old });
    const stop = remounted.subscribe(() => {});
    assert.deepEqual(remounted.getCurrentResult().data, saved);
    assert.equal(remounted.getCurrentResult().isStale, false);
    stop();
  } finally { unmount(); client.clear(); }
});

test("late account A mutation only updates its discarded session client, never B", async () => {
  const clientA = new QueryClient();
  const clientB = new QueryClient();
  const key = ["notifications/preferences"];
  const accountB = { userId: "B", inAppEnabled: true, emailEnabled: false };
  const savedA = { userId: "A", inAppEnabled: false, emailEnabled: true };
  const f = fixture(clientA); f.ready(); f.render();
  let finish!: (data: unknown) => void;
  const observer = new MutationObserver(clientA, {
    ...f.hookOptions(), mutationFn: () => new Promise(resolve => { finish = resolve; }),
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    const pending = observer.mutate(undefined);
    await Promise.resolve(); await Promise.resolve();
    unsubscribe(); clientA.clear();
    clientB.setQueryData(key, accountB);
    finish(savedA);
    await pending;
    assert.deepEqual(clientA.getQueryData(key), savedA);
    assert.deepEqual(clientB.getQueryData(key), accountB);
  } finally { unsubscribe(); clientA.clear(); clientB.clear(); }
});
