import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { transformSync } from "esbuild";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../../../lib/db/src/schema/index";

function load<T>(file: URL, dependencies: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = transformSync(readFileSync(file, "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", "process", code)((name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Forbidden dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports, { env: {} });
  return module.exports as T;
}

test("four roles: owner-scoped CRM HTTP and real document-link validation", async t => {
  const roles = ["admin", "client", "coach", "sales_rep"];
  const tables = { leads: schema.leads, quotes: schema.quotes, contracts: schema.contracts, invoices: schema.invoices, equipment: schema.equipment };
  const data = new Map<unknown, Record<string, any>[]>();
  for (const [name, table] of Object.entries(tables)) data.set(table, [...roles, "other"].map(owner => ({
    id: `${name}-${owner}`, userId: owner, companyName: "Fixture", contactName: "Contact", clientName: "Contact",
    status: "draft", value: "100", total: "100", leadId: `leads-${owner}`, createdAt: new Date(), updatedAt: new Date(),
  })));
  // Even a stale/corrupt foreign relation must not appear in the owner's pipeline.
  data.get(schema.quotes)!.push({ id: "foreign-linked", userId: "other", leadId: "leads-client" });
  const dialect = new PgDialect();
  let writes = 0;
  function matches(table: unknown, row: Record<string, any>, condition?: orm.SQL) {
    if (!condition) return true;
    const query = dialect.sqlToQuery(condition);
    const columns = orm.getTableColumns(table as typeof schema.leads);
    const fields = Object.fromEntries(Object.entries(columns).map(([key, column]) => [column.name, key]));
    let evaluated = 0;
    const stripped = query.sql.replace(/"\w+"\."(\w+)" (?:= \$(\d+)|in \(([^)]+)\))/g, () => "true").replace(/true|and|[()\s]/g, "");
    assert.equal(stripped, "", `Unsupported SQL predicate: ${query.sql}`);
    const result = Array.from(query.sql.matchAll(/"\w+"\."(\w+)" (?:= \$(\d+)|in \(([^)]+)\))/g)).every(match => {
      evaluated++;
      assert.ok(fields[match[1]], `Unknown column ${match[1]}`);
      const actual = row[fields[match[1]]];
      if (match[2]) return actual === query.params[Number(match[2]) - 1];
      return Array.from(match[3].matchAll(/\$(\d+)/g)).some(param => actual === query.params[Number(param[1]) - 1]);
    });
    assert.ok(evaluated, "The fixture must evaluate a real predicate");
    return result;
  }
  const db = {
    select(selection?: Record<string, unknown>) {
      let table: unknown, condition: orm.SQL | undefined;
      const chain = {
        from(value: unknown) { table = value; return chain; }, where(value: orm.SQL) { condition = value; return chain; },
        orderBy() { return chain; }, limit() { return chain; }, offset() { return chain; },
        then(resolve: (rows: any[]) => unknown) {
          const rows = (data.get(table) ?? []).filter(row => matches(table, row, condition)).map(row => ({ ...row }));
          return Promise.resolve(selection?.count ? [{ count: rows.length }] : rows).then(resolve);
        },
      };
      return chain;
    },
    update(table: unknown) { return { set: (values: Record<string, unknown>) => ({ where: (condition: orm.SQL) => {
      const apply = () => { writes++; return (data.get(table) ?? []).filter(row => matches(table, row, condition)).map(row => ({ ...Object.assign(row, values) })); };
      return { returning: async () => apply(), then: (resolve: (rows: any[]) => unknown) => Promise.resolve(apply()).then(resolve) };
    } }) }; },
    delete(table: unknown) { return { where: async (condition: orm.SQL) => { writes++; data.set(table, (data.get(table) ?? []).filter(row => !matches(table, row, condition))); } }; },
    transaction() { writes++; throw new Error("Rejected document request reached a transaction"); },
    insert() { writes++; throw new Error("Rejected request reached an insert"); },
  };
  const database = { ...schema, db };
  const auth = { getAuth: (req: express.Request) => ({ userId: req.headers["x-identity"] }) };
  const requireAuth = load(new URL("../middlewares/requireAuth.ts", import.meta.url), { "../middlewares/supabaseAuth": auth });
  const ownership = load<{ validateOwnedLinks: (id: string, links: Record<string, unknown>) => Promise<{ ok: boolean; status?: number }> }>(new URL("../lib/ownership.ts", import.meta.url), { "@workspace/db": database, "drizzle-orm": orm });
  const dependencies: Record<string, unknown> = {
    express, "drizzle-orm": orm, "@workspace/db": database,
    "../middlewares/requireAuth": requireAuth,
    "../lib/userSync": { getOrCreateUser: async (req: express.Request) => {
      const id = String(req.headers["x-identity"] ?? "");
      return roles.includes(id) ? { id, role: id, language: "en", isActive: true } : null;
    } },
    "../lib/ownership": ownership,
    "../lib/documentNumberQueries": {},
  };
  for (const module of ["paymentMethod", "contractLanguage", "contractTerms", "contractRender", "defaultContractTemplates", "quoteMailto", "quotePricing", "dateInput"]) {
    const imported = await import(`../lib/${module}.ts`);
    dependencies[`../lib/${module}`] = imported;
    dependencies[`../lib/${module}.js`] = imported;
  }
  const app = express(); app.use(express.json());
  for (const name of ["leads", "quotes", "contracts", "invoices"]) app.use(load<{ default: express.Router }>(new URL(`./${name}.ts`, import.meta.url), dependencies).default);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, identity: string, method = "GET", body?: unknown) => fetch(base + path, {
    method, headers: { "content-type": "application/json", ...(identity ? { "x-identity": identity } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const role of roles) await t.test(`${role}: own records accessible; foreign records and mutations refused`, async () => {
    for (const name of ["leads", "quotes", "contracts", "invoices"]) {
      const list = await request(`/${name}`, role);
      assert.equal(list.status, 200);
      const body = await list.json() as { items: { userId: string }[] };
      assert.ok(body.items.length > 0); assert.ok(body.items.every(row => row.userId === role));
      assert.equal((await request(`/${name}/${name}-${role}`, role)).status, 200);
      const before = writes;
      for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await request(`/${name}/${name}-other`, role, method, method === "PUT" ? { title: "Hijack", companyName: "Hijack" } : undefined)).status, 404);
      if (name !== "leads") assert.equal((await request(`/${name}/${name}-other/status`, role, "PATCH", { status: "sent" })).status, 404);
      assert.equal(writes, before);
    }
    const pipeline = await request(`/leads/leads-${role}/pipeline`, role);
    assert.equal(pipeline.status, 200);
    const pipelineBody = await pipeline.json() as Record<string, { userId: string }[]>;
    for (const key of ["quotes", "contracts", "invoices"]) assert.ok(pipelineBody[key].every(row => row.userId === role));
    assert.equal((await request("/leads/leads-other/pipeline", role)).status, 404);
    assert.equal((await request("/leads/leads-other/activities", role, "POST", { type: "note", title: "Hijack" })).status, 404);
    const before = writes;
    for (const name of ["quotes", "contracts", "invoices"]) {
      const response = await request(`/${name}`, role, "POST", { title: "Fixture", clientName: "Fixture", value: "100", leadId: "leads-other", items: [{ description: "Fixture", quantity: "1", unitPrice: "100" }] });
      assert.equal(response.status, 404, name);
    }
    for (const [name, key, foreignId, methods] of [
      ["quotes", "leadId", "leads-other", ["PUT"]],
      ["contracts", "leadId", "leads-other", ["PUT"]],
      ["contracts", "quoteId", "quotes-other", ["POST", "PUT"]],
      ["contracts", "invoiceId", "invoices-other", ["POST"]],
      ["invoices", "leadId", "leads-other", ["PUT"]],
      ["invoices", "quoteId", "quotes-other", ["POST", "PUT"]],
      ["invoices", "contractId", "contracts-other", ["POST", "PUT"]],
    ] as const) for (const method of methods) {
      const path = method === "POST" ? `/${name}` : `/${name}/${name}-${role}`;
      const response = await request(path, role, method, method === "PUT" ? { [key]: foreignId } : {
        title: "Fixture", clientName: "Fixture", value: "100", [key]: foreignId,
        items: [{ description: "Fixture", quantity: "1", unitPrice: "100" }],
      });
      assert.equal(response.status, 404, `${role} ${method} ${name} foreign ${key}`);
    }
    assert.equal(writes, before);
    for (const [key, name] of [["leadId", "leads"], ["quoteId", "quotes"], ["contractId", "contracts"], ["invoiceId", "invoices"]]) {
      assert.equal((await ownership.validateOwnedLinks(role, { [key]: `${name}-${role}` })).ok, true);
      assert.equal((await ownership.validateOwnedLinks(role, { [key]: `${name}-other` })).status, 404);
    }
    assert.equal((await ownership.validateOwnedLinks(role, { equipmentIds: [`equipment-${role}`, `equipment-${role}`] })).ok, true);
    assert.equal((await ownership.validateOwnedLinks(role, { equipmentIds: [`equipment-${role}`, "equipment-other"] })).status, 404);
    assert.equal((await ownership.validateOwnedLinks(role, { equipmentIds: [1] })).status, 400);
    assert.equal((await request(`/leads/leads-${role}`, role, "PUT", { companyName: "Own edit", userId: "other" })).status, 200);
    assert.equal(data.get(schema.leads)!.find(row => row.id === `leads-${role}`)!.userId, role);
  });
  await t.test("anonymous and unresolved/disabled local identities are refused before CRM writes", async () => {
    const before = writes;
    for (const identity of ["", "disabled"]) for (const name of ["leads", "quotes", "contracts", "invoices"]) {
      assert.equal((await request(`/${name}`, identity)).status, 401);
      assert.equal((await request(`/${name}/${name}-client`, identity, "DELETE")).status, 401);
    }
    assert.equal(writes, before);
  });
});
