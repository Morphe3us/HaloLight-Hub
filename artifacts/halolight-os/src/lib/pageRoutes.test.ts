import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";
import ts from "typescript";
import { retryablePageLoader } from "./pageLoader";
import { createAdminNavigation, createClientNavigation, type NavItem } from "../components/layout/sidebarNavigation";

describe("retryable page loader", () => {
  it("deduplicates pending and fulfilled imports without loading eagerly", async () => {
    let calls = 0;
    let resolve!: (value: string) => void;
    const load = retryablePageLoader(() => {
      calls++;
      return new Promise<string>((done) => { resolve = done; });
    });
    assert.equal(calls, 0);
    const first = load();
    assert.equal(load(), first);
    await Promise.resolve();
    assert.equal(calls, 1);
    resolve("page");
    assert.equal(await first, "page");
    assert.equal(load(), first);
    assert.equal(calls, 1);
  });

  it("evicts asynchronous rejections and synchronous throws for the next attempt", async () => {
    for (const synchronous of [false, true]) {
      let calls = 0;
      const load = retryablePageLoader(() => {
        if (++calls === 1) {
          if (synchronous) throw new Error("Chunk unavailable");
          return Promise.reject(new Error("Chunk unavailable"));
        }
        return Promise.resolve("page");
      });
      await assert.rejects(load(), /Chunk unavailable/);
      assert.equal(await load(), "page");
      assert.equal(calls, 2);
    }
  });
});

type PageModule = { default: () => null };
type PageRoute = {
  path: string;
  admin: boolean;
  load: () => Promise<PageModule>;
  component: { load: () => Promise<PageModule> };
};
const compiledRoutes = ts.transpileModule(readFileSync(new URL("./pageRoutes.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function registryHarness() {
  const imports: string[] = [];
  let fail = false;
  let mounts = 0;
  const module = { exports: {} as { protectedPages: PageRoute[]; preloadSidebarPage: (href: string) => void } };
  runInNewContext(compiledRoutes, {
    module, exports: module.exports,
    require: (id: string) => {
      if (id === "react") return { lazy: (load: PageRoute["load"]) => ({ load }) };
      if (id === "./pageLoader") return { retryablePageLoader };
      // Any App, auth, transport or query-client import fails this test.
      assert.ok(id.startsWith("../pages/"), `Unexpected dependency: ${id}`);
      imports.push(id);
      if (fail) throw new Error("Chunk unavailable");
      return { default: () => { mounts++; return null; } };
    },
  });
  return {
    ...module.exports, imports,
    get mounts() { return mounts; },
    setFailure(value: boolean) { fail = value; },
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("sidebar page code preloading", () => {
  it("does not import pages at registration or for unknown/public/group destinations", async () => {
    const h = registryHarness();
    assert.deepEqual(h.imports, []);
    for (const href of ["/", "/sign-in", "/missing", "/crm", "/admin/group/settings", "https://example.test/academy"]) {
      h.preloadSidebarPage(href);
    }
    await flush();
    assert.deepEqual(h.imports, []);
    assert.equal(h.mounts, 0);
  });

  it("shares one target import between repeated intent and lazy navigation", async () => {
    const h = registryHarness();
    h.preloadSidebarPage("/academy");
    h.preloadSidebarPage("/academy");
    const route = h.protectedPages.find(({ path }) => path === "/academy")!;
    assert.equal(route.component.load, route.load);
    await route.component.load();
    h.preloadSidebarPage("/academy");
    await flush();
    assert.deepEqual(h.imports, ["../pages/Academy"]);
    assert.equal(h.mounts, 0);
  });

  it("swallows speculative failures and allows both later intent and navigation to retry", async () => {
    for (const retryViaNavigation of [false, true]) {
      const h = registryHarness();
      h.setFailure(true);
      h.preloadSidebarPage("/admin/academy");
      await flush();
      h.setFailure(false);
      const route = h.protectedPages.find(({ path }) => path === "/admin/academy")!;
      assert.equal(route.admin, true);
      if (retryViaNavigation) await route.component.load();
      else h.preloadSidebarPage("/admin/academy");
      await flush();
      assert.deepEqual(h.imports, ["../pages/AdminAcademy", "../pages/AdminAcademy"]);
      assert.equal(h.mounts, 0);
    }
  });

  it("covers every client/admin leaf without importing any on registration", () => {
    const h = registryHarness();
    const leaves = (items: NavItem[]): NavItem[] => items.flatMap((item) => item.children ? leaves(item.children) : [item]);
    for (const [items, admin] of [
      [createClientNavigation((key) => key), false],
      [createAdminNavigation((key) => key), true],
    ] as const) {
      for (const item of leaves(items)) {
        const matches = h.protectedPages.filter(({ path }) => path === item.href);
        assert.equal(matches.length, 1, item.href);
        assert.equal(matches[0].admin, admin, item.href);
      }
    }
    assert.deepEqual(h.imports, []);
  });
});
