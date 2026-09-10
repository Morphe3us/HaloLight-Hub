import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transformSync } from "esbuild";
import * as drizzle from "drizzle-orm";
import { supportTicketMailOutbox as outbox, supportTicketMailHistory as history } from "../../../../../lib/db/src/schema/support";
import * as message from "./ticketMessage";

test("actual outbox helper: unique enqueue, exclusive claim, immutable retries, no duplicate accepted mail", async () => {
  let record: Record<string, any> | undefined;
  const events: Record<string, any>[] = [];
  const sends: Array<{ request: unknown; key: string }> = [];
  let enabled = false;
  let fail = true;
  let releaseProvider: (() => void) | undefined;
  let providerStarted: (() => void) | undefined;
  let lock = Promise.resolve();
  const db = {
    async transaction(fn: (tx: unknown) => Promise<unknown>) {
      const previous = lock; let unlock!: () => void;
      lock = new Promise<void>(resolve => { unlock = resolve; });
      await previous;
      try { return await fn(db); } finally { unlock(); }
    },
    insert(table: unknown) { return { values(values: Record<string, unknown>) {
      if (table === history) { events.push(values); return Promise.resolve(); }
      return { onConflictDoNothing: () => ({ returning: async () => {
        if (record) return [];
        record = { id: "outbox-id", attempts: 0, claimedAt: null, updatedAt: new Date(), ...structuredClone(values) }; return [record];
      } }) };
    } }; },
    select() { const chain = { from: () => chain, where: () => chain, for: async () => record ? [structuredClone(record)] : [] }; return chain; },
    update() { return { set: (patch: Record<string, unknown>) => ({ where: () => {
      const run = () => { Object.assign(record!, structuredClone(patch)); return [record]; };
      return { returning: async () => run(), then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve) };
    } }) }; },
  };
  const dependencies: Record<string, unknown> = { "drizzle-orm": drizzle, "@workspace/db": { db, supportTicketMailOutbox: outbox, supportTicketMailHistory: history }, "./ticketMessage": message,
    "./resend": { ticketMailConfig: () => enabled ? { from: "sender@example.test", origin: "https://hub.example.test", apiKey: "fake" } : null,
      sendTicketMail: async (request: unknown, key: string) => {
        sends.push({ request: structuredClone(request), key });
        providerStarted?.();
        if (providerStarted) { providerStarted = undefined; await new Promise<void>(resolve => { releaseProvider = resolve; }); }
        return fail ? { status: "unknown", code: "provider_network_or_timeout" } : { status: "sent", providerMessageId: "accepted-id" };
      } },
  };
  const module = { exports: {} as typeof import("./ticketOutbox") };
  const code = transformSync(readFileSync(new URL("./ticketOutbox.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  new Function("require", "module", "exports", code)((name: string) => { assert.ok(name in dependencies); return dependencies[name]; }, module, module.exports);
  const api = module.exports;
  const ticket = { id: "ticket", ticketNumber: "TKT-test", title: "Original subject", description: "Original issue", category: "technical", priority: "high", equipmentModel: "Halo", serialNumber: "SN", attachments: [{ id: "attachment", key: "PRIVATE", fileName: "fixture.pdf", size: 20, mimeType: "application/pdf" }] };
  const user = { fullName: "Original user", companyName: "Company", email: "owner@example.test", phone: null };
  await api.enqueueTicketMail(db as never, ticket as never, user as never);
  await api.enqueueTicketMail(db as never, ticket as never, user as never);
  assert.equal(events.length, 1); assert.equal(record!.status, "disabled");
  assert.doesNotMatch(JSON.stringify(record!.payload), /PRIVATE/);
  await api.dispatchTicketMail("ticket"); assert.equal(sends.length, 0);
  enabled = true;
  const started = new Promise<void>(resolve => { providerStarted = resolve; });
  const first = api.dispatchTicketMail("ticket"); await started;
  await api.dispatchTicketMail("ticket"); assert.equal(sends.length, 1, "concurrent worker cannot acquire live lease");
  releaseProvider!(); await first;
  assert.equal(record!.status, "unknown"); assert.equal(record!.sentAt, undefined);
  ticket.description = "Changed after creation"; user.fullName = "Changed name";
  record!.updatedAt = new Date(Date.now() - 180_000); fail = false;
  await api.dispatchTicketMail("ticket");
  assert.equal(sends.length, 2); assert.deepEqual(sends[0], sends[1]);
  assert.equal(record!.status, "sent"); assert.equal(record!.attempts, 2);
  await api.dispatchTicketMail("ticket"); assert.equal(sends.length, 2);
  assert.deepEqual(events.map(event => event.status), ["disabled", "sending", "unknown", "sending", "sent"]);
  const now = new Date(); const old = new Date(now.getTime() - 25 * 3600000);
  assert.equal(api.canClaimMail({ status: "unknown", attempts: 1, claimedAt: old, updatedAt: old }, now), false);
  assert.equal(api.canClaimMail({ status: "failed", attempts: 5, claimedAt: null, updatedAt: old }, now), false);
  assert.equal(api.canClaimMail({ status: "sending", attempts: 1, claimedAt: now, updatedAt: old }, now), true, "restart can recover expired lease within idempotency window");
  record!.status = "sending"; record!.claimedAt = old; record!.updatedAt = old;
  await api.dispatchTicketMail("ticket");
  assert.equal(sends.length, 2, "expired uncertain send must never be replayed");
  assert.equal(record!.status, "unknown", "abandoned send is not displayed as sending forever");
});
