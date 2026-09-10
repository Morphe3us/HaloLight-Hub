export const CONTRACT_TERM_LABELS = {
  advanceAmount: { fr: "Acompte", en: "Advance payment" },
  paymentMethod: { fr: "Mode de paiement", en: "Payment method" },
  responsibilityTerms: { fr: "Responsabilités", en: "Responsibilities" },
  breakdownTerms: { fr: "Panne et assistance", en: "Breakdown and assistance" },
  postponementTerms: { fr: "Report", en: "Postponement" },
  forceMajeureTerms: { fr: "Force majeure", en: "Force majeure" },
  privacyTerms: { fr: "Protection des données personnelles", en: "Personal data protection" },
  specialConditions: { fr: "Conditions particulières", en: "Special conditions" },
} as const;

export type ContractTermKey = keyof typeof CONTRACT_TERM_LABELS;
export type ContractTerms = Partial<Record<ContractTermKey, string | null>>;
export const CONTRACT_TERM_KEYS = Object.keys(CONTRACT_TERM_LABELS) as ContractTermKey[];

export function contractTotal(data: { value?: string | null; rentalPrice?: string | null; optionsPrice?: string | null; deliveryFees?: string | null; discountAmount?: string | null; taxRate?: string | null }): number {
  const amount = (value: string | null | undefined) => {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number < 0) throw new Error("Invalid contract amount");
    return number;
  };
  if (data.value != null && data.value !== "") return Math.round(amount(data.value) * 100) / 100;
  const subtotal = Math.max(0, amount(data.rentalPrice) + amount(data.optionsPrice) + amount(data.deliveryFees) - amount(data.discountAmount));
  return Math.round(subtotal * (1 + amount(data.taxRate) / 100) * 100) / 100;
}

export function parseContractTerms(body: Record<string, unknown>): ContractTerms {
  const result: ContractTerms = {};
  for (const key of CONTRACT_TERM_KEYS) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null || value === "") { result[key] = null; continue; }
    if (typeof value !== "string" || value.length > (key === "paymentMethod" ? 200 : 10000) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || value.includes("{{")) {
      throw new Error(`Invalid ${key}`);
    }
    if (key === "advanceAmount" && !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new Error("Invalid advanceAmount");
    result[key] = value.trim() || null;
  }
  return result;
}

export function contractCreationTerms(body: Record<string, unknown>, paymentMethodEdited: boolean): ContractTerms {
  const result = parseContractTerms(body);
  if (!paymentMethodEdited && (body.quoteId || body.invoiceId) && !body.paymentMethod) delete result.paymentMethod;
  return result;
}

export function contractBalance(total: number, advance: string | null | undefined): number {
  const totalCents = Math.round(total * 100);
  const advanceCents = Math.round(Number(advance || 0) * 100);
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(advanceCents) || advanceCents < 0 || advanceCents > totalCents) {
    throw new Error("Advance payment must be between zero and the contract total");
  }
  return (totalCents - advanceCents) / 100;
}

// Labels are deterministic; clause text is supplied by the author, never generated.
export function withContractTerms(template: string, terms: ContractTerms, total: number, language: string, currency: string): string {
  const lang = language === "fr" ? "fr" : "en";
  const money = (amount: number) => `${amount.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const entries: { key: string; label: string; value: string }[] = CONTRACT_TERM_KEYS.map((key) => ({
    key: key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    label: CONTRACT_TERM_LABELS[key][lang],
    value: key === "advanceAmount" && terms[key] ? money(Number(terms[key])) : terms[key]?.trim() || "",
  }));
  let balance = "";
  if (terms.advanceAmount) {
    try { balance = money(contractBalance(total, terms.advanceAmount)); } catch { /* Incomplete form previews omit an invalid balance. The API rejects it. */ }
  }
  entries.push({ key: "balance_amount", label: lang === "fr" ? "Solde" : "Balance due", value: balance });
  const append: string[] = [];
  let result = template;
  for (const entry of entries) {
    const token = `{{${entry.key}}}`;
    if (result.includes(token)) result = result.split(token).join(entry.value || "\x00HIDE_LINE\x00");
    else if (entry.value) append.push(`${entry.label}: ${entry.value}`);
  }
  if (!append.length) return result;
  const block = `\n${append.join("\n\n")}\n\n`;
  const signature = /^(?=\d+\. (?:ACCEPTANCE & SIGNATURES|ACCEPTATION ET SIGNATURES|ACCEPTATION & SIGNATURES))/m;
  return signature.test(result) ? result.replace(signature, () => block) : `${result}\n${block}`;
}

export function removeEmptyContractSections(text: string): string {
  return text.replace(/^\d+\. [^\n]+\n(?:(?:[ \t]*\n)|(?:[═─]{3,}[ \t]*\n))*(?=\d+\. |(?![\s\S]))/gm, "").trim();
}
