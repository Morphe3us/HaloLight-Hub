import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as supportPolicy from "./supportPolicy";

test("AI escalation enqueues mail in the ticket transaction and dispatches only after commit", async () => {
  const events: string[] = [];
  let failEnqueue = false;
  let stored: unknown;
  let handler: (req: unknown, res: unknown) => Promise<void>;
  const conversationId = "12345678-1234-4234-9234-123456789abc";
  const conversations = { id: "conversation.id" };
  const messages = { conversationId: "messages.conversationId" };
  const tickets = {};
  const user = { id: "user-id", language: "fr" };
  const tx = {
    insert(table: unknown) {
      assert.equal(table, tickets);
      events.push("insert");
      return {
        values(values: object) {
          return {
            returning: async () => {
              stored = { ...values, id: "ticket-id" };
              return [stored];
            },
          };
        },
      };
    },
  };
  const deps: Record<string, unknown> = {
    express: {
      Router: () => ({
        get() {},
        delete() {},
        post(path: string, ...handlers: unknown[]) {
          if (path.endsWith("/escalate"))
            handler = handlers.at(-1) as typeof handler;
        },
      }),
    },
    "drizzle-orm": { eq() {}, asc() {}, desc() {} },
    "@workspace/db": {
      aiConversations: conversations,
      aiMessages: messages,
      supportTickets: tickets,
      db: {
        select: () => ({
          from: (table: unknown) => ({
            where: () =>
              table === conversations
                ? Promise.resolve([
                    { id: conversationId, userId: user.id, title: "Question" },
                  ])
                : {
                    orderBy: () => ({
                      limit: async () => [
                        {
                          role: "user",
                          content: "Printer broken during a live event",
                        },
                      ],
                    }),
                  },
          }),
        }),
        transaction: async (
          callback: (transaction: typeof tx) => Promise<unknown>,
        ) => {
          events.push("begin");
          try {
            const result = await callback(tx);
            events.push("commit");
            return result;
          } catch (error) {
            stored = undefined;
            events.push("rollback");
            throw error;
          }
        },
      },
    },
    "../middlewares/requireAuth": { requireAuth() {} },
    "../lib/userSync": { getOrCreateUser: async () => user },
    "../lib/ai/factory": {},
    "../lib/ai/chatLimits": {},
    "../lib/ai/provider": {},
    "../lib/ai/rag": {},
    "../lib/ai/supportPolicy": supportPolicy,
    "../lib/mail/ticketOutbox": {
      enqueueTicketMail: async (
        transaction: unknown,
        ticket: unknown,
        recipient: unknown,
      ) => {
        assert.equal(transaction, tx);
        assert.equal(ticket, stored);
        assert.equal(recipient, user);
        events.push("enqueue");
        if (failEnqueue) throw new Error("enqueue failed");
      },
      dispatchTicketMail: async (id: string) => {
        assert.equal(id, "ticket-id");
        events.push("dispatch");
      },
    },
  };
  const module = { exports: {} };
  const code = transformSync(
    readFileSync(new URL("../../routes/ai.ts", import.meta.url), "utf8"),
    { loader: "ts", format: "cjs" },
  ).code;
  new Function("require", "module", "exports", code)(
    (name: string) => {
      assert.ok(Object.hasOwn(deps, name), name);
      return deps[name];
    },
    module,
    module.exports,
  );
  let status = 0;
  const res = {
    status(value: number) {
      status = value;
      return res;
    },
    json() {},
  };
  const req = { params: { id: conversationId }, body: {} };
  await handler!(req, res);
  assert.equal(status, 201);
  assert.equal((stored as { priority: string }).priority, "urgent");
  assert.deepEqual(events, [
    "begin",
    "insert",
    "enqueue",
    "commit",
    "dispatch",
  ]);
  events.length = 0;
  failEnqueue = true;
  await assert.rejects(handler!(req, res), /enqueue failed/);
  assert.equal(stored, undefined);
  assert.deepEqual(events, ["begin", "insert", "enqueue", "rollback"]);
});
