import assert from "node:assert/strict";
import test from "node:test";
import { buildTicketMail, type TicketMailSnapshot } from "./ticketMessage";
import { sendTicketMail, ticketMailConfig } from "./resend";

const snapshot: TicketMailSnapshot = { ticketId: "ticket", ticketNumber: "TKT-2026-test", title: "Imprimante\r\nTest", description: "<script>not HTML</script>",
  category: "technical", priority: "urgent", equipmentModel: "Halo", serialNumber: "SN-123", name: "Client Test", company: "Company Test",
  email: "client@example.test", phone: "+33123456789", attachments: [{ id: "file", fileName: "original.pdf", mimeType: "application/pdf", size: 42 }] };

test("ticket email contains full snapshot, fixed recipient and authenticated links, with plain text only", () => {
  const mail = buildTicketMail(snapshot, "support@example.test", "https://hub.example.test");
  assert.deepEqual(mail.to, ["info@halolight.fr"]);
  for (const value of [snapshot.name, snapshot.company, snapshot.email, snapshot.phone, snapshot.category, snapshot.title, snapshot.description, snapshot.equipmentModel, snapshot.serialNumber, snapshot.priority, snapshot.ticketNumber, snapshot.ticketId, "original.pdf"]) assert.ok(mail.text.includes(value!));
  assert.match(mail.text, /https:\/\/hub.example.test\/support\/tickets\/ticket/);
  assert.match(mail.text, /https:\/\/hub.example.test\/api\/support\/tickets\/ticket\/attachments\/file/);
  assert.ok(!("html" in mail)); assert.doesNotMatch(mail.subject, /[\r\n]/);
  for (const origin of ["http://hub.example.test", "https://a:b@hub.example.test", "https://hub.example.test/path", "https://hub.example.test?token=secret"]) assert.throws(() => buildTicketMail(snapshot, "support@example.test", origin));
  assert.throws(() => buildTicketMail(snapshot, "sender@example.test\r\nBcc: bad", "https://hub.example.test"));
});

test("delivery disabled without explicit complete configuration", () => {
  assert.equal(ticketMailConfig({}), null);
  const env = { SUPPORT_MAIL_ENABLED: "true", SUPPORT_MAIL_PROVIDER: "resend", RESEND_API_KEY: "fake-test-key", SUPPORT_MAIL_FROM: "support@example.test", HUB_PUBLIC_URL: "https://hub.example.test" };
  assert.ok(ticketMailConfig(env));
  for (const key of Object.keys(env)) assert.equal(ticketMailConfig({ ...env, [key]: "" }), null);
});

test("Resend adapter uses stable idempotency, reports acceptance only on valid response, sanitizes errors", async () => {
  const mail = buildTicketMail(snapshot, "support@example.test", "https://hub.example.test");
  const requests: RequestInit[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails"); requests.push(options!);
    return new Response(JSON.stringify({ id: "provider-id" }), { status: 200 });
  };
  for (let i = 0; i < 2; i++) assert.deepEqual(await sendTicketMail(mail, "same-key", "fake-test-key", fetcher), { status: "sent", providerMessageId: "provider-id" });
  assert.equal(requests[0]!.body, requests[1]!.body);
  assert.equal(new Headers(requests[0]!.headers).get("Idempotency-Key"), "same-key");
  assert.equal(requests[0]!.redirect, "error"); assert.ok(requests[0]!.signal);
  for (const status of [400, 401, 409, 429, 500]) {
    const result = await sendTicketMail(mail, "same-key", "fake-test-key", async () => new Response("private-content-secret", { status }));
    assert.equal(result.status, status === 409 || status === 500 ? "unknown" : "failed");
    assert.doesNotMatch(JSON.stringify(result), /private-content-secret/);
  }
  assert.deepEqual(await sendTicketMail(mail, "same-key", "fake-test-key", async () => { throw new Error("SECRET"); }), { status: "unknown", code: "provider_network_or_timeout" });
  assert.equal((await sendTicketMail(mail, "same-key", "fake-test-key", async () => new Response("{}"))).status, "unknown");
});
