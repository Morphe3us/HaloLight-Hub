export function validPaymentMethod(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.length <= 200 && !/[\x00-\x1f]/.test(value));
}
