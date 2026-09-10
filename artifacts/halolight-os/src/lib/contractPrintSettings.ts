export function contractPrintSettings(contract: { language?: string | null; currency?: string | null }) {
  const language = ["fr", "en", "de", "es", "it", "nl", "pt", "pl"].includes(contract.language ?? "") ? contract.language! : "en";
  const currency = /^[A-Z]{3}$/.test(contract.currency ?? "") ? contract.currency! : "EUR";
  return { language, currency, formatValue: (value: string | number) => new Intl.NumberFormat(language, { style: "currency", currency }).format(Number(value)) };
}
