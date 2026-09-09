import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeReadiness,
  type ContractFormData,
  type ProviderData,
  validateContract,
} from "./contractValidation";

function makeForm(overrides: Partial<ContractFormData> = {}): ContractFormData {
  return {
    title: "Rental contract",
    clientName: "Ada Lovelace",
    clientEmail: "ada@example.com",
    clientPhone: "",
    clientCompany: "",
    clientAddress: "",
    eventType: "",
    eventDate: "",
    eventStartTime: "",
    eventEndTime: "",
    eventLocation: "",
    setupTime: "",
    pickupTime: "",
    serviceName: "",
    rentalDuration: "",
    includedPrints: "",
    equipmentDescription: "",
    optionsList: "",
    digitalGallery: false,
    customTemplate: false,
    deliveryIncluded: false,
    setupIncluded: false,
    operatorIncluded: false,
    value: "",
    optionsPrice: "",
    deliveryFees: "",
    discountAmount: "",
    currency: "EUR",
    taxRate: "",
    depositAmount: "",
    depositMethod: "",
    depositConditions: "",
    depositReturn: "",
    paymentTerms: "",
    cancellationTerms: "",
    signaturePlace: "",
    content: "",
    notes: "",
    templateId: "",
    leadId: "",
    quoteId: "",
    invoiceId: "",
    equipmentIds: [],
    ...overrides,
  };
}

const provider: ProviderData = {
  companyName: "HaloLight",
  firstName: "Grace",
  lastName: "Hopper",
};

describe("contract validation", () => {
  it("requires a positive amount for manually-created contracts", () => {
    const result = validateContract(makeForm(), provider);

    assert.ok(result.blocking.includes("field_total_amount"));
  });

  it("allows the amount to be resolved by a linked quote", () => {
    const result = validateContract(makeForm({ quoteId: "quote-1" }), provider);

    assert.equal(result.blocking.includes("field_total_amount"), false);
  });

  it("allows the amount to be resolved by a linked invoice", () => {
    const result = validateContract(
      makeForm({ invoiceId: "invoice-1" }),
      provider,
    );

    assert.equal(result.blocking.includes("field_total_amount"), false);
  });

  it("counts source-linked pricing as present in readiness", () => {
    const pricing = computeReadiness(
      makeForm({ invoiceId: "invoice-1" }),
      provider,
    ).find((section) => section.key === "pricing");

    assert.equal(pricing?.status, "partial");
    assert.equal(pricing?.presentCount, 2);
  });
});
