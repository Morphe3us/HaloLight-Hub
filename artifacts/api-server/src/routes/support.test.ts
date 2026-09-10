import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import * as crypto from "node:crypto";
import * as streamPromises from "node:stream/promises";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../../../lib/db/src/schema/support";
import { usersTable } from "../../../../lib/db/src/schema/users";
import * as attachments from "../lib/supportAttachments";

test("support HTTP creation queues once atomically, edits never requeue, attachment access is owner/admin only", async t => {
  const rows: Array<Record<string, any>> = [];
  let enqueued = 0, dispatched = 0, reads = 0, inTransaction = false;
  const bytes = Buffer.from("%PDF-1.4 synthetic fixture");
  const db = {
    async transaction(fn: (tx: unknown) => Promise<unknown>) { inTransaction = true; try { return await fn(db); } finally { inTransaction = false; } },
    insert: () => ({ values: (value: Record<string, unknown>) => ({ returning: async () => {
      const row = { status: "open", createdAt: new Date(), updatedAt: new Date(), ...value }; rows.push(row); return [row];
    } }) }),
    select(columns?: Record<string, unknown>) {
      let table: unknown, where: drizzle.SQL | undefined;
      const chain = { from: (value: unknown) => { table = value; return chain; }, where: (value: drizzle.SQL) => { where = value; return chain; },
        orderBy: () => chain, leftJoin: () => chain, limit: () => chain, offset: () => chain,
        then: (resolve: (v: unknown) => unknown) => {
          if (table !== schema.supportTickets) return Promise.resolve([]).then(resolve);
          const { sql, params } = new PgDialect().sqlToQuery(where ?? drizzle.sql``);
          const selected = rows.filter(row => (!sql.includes('"id" =') || params.includes(row.id)) && (!sql.includes('"user_id" =') || params.includes(row.userId)));
          return Promise.resolve(columns?.count ? [{ count: selected.length }] : selected).then(resolve);
        } };
      return chain;
    },
    update: () => ({ set: (patch: Record<string, unknown>) => ({ where: (where: drizzle.SQL) => {
      const id = new PgDialect().sqlToQuery(where).params[0];
      const run = () => { const row = rows.find(row => row.id === id)!; Object.assign(row, patch); return [row]; };
      return { returning: async () => run(), then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve) };
    } }) }),
  };
  const dependencies: Record<string, unknown> = {
    express, "node:crypto": crypto, "node:stream/promises": streamPromises, "drizzle-orm": drizzle, "@workspace/db": { db, ...schema, usersTable },
    "../lib/supportAttachments": { ...attachments, ticketAttachmentStorage: () => ({ openReadStream: async () => { reads++; return Readable.from([bytes]); } }),
      saveTicketAttachments: async () => [{ id: "12345678-1234-4321-8123-123456789abc", key: "PRIVATE-KEY", fileName: "fixture.pdf", mimeType: "application/pdf", size: bytes.length }] },
    "../lib/mail/ticketOutbox": { enqueueTicketMail: async () => { assert.ok(inTransaction); enqueued++; }, dispatchTicketMail: async () => { dispatched++; }, ticketMailHistory: async () => ({ emailDelivery: { status: "disabled", attempts: 0, sentAt: null }, deliveryHistory: [] }) },
    "../middlewares/requireAuth": { requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => { if (!req.headers["x-user"]) { res.sendStatus(401); return; } next(); } },
    "../lib/userSync": { getOrCreateUser: async (req: express.Request) => ({ id: req.headers["x-user"], role: req.headers["x-user"] === "admin" ? "admin" : "client" }) },
  };
  const module = { exports: {} as { default: express.Router } };
  new Function("require", "module", "exports", transformSync(readFileSync(new URL("./support.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code)
    ((name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, module, module.exports);
  const app = express(); app.use(express.json()); app.use(module.exports.default);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (url: string, user = "owner", method = "GET", body?: unknown) => fetch(base + url, { method, headers: { "content-type": "application/json", ...(user ? { "x-user": user } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const body = { title: "Printer issue", description: "Fixture", equipmentModel: "Halo", serialNumber: "SN-1", attachments: [{ fileName: "fixture.pdf", mimeType: "application/pdf", data: bytes.toString("base64") }] };
  assert.equal((await request("/support/tickets", "", "POST", body)).status, 401);
  assert.equal((await request("/support/tickets", "owner", "POST", { ...body, priority: "invalid" })).status, 400);
  assert.equal(enqueued, 0);
  const created = await request("/support/tickets", "owner", "POST", body); assert.equal(created.status, 201);
  const ticket = await created.json() as any;
  assert.equal(enqueued, 1); assert.equal(ticket.serialNumber, "SN-1"); assert.doesNotMatch(JSON.stringify(ticket), /PRIVATE-KEY/);
  assert.equal((await request(`/support/tickets/${ticket.id}`, "owner", "PUT", { title: "Edited" })).status, 200);
  assert.equal((await request(`/support/tickets/${ticket.id}/status`, "owner", "PATCH", { status: "closed" })).status, 200);
  assert.equal(enqueued, 1); assert.equal(dispatched, 1);
  assert.equal((await request(`/support/tickets/${ticket.id}`, "other")).status, 404);
  assert.equal((await request(`/support/tickets/${ticket.id}`, "other", "PUT", { title: "Hijack" })).status, 404);
  assert.equal((await request(`/support/tickets/${ticket.id}/email/retry`, "owner", "POST")).status, 403);
  const downloadUrl = ticket.attachments[0].downloadUrl;
  assert.equal((await request(downloadUrl.replace(/^\/api/, ""), "")).status, 401);
  assert.equal((await request(downloadUrl.replace(/^\/api/, ""), "other")).status, 404);
  assert.equal(reads, 0);
  for (const user of ["owner", "admin"]) {
    const response = await request(downloadUrl.replace(/^\/api/, ""), user);
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(response.headers.get("content-disposition")!, /^attachment/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  for (const query of ["limit=0", "offset=-1", "status=bad", "priority=bad", "limit=3&limit=4"]) assert.equal((await request(`/support/tickets?${query}`)).status, 400);
  assert.equal((await request("/support/tickets/bad")).status, 400);
});
