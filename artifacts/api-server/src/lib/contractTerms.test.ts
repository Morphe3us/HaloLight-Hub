import assert from "node:assert/strict";
import { test } from "node:test";
import { contractBalance, contractTotal, contractCreationTerms, parseContractTerms, withContractTerms, removeEmptyContractSections } from "./contractTerms.js";
import { contractLanguage } from "./contractLanguage.js";
import { validPaymentMethod } from "./paymentMethod.js";
import { DEFAULT_CONTRACT_TEMPLATES } from "./defaultContractTemplates.js";
import { fillContractVariables } from "./contractRender.js";

test("contract language defaults to the account and rejects unsupported overrides", () => {
  assert.equal(contractLanguage(undefined, "fr"), "fr");
  assert.equal(contractLanguage(undefined, "en"), "en");
  assert.equal(contractLanguage("en", "fr"), "en");
  for (const value of [null, "", "xx", {}, "fr-FR"]) assert.throws(() => contractLanguage(value, "fr"));
});

test("advance and balance are independent of the security deposit and rounded to cents", () => {
  assert.equal(contractBalance(contractTotal({ rentalPrice: "1000" }), "100"), 900);
  assert.equal(contractTotal({ rentalPrice: "1000", taxRate: "20", discountAmount: "100" }), 1080);
  assert.equal(contractBalance(1200, "300"), 900);
  assert.equal(contractBalance(0.3, "0.10"), 0.2);
  assert.equal(contractBalance(300, "300"), 0);
  for (const advance of ["-1", "301", "NaN"]) assert.throws(() => contractBalance(300, advance));
});

test("renderer preserves all dollar substitution metacharacters as literal author text", () => {
  const literal = "$& $$ $` $'";
  const result = fillContractVariables("Name: {{client_name}}\nCompany: {{rental_company_name}}\nPayment: {{payment_terms}}\nNotes: {{cancellation_terms}}", {
    contractNumber: "T", clientName: literal, providerCompanyName: literal, paymentTerms: literal, cancellationTerms: literal,
  });
  assert.equal(result, `Name: ${literal}\nCompany: ${literal}\nPayment: ${literal}\nNotes: ${literal}`);
});

test("terms preserve author text and reject non-text, template injection and invalid money", () => {
  assert.deepEqual(parseContractTerms({ specialConditions: "  Exact clause $&  ", privacyTerms: null, ignored: "x" }), { specialConditions: "Exact clause $&", privacyTerms: null });
  for (const input of [{ advanceAmount: "1.001" }, { advanceAmount: "-2" }, { privacyTerms: {} }, { privacyTerms: "{{client_name}}" }, { specialConditions: "\x00" }]) assert.throws(() => parseContractTerms(input));
});

test("FR/EN templates render supplied terms before signature without inventing clauses", () => {
  for (const language of ["fr", "en"]) {
    const template = DEFAULT_CONTRACT_TEMPLATES.find((t) => t.language === language)!.content;
    assert.equal(withContractTerms(template, {}, 100, language, "EUR"), template);
    const rendered = withContractTerms(template, { advanceAmount: "30", breakdownTerms: "Exact supplied clause $&" }, 100, language, "EUR");
    assert.ok(rendered.includes("Exact supplied clause $&"));
    assert.ok(rendered.indexOf("Exact supplied clause") < rendered.indexOf("13. ACCEPT"));
    assert.ok(rendered.includes(language === "fr" ? "Solde: 70,00 EUR" : "Balance due: 70.00 EUR"));
    assert.ok(!rendered.includes("Personal data protection:"));
    assert.ok(!rendered.includes("Protection des données personnelles:"));
  }
});

test("explicit placeholders are filled once and empty sections removed", () => {
  const text = withContractTerms("Advance: {{advance_amount}}\nBalance: {{balance_amount}}", { advanceAmount: "100" }, 100, "en", "EUR");
  assert.equal(text, "Advance: 100.00 EUR\nBalance: 0.00 EUR");
  assert.equal(removeEmptyContractSections("1. EMPTY\n\n════\n\n2. RETAIN\nContent\n"), "2. RETAIN\nContent");
  assert.equal(removeEmptyContractSections("1. RETAIN\n\nContent\n"), "1. RETAIN\n\nContent");
});

test("payment methods are nullable bounded text", () => {
  for (const value of [undefined, null, "", "Virement", "Card"]) assert.ok(validPaymentMethod(value));
  for (const value of [3, {}, "x".repeat(201), "bank\ntransfer"]) assert.equal(validPaymentMethod(value), false);
});

test("untouched blank source payment inherits, an explicit clear is null", () => {
  for (const source of ["quoteId", "invoiceId"]) {
    assert.equal(Object.hasOwn(contractCreationTerms({ [source]: "source", paymentMethod: "" }, false), "paymentMethod"), false);
    assert.equal(contractCreationTerms({ [source]: "source", paymentMethod: "" }, true).paymentMethod, null);
    assert.equal(contractCreationTerms({ [source]: "source", paymentMethod: "Cash" }, true).paymentMethod, "Cash");
  }
});

test("the actual contract renderer includes terms, keeps signatures and omits empty equipment sections", () => {
  for (const language of ["fr", "en"]) {
    const content = fillContractVariables(DEFAULT_CONTRACT_TEMPLATES.find((t) => t.language === language)!.content, {
      contractNumber: "TEST-001", language, clientName: "Ada Lovelace", providerCompanyName: "Provider",
      value: "1000", rentalPrice: "1000", currency: "EUR", depositAmount: "500", advanceAmount: "200",
      privacyTerms: "Approved source text fixture", breakdownTerms: "Breakdown fixture",
    });
    assert.ok(content.includes("TEST-001"));
    assert.ok(content.includes("Approved source text fixture"));
    assert.ok(content.includes("Signature"));
    assert.ok(content.includes("500"));
    assert.ok(content.includes("800"));
    assert.ok(content.includes("13. ACCEPT"));
    assert.ok(!content.includes("{{"));
    assert.ok(!content.includes("HIDE_LINE"));
    assert.ok(!content.includes(language === "fr" ? "4. MATÉRIEL LOUÉ" : "4. RENTED EQUIPMENT"));
  }
});
