type QuotePricingItem = {
  quantity?: string | number | null;
  unitPrice?: string | number | null;
};

type QuotePricingFields = {
  rentalPrice?: string | number | null;
  optionsPrice?: string | number | null;
  deliveryFees?: string | number | null;
  discountAmount?: string | number | null;
};

function moneyNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateQuoteTotals(
  items: QuotePricingItem[],
  pricing: QuotePricingFields,
  taxRate: string | number | null | undefined,
) {
  const lineSubtotal = items.reduce(
    (sum, item) =>
      sum + moneyNumber(item.quantity) * moneyNumber(item.unitPrice),
    0,
  );
  const serviceSubtotal =
    moneyNumber(pricing.rentalPrice) +
    moneyNumber(pricing.optionsPrice) +
    moneyNumber(pricing.deliveryFees) -
    moneyNumber(pricing.discountAmount);
  const subtotal = Math.max(0, lineSubtotal + serviceSubtotal);
  const taxAmount = subtotal * (moneyNumber(taxRate) / 100);
  const total = subtotal + taxAmount;

  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
  };
}
