import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuoteTotals } from "./quotePricing";

test("calculateQuoteTotals includes line items and service pricing fields", () => {
  assert.deepEqual(
    calculateQuoteTotals(
      [
        { quantity: "2", unitPrice: "100" },
        { quantity: "1", unitPrice: "50" },
      ],
      {
        rentalPrice: "300",
        optionsPrice: "40",
        deliveryFees: "25",
        discountAmount: "15",
      },
      "10",
    ),
    { subtotal: "600.00", taxAmount: "60.00", total: "660.00" },
  );
});

test("calculateQuoteTotals never produces a negative subtotal", () => {
  assert.deepEqual(calculateQuoteTotals([], { discountAmount: "500" }, "20"), {
    subtotal: "0.00",
    taxAmount: "0.00",
    total: "0.00",
  });
});
