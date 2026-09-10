import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("revenue query cache separates currencies and analytics no longer invents dollar cents", async () => {
  const requests: unknown[][] = [];
  const dependencies: Record<string, unknown> = {
    "@tanstack/react-query": { useQuery: (options: unknown) => options },
    "@workspace/api-client-react": { customFetch: async (...args: unknown[]) => { requests.push(args); return {}; } },
  };
  const module = { exports: {} as { useRevenueReport: (currency: string) => { queryKey: unknown[]; queryFn: (context: { signal: AbortSignal }) => Promise<unknown> } } };
  const code = ts.transpileModule(readFileSync(new URL("./revenueReport.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)((name: string) => { assert.ok(Object.hasOwn(dependencies, name)); return dependencies[name]; }, module, module.exports);
  const eur = module.exports.useRevenueReport("EUR"); const usd = module.exports.useRevenueReport("USD");
  assert.notDeepEqual(eur.queryKey, usd.queryKey);
  const signal = new AbortController().signal;
  await eur.queryFn({ signal }); await usd.queryFn({ signal });
  assert.equal(requests[0]![0], "/api/admin/revenue?currency=EUR");
  assert.equal(requests[1]![0], "/api/admin/revenue?currency=USD");
  assert.equal((requests[0]![1] as { signal: AbortSignal }).signal, signal);
  const analytics = readFileSync(new URL("../pages/AdminAnalytics.tsx", import.meta.url), "utf8");
  assert.ok(analytics.includes("format(revenue.data?.overview.totalRevenue)"));
  assert.ok(!analytics.includes("sales?.totalRevenue"));
  for (const file of ["AdminAnalytics.tsx", "AdminRevenue.tsx"]) {
    const source = readFileSync(new URL(`../pages/${file}`, import.meta.url), "utf8");
    assert.ok(source.includes("admin_revenue.excluded_currency"));
    assert.ok(source.includes("excludedCurrencyInvoices"));
    assert.ok(!source.includes('client.tier ?? "at_risk"'));
  }
});
