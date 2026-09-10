import assert from "node:assert/strict";
import { test } from "node:test";
import { creationLeadId, prospectCreationUrl, prospectPrefill } from "./prospectCreation";
import { paymentMethodPrint } from "./paymentMethodPrint";
import { contractPrintSettings } from "./contractPrintSettings";
import type { Lead } from "@workspace/api-client-react";

test("all prospect actions open the main module using only an encoded ID", () => {
  for (const module of ["quotes", "invoices", "contracts"] as const) {
    const url = prospectCreationUrl(module, "id&create=0");
    assert.ok(url.startsWith(`/${module}?`));
    assert.equal(creationLeadId(url.split("?")[1]), "id&create=0");
  }
  assert.equal(creationLeadId("leadId=x"), null);
  assert.equal(creationLeadId("create=1"), null);
});

test("prefill preserves contact and event data without inventing line items or venue", () => {
  const fields = prospectPrefill({ id: "id", contactName: "Ada", companyName: "Events", email: null, phone: "123", address: "Billing address", expectedEventDate: "2026-10-04T12:00:00.000Z", eventType: "Wedding", value: "2000" } as Lead);
  assert.deepEqual(fields, { leadId: "id", clientName: "Ada", clientCompany: "Events", clientEmail: "", clientPhone: "123", clientAddress: "Billing address", eventDate: "2026-10-04", eventType: "Wedding" });
  assert.equal("value" in fields, false);
  assert.equal("eventLocation" in fields, false);
});

test("payment method PDF fields escape HTML and omit absent values", () => {
  assert.equal(paymentMethodPrint("Payment", null), "");
  assert.ok(paymentMethodPrint("Mode <", '<script>alert("x")</script>').includes("&lt;script&gt;"));
  assert.ok(!paymentMethodPrint("Payment", "<script>").includes("<script>"));
});

test("contract print settings use the saved language and currency independently of viewer settings", () => {
  const settings = contractPrintSettings({ language: "fr", currency: "EUR" });
  assert.equal(settings.language, "fr");
  assert.ok(settings.formatValue("100").includes("100,00"));
  assert.ok(settings.formatValue("100").includes("€"));
  assert.ok(!settings.formatValue("100").includes("$"));
});
