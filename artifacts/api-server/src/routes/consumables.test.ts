import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../../../lib/db/src/schema/consumables";
import { usersTable } from "../../../../lib/db/src/schema/users";
import { events } from "../../../../lib/db/src/schema/events";
import * as usage from "../lib/consumableUsage";

test("consumable HTTP usage is owner-scoped and catalog plus stock creation is atomic", async t => {
  const id = "12345678-1234-4321-8123-123456789abc";
  const stock = { id, userId: "owner", currentQuantity: 5000, quantityUnit: null as string | null, estimatedDailyUsage: "99.00", averagePrintsPerEvent: null as number | null, averageEventsPerMonth: null as string | null };
  const inserts: Array<{ table: unknown; value: Record<string, unknown> }> = [];
  let inTransaction = false, failStock = false, updates = 0;
  let unitType = "prints";
  const db = {
    select() {
      let table: unknown;
      let where: drizzle.SQL;
      const result = () => {
        const compiled = new PgDialect().sqlToQuery(where);
        if (table === schema.consumableCatalog) return [{ id, unitType, reorderThreshold: 5 }];
        assert.match(compiled.sql, /"user_id"/);
        return compiled.params.includes(stock.userId) && compiled.params.includes(id) ? [{ ...stock, catalogItemId: id, unitType: stock.quantityUnit ?? unitType }] : [];
      };
      const chain = { from: (value: unknown) => { table = value; return chain; }, innerJoin: () => chain, where: (value: drizzle.SQL) => { where = value; return chain; },
        for: async (_mode: string, options: { of: unknown }) => { assert.ok(inTransaction); assert.equal(options.of, schema.consumableStock); return result(); },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
    async transaction(fn: (tx: unknown) => Promise<unknown>) {
      inTransaction = true; const before = inserts.length;
      try { return await fn(db); } catch (error) { inserts.splice(before); throw error; } finally { inTransaction = false; }
    },
    insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => ({ returning: async () => {
      assert.ok(inTransaction, "both inserts must use transaction handle");
      if (table === schema.consumableStock && failStock) throw new Error("synthetic rollback");
      inserts.push({ table, value }); return [{ id, ...value }];
    } }) }),
    update: (table: unknown) => ({ set: (value: Record<string, unknown>) => ({ where: (where: drizzle.SQL) => ({ returning: async () => {
      assert.equal(table, schema.consumableStock, "conversion never modifies shared catalog");
      assert.ok(inTransaction);
      updates++;
      const compiled = new PgDialect().sqlToQuery(where);
      assert.match(compiled.sql, /"user_id"/); assert.match(compiled.sql, /"id"/);
      if (!compiled.params.includes(stock.userId) || !compiled.params.includes(id)) return [];
      Object.assign(stock, value); return [{ ...stock }];
    } }) }) }),
  };
  const deps: Record<string, unknown> = { express, "node:crypto": crypto, "drizzle-orm": drizzle, "@workspace/db": { db, ...schema, usersTable, events }, "../lib/consumableUsage": usage,
    "../middlewares/requireAuth": { requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => { if (!req.headers["x-user"]) { res.sendStatus(401); return; } next(); } },
    "../lib/userSync": { getOrCreateUser: async (req: express.Request) => ({ id: req.headers["x-user"], role: req.headers["x-user"] === "admin" ? "admin" : "client" }) },
  };
  const module = { exports: {} as { default: express.Router } };
  new Function("require", "module", "exports", transformSync(readFileSync(new URL("./consumables.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code)
    ((name: string) => { assert.ok(name in deps, name); return deps[name]; }, module, module.exports);
  const app = express(); app.use(express.json()); app.use(module.exports.default);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, body: unknown, user = "owner", method = "PATCH") => fetch(base + path, { method, headers: { "content-type": "application/json", ...(user ? { "x-user": user } : {}) }, body: JSON.stringify(body) });
  const path = `/consumables/stock/${id}/usage`;
  const input = { averagePrintsPerEvent: 250, averageEventsPerMonth: 8 };
  assert.equal((await request(path, input, "")).status, 401);
  assert.equal((await request(path, input, "other")).status, 404);
  assert.equal((await request(path, input, "admin")).status, 404);
  const updated = await request(path, input); assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { id, currentQuantity: 5000, quantityUnit: null, unitType: "prints", averagePrintsPerEvent: 250, averageEventsPerMonth: "8", monthlyConsumption: 2000, eventsRemaining: 20, monthsRemaining: 2.5 });
  assert.equal(stock.estimatedDailyUsage, "99.00"); assert.equal(stock.currentQuantity, 5000);
  unitType = "rolls";
  assert.equal((await request(path, input)).status, 409);
  assert.equal((await request("/consumables/restock", { stockItemId: id, rollsPurchased: 2, printsPerRoll: 700, purchaseDate: "2026-09-10" }, "owner", "POST")).status, 409);
  assert.equal(stock.currentQuantity, 5000);
  for (const invalid of [null, "1400", -1, 1.1, 2000000001]) assert.equal((await request(path, { currentQuantityPrints: invalid })).status, 400);
  assert.equal((await request(path, { ...input, currentQuantityPrints: 1400 }, "other")).status, 404);
  const converted = await request(path, { ...input, currentQuantityPrints: 1400 });
  assert.equal(converted.status, 200);
  assert.equal((await converted.json() as { currentQuantity: number }).currentQuantity, 1400);
  assert.equal(stock.quantityUnit, "prints"); assert.equal(unitType, "rolls", "catalog unit untouched");
  assert.equal(stock.estimatedDailyUsage, "99.00");
  const zero = await request(path, { currentQuantityPrints: 0 }); assert.equal(zero.status, 200); assert.equal(stock.currentQuantity, 0);
  assert.equal((await request(path, input)).status, 200, "later usage edits respect stock override over legacy catalog");
  unitType = "prints";
  const previousUpdates = updates;
  for (const body of [{}, { averagePrintsPerEvent: "250" }, { averageEventsPerMonth: -1 }, { ...input, currentQuantity: 5 }, { ...input, estimatedDailyUsage: "9" }]) assert.equal((await request(path, body)).status, 400);
  assert.equal(updates, previousUpdates);
  assert.equal((await request("/consumables/stock/bad/usage", input)).status, 400);
  assert.equal((await request(path, { averagePrintsPerEvent: null, averageEventsPerMonth: null })).status, 200);
  const create = { name: "Fixture paper", category: "paper", currentQuantity: 5000, reorderThreshold: 0, ...input };
  failStock = true;
  assert.equal((await request("/consumables/stock", create, "owner", "POST")).status, 503); assert.equal(inserts.length, 0);
  failStock = false;
  const created = await request("/consumables/stock", create, "owner", "POST"); assert.equal(created.status, 201);
  assert.equal((await created.json() as { monthlyConsumption: number }).monthlyConsumption, 2000);
  assert.equal(inserts.length, 2); assert.equal(inserts[0]!.value.reorderThreshold, 0); assert.equal(inserts[1]!.value.userId, "owner");
  assert.equal(inserts[0]!.value.unitType, "prints");
  for (const invalid of [{ ...create, currentQuantity: 1.1 }, { ...create, category: "bad" }, { ...create, averagePrintsPerEvent: -1 }, { ...create, unitType: "rolls" }, { ...create, category: "accessory", unitType: "packs" }]) assert.equal((await request("/consumables/stock", invalid, "owner", "POST")).status, 400);
});
