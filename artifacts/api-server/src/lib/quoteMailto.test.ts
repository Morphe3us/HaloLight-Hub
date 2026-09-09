import test from "node:test";
import assert from "node:assert/strict";
import { buildQuoteMailto } from "./quoteMailto";

test("buildQuoteMailto includes recipient, subject, total, validity, and quote link", () => {
  const result = buildQuoteMailto({
    appUrl: "https://app.example.com/",
    companyName: "HaloLight",
    quote: {
      id: "quote_1",
      quoteNumber: "Q-2026-1001",
      title: "Corporate Event",
      clientName: "Ava",
      clientEmail: "ava@example.com",
      total: "1250.00",
      currency: "EUR",
      validUntil: new Date("2026-08-01T00:00:00.000Z"),
    },
  });

  assert.equal(result.subject, "Quote Q-2026-1001 - Corporate Event");
  assert.match(result.mailtoUrl, /^mailto:ava%40example\.com\?/);

  const url = new URL(result.mailtoUrl);
  assert.equal(url.searchParams.get("subject"), result.subject);
  const body = url.searchParams.get("body") ?? "";
  assert.match(body, /Total: .*1,250\.00|Total: .*€1,250\.00/);
  assert.match(body, /Valid until: August 1, 2026/);
  assert.match(
    body,
    /Quote link: https:\/\/app\.example\.com\/quotes\/quote_1/,
  );
  assert.match(body, /HaloLight/);
});

test("buildQuoteMailto localizes French drafts", () => {
  const result = buildQuoteMailto({
    appUrl: "https://app.example.com",
    companyName: "HaloLight",
    language: "fr",
    quote: {
      id: "quote_1",
      quoteNumber: "Q-2026-1001",
      title: "Evenement entreprise",
      clientName: "Ava",
      clientEmail: "ava@example.com",
      total: "1250.00",
      currency: "EUR",
      validUntil: new Date("2026-08-01T00:00:00.000Z"),
    },
  });

  assert.equal(result.subject, "Devis Q-2026-1001 - Evenement entreprise");
  const url = new URL(result.mailtoUrl);
  const body = url.searchParams.get("body") ?? "";
  assert.match(body, /Bonjour Ava/);
  assert.match(body, /Voici votre devis Q-2026-1001/);
  assert.match(body, /Total: 1.*250,00.*€/);
  assert.match(body, /Valable jusqu'au: 1 août 2026/);
});
