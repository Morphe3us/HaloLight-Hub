import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const keys = {
  ai: ["provider_unavailable"],
  consent: ["not_configured", "terms", "privacy", "accept", "marketing", "analytics", "ai_improvement", "optional", "save_error", "save", "title", "proof", "no_proof", "proof_choices", "manage"],
  dashboard: ["preferences_error"],
  nav: ["admin_pilotage", "admin_operations", "admin_content_ai", "admin_data_system"],
  support: ["equipment_model", "serial_number", "attachments", "attachments_limit", "attachments_invalid"],
  ticket_detail: ["download_failed", "email_history", "email_pending", "email_sending", "email_sent", "email_failed", "email_unknown", "email_disabled", "email_retry", "email_retry_failed", "email_none"],
  consumables: ["average_prints_event", "average_events_month", "monthly_consumption", "events_remaining", "months_remaining", "edit_usage", "usage_save_failed", "usage_unknown", "stock_prints", "print_units_required"],
  contracts: ["advanceAmount", "paymentMethod", "responsibilityTerms", "breakdownTerms", "postponementTerms", "forceMajeureTerms", "privacyTerms", "specialConditions", "language_label", "balanceAmount", "invalid_advance", "legal_review_required"],
  quotes: ["valid_until_label", "payment_method"],
  invoices: ["payment_method"],
  admin_revenue: ["currency", "undated_paid", "stat_invoiced", "stat_unpaid", "excluded_currency"],
};

test("checklist controls and errors are translated in all eight locales with matching interpolation", () => {
  const read = (lang: string) => JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}.json`, import.meta.url), "utf8"));
  const english = read("en");
  for (const lang of ["en", "fr", "de", "es", "it", "nl", "pl", "pt"]) {
    const locale = read(lang);
    for (const [section, names] of Object.entries(keys)) for (const name of names) {
      const value = locale[section]?.[name];
      assert.equal(typeof value, "string", `${lang}: ${section}.${name}`);
      assert.ok(value.trim().length, `${lang}: ${section}.${name}`);
      assert.deepEqual((value.match(/\{\{\w+\}\}/g) ?? []).sort(), (english[section][name].match(/\{\{\w+\}\}/g) ?? []).sort());
    }
  }
});
