import { useGetCurrentUser } from "@workspace/api-client-react";

export const CURRENCIES = [
  "EUR", "USD", "GBP", "JPY", "CNY",
  "PLN", "SEK", "NOK", "DKK", "CHF", "CAD", "AUD",
] as const;

export type Currency = typeof CURRENCIES[number];

export const CURRENCY_LABELS: Record<string, string> = {
  EUR: "Euro (€)",
  USD: "US Dollar ($)",
  GBP: "British Pound (£)",
  JPY: "Japanese Yen (¥)",
  CNY: "Chinese Yuan (¥)",
  PLN: "Polish Złoty (zł)",
  SEK: "Swedish Krona (kr)",
  NOK: "Norwegian Krone (kr)",
  DKK: "Danish Krone (kr)",
  CHF: "Swiss Franc (Fr)",
  CAD: "Canadian Dollar ($)",
  AUD: "Australian Dollar ($)",
};

export function formatCurrency(
  amount: number | string | null | undefined,
  currency = "EUR",
  opts?: { divideBy100?: boolean }
): string {
  let num = Number(amount ?? 0);
  if (isNaN(num)) return "—";
  if (opts?.divideBy100) num = num / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

export function useCurrency() {
  const { data: user } = useGetCurrentUser();
  const currency: string = (user as any)?.currency ?? "EUR";
  return {
    currency,
    format: (amount: number | string | null | undefined) =>
      formatCurrency(amount, currency),
    formatCents: (amount: number | string | null | undefined) =>
      formatCurrency(amount, currency, { divideBy100: true }),
  };
}
