import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { usersTable } from "../../../../lib/db/src/schema/users";
import { invoices } from "../../../../lib/db/src/schema/invoices";
import { quotes } from "../../../../lib/db/src/schema/quotes";
import { customerSuccessScores } from "../../../../lib/db/src/schema/success";
import * as calculations from "../lib/revenueCalculations";

test("revenue API uses payment months, one currency, integer cents and issued-quote denominator", async (t) => {
  const now = new Date(); const month = now.toISOString().slice(0, 7);
  const rows = [
    { userId: "a", total: "0.10", status: "paid", currency: "EUR", paidAt: now, paidMonth: month, createdAt: new Date("2000-01-01") },
    { userId: "a", total: "0.20", status: "paid", currency: "EUR", paidAt: now, paidMonth: month },
    { userId: "b", total: "9.99", status: "paid", currency: "EUR", paidAt: null, paidMonth: null },
    { userId: "a", total: "3.14", status: "sent", currency: "EUR", dueDate: new Date(now.getTime() + 86400000) },
    { userId: "a", total: "6.22", status: "overdue", currency: "EUR" },
    { userId: "a", total: "999.00", status: "draft", currency: "EUR" },
    { userId: "a", total: "1000.55", status: "paid", currency: "USD", paidAt: now, paidMonth: month },
    { userId: "a", total: "500.00", status: "paid", currency: null, paidAt: now, paidMonth: month },
    { userId: "a", total: "600.00", status: "paid", currency: "ZZQ", paidAt: now, paidMonth: month },
  ];
  const quoteRows = [
    ...Array.from({ length: 5 }, () => ({ status: "draft", total: "0.10", currency: "EUR" })),
    { status: "sent", total: "1.23", currency: "EUR" }, { status: "accepted", total: "2.34", currency: "EUR" },
    { status: "accepted", total: "999.99", currency: "USD" },
  ];
  let queries = 0;
  const query = (columns?: Record<string, unknown>, distinct = false) => {
    queries++; let table: unknown; let params: unknown[] = []; let grouped = false;
    const chain = {
      from(value: unknown) { table = value; return chain; },
      groupBy() { grouped = true; return chain; },
      where(value: drizzle.SQL) {
        const compiled = new PgDialect().sqlToQuery(value); params = compiled.params;
        if (table === invoices || table === quotes) assert.match(compiled.sql, /upper\(trim\(/);
        return chain;
      },
      then(resolve: (value: unknown[]) => unknown) {
        let result: unknown[] = [];
        if (table === invoices || table === quotes) {
          const source = table === invoices ? rows : quoteRows;
          result = distinct || grouped ? [...new Set(source.map((row) => row.currency))].map((currency) => ({ currency, invoiceCount: source.filter((row) => row.currency === currency).length })) : source.filter((row) => row.currency === params[0]);
          if (!distinct && !grouped && table === invoices) {
            assert.match(new PgDialect().sqlToQuery(columns!.paidMonth as drizzle.SQL).sql, /to_char\("invoices"\."paid_at"/);
            assert.equal(columns!.createdAt, undefined);
          }
        } else if (table === usersTable) result = [{ id: "a", fullName: "A", email: "a@example.test" }, { id: "b", fullName: "B", email: "b@example.test" }];
        else if (table === customerSuccessScores) result = [{ userId: "a", score: 80, tier: "healthy" }];
        return Promise.resolve(result).then(resolve);
      },
    };
    return chain;
  };
  const dependencies: Record<string, unknown> = {
    express, "drizzle-orm": drizzle, "@workspace/db": { db: { select: query, selectDistinct: (columns: Record<string, unknown>) => query(columns, true) }, usersTable, invoices, quotes, customerSuccessScores },
    "../lib/revenueCalculations": calculations,
    "../middlewares/requireAuth": { requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() },
    "../lib/userSync": { getOrCreateUser: async (req: express.Request) => req.headers["x-role"] ? { role: req.headers["x-role"], currency: "EUR" } : null },
  };
  const module = { exports: {} as { default: express.Router; invoiceCents: (value: string) => number; revenueMonths: (date: Date) => unknown[] } };
  const code = transformSync(readFileSync(new URL("./revenue.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }, module, module.exports);
  assert.equal(module.exports.invoiceCents("0.10"), 10); assert.equal(module.exports.invoiceCents("-1.23"), -123);
  assert.throws(() => module.exports.invoiceCents("0.001"));
  assert.equal(module.exports.revenueMonths(new Date("2026-01-01T00:01:00Z")).length, 12);
  const app = express(); app.use(module.exports.default);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/revenue`;
  const request = (suffix = "", role = "admin") => fetch(base + suffix, { headers: role ? { "x-role": role } : {} });
  assert.equal((await request("", "")).status, 401); assert.equal((await request("", "client")).status, 403); assert.equal(queries, 0);
  assert.equal((await request("?currency=EUR&currency=USD")).status, 400); assert.equal((await request("?currency=ALL")).status, 200);
  assert.equal((await request("?currency=ZZQ")).status, 400);
  const response = await request(); const report = await response.json() as Record<string, any>;
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(report.currency, "EUR"); assert.deepEqual(report.availableCurrencies, ["EUR", "USD"]);
  assert.equal(report.excludedCurrencyInvoices, 2);
  assert.equal(report.overview.totalRevenue, 10.29); assert.equal(report.overview.totalInvoiced, 19.65);
  assert.equal(report.overview.totalUnpaid, 9.36); assert.equal(report.overview.avgBookingValue, 3.43);
  assert.equal(report.monthly.find((row: any) => row.month === month).revenue, 0.3);
  assert.equal(report.undatedPaidInvoices, 1); assert.equal(report.overview.revenueGrowth, null);
  assert.equal(report.quoteFunnel.acceptanceRate, 50); assert.equal(report.quoteFunnel.issuedQuotes, 2);
  assert.equal(report.quoteFunnel.draft.value, 0.5); assert.ok(!Object.hasOwn(report.overview, "lifetimeEstimate"));
  assert.equal(report.revenueBySegment[0].revenue, 10.29); assert.match(report.revenueBySegment[0].label, /EUR/);
  assert.equal(report.clientLeaderboard.find((row: any) => row.userId === "a").avgBooking, 0.15);
  assert.equal(report.clientLeaderboard.find((row: any) => row.userId === "b").tier, null);
  const usd = await (await request("?currency=usd")).json() as Record<string, any>;
  assert.equal(usd.currency, "USD"); assert.equal(usd.overview.totalRevenue, 1000.55); assert.equal(usd.quoteFunnel.acceptanceRate, 100);
  assert.equal(usd.excludedCurrencyInvoices, 2, "EUR invoices are not counted as unknown under the USD filter");
});
