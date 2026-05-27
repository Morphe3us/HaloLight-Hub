export interface ContractFormData {
  title: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientCompany: string;
  clientAddress: string;
  eventType: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  eventLocation: string;
  serviceName: string;
  rentalDuration: string;
  includedPrints: string;
  equipmentDescription: string;
  value: string;
  currency: string;
  taxRate: string;
  depositAmount: string;
  depositMethod: string;
  paymentTerms: string;
  cancellationTerms: string;
  signaturePlace: string;
  content: string;
  notes: string;
  templateId: string;
  leadId: string;
  quoteId: string;
}

export interface ProviderData {
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export type ReadinessStatus = "complete" | "partial" | "missing";

export interface ReadinessSection {
  key: string;
  status: ReadinessStatus;
  presentCount: number;
  totalCount: number;
}

export interface OptionalIssue {
  field: string;
  placeholderKey: string;
}

export interface ValidationResult {
  blocking: string[];
  optional: OptionalIssue[];
}

function present(...vals: (string | null | undefined)[]): number {
  return vals.filter((v) => v && String(v).trim() !== "").length;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function computeReadiness(form: ContractFormData, provider: ProviderData): ReadinessSection[] {
  const providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ");

  const sections: Array<{ key: string; fields: (string | null | undefined)[] }> = [
    { key: "provider", fields: [provider.companyName, providerName || null, provider.email, provider.phone] },
    { key: "client", fields: [form.clientName, form.clientEmail, form.clientPhone, form.clientAddress] },
    { key: "event", fields: [form.eventType, form.eventDate, form.eventLocation] },
    { key: "service", fields: [form.serviceName, form.rentalDuration, form.includedPrints, form.equipmentDescription] },
    {
      key: "pricing",
      fields: [
        form.value && Number(form.value) > 0 ? form.value : null,
        form.currency,
        form.depositAmount,
        form.paymentTerms,
      ],
    },
  ];

  return sections.map(({ key, fields }) => {
    const total = fields.length;
    const presentCount = present(...fields);
    let status: ReadinessStatus = "complete";
    if (presentCount === 0) status = "missing";
    else if (presentCount < total) status = "partial";
    return { key, status, presentCount, totalCount: total };
  });
}

export function validateContract(form: ContractFormData, provider: ProviderData): ValidationResult {
  const blocking: string[] = [];
  const optional: OptionalIssue[] = [];

  const providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ");
  if (!provider.companyName) blocking.push("field_provider_company");
  if (!providerName) blocking.push("field_provider_name");
  if (!form.clientName.trim()) blocking.push("field_client_name");
  if (!form.clientEmail.trim()) blocking.push("field_client_email");
  if (!form.value || Number(form.value) <= 0) blocking.push("field_total_amount");
  if (!form.currency.trim()) blocking.push("field_currency");

  if (!form.clientPhone.trim()) optional.push({ field: "field_client_phone", placeholderKey: "placeholder_not_provided" });
  if (!form.clientAddress.trim()) optional.push({ field: "field_client_address", placeholderKey: "placeholder_not_provided" });
  if (!form.eventType.trim()) optional.push({ field: "field_event_type", placeholderKey: "placeholder_to_be_specified" });
  if (!form.eventDate.trim()) optional.push({ field: "field_event_date", placeholderKey: "placeholder_to_be_specified" });
  if (!form.serviceName.trim()) optional.push({ field: "field_service_name", placeholderKey: "placeholder_to_be_specified" });
  if (!form.depositAmount.trim()) optional.push({ field: "field_deposit_amount", placeholderKey: "placeholder_no_deposit" });

  return { blocking, optional };
}

export interface PlaceholderSet {
  not_provided: string;
  to_be_specified: string;
  no_deposit: string;
  not_included: string;
  no_options: string;
  no_delivery_fees: string;
  not_applicable: string;
}

export function fillAllVariables(
  content: string,
  form: ContractFormData,
  provider: ProviderData,
  lang: string,
  placeholders: PlaceholderSet,
): string {
  const localeTag = lang === "en" ? "en-GB" : lang;
  const today = new Date().toLocaleDateString(localeTag, { year: "numeric", month: "long", day: "numeric" });
  const providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ");
  const { first: clientFirst, last: clientLast } = splitName(form.clientName);

  const eventDate = form.eventDate
    ? new Date(form.eventDate).toLocaleDateString(localeTag, { year: "numeric", month: "long", day: "numeric" })
    : "";

  const val = form.value && Number(form.value) > 0 ? Number(form.value) : 0;
  const dep = form.depositAmount && Number(form.depositAmount) > 0 ? Number(form.depositAmount) : 0;
  const taxR = form.taxRate && Number(form.taxRate) > 0 ? Number(form.taxRate) : 0;
  const taxAmt = val * (taxR / 100);
  const cur = form.currency || "";

  const fmt = (n: number) => (n > 0 ? n.toFixed(2) : "0.00");
  const fmtCur = (n: number) => (n > 0 ? `${cur} ${fmt(n)}`.trim() : placeholders.to_be_specified);

  const replacements: Record<string, string> = {
    // Contract meta
    contract_number: placeholders.to_be_specified,

    // Provider
    rental_company_name: provider.companyName || "",
    rental_company_representative: providerName || "",
    rental_company_address: placeholders.not_provided,
    rental_company_email: provider.email || "",
    rental_company_phone: provider.phone || "",
    rental_company_website: placeholders.not_provided,
    rental_company_vat: placeholders.not_provided,

    // Client
    client_first_name: clientFirst || form.clientName,
    client_last_name: clientLast,
    client_full_name: form.clientName || "",
    client_name: form.clientName || "",
    client_company_name: form.clientCompany || placeholders.not_provided,
    client_company: form.clientCompany || placeholders.not_provided,
    client_address: form.clientAddress || placeholders.not_provided,
    client_phone: form.clientPhone || placeholders.not_provided,
    client_email: form.clientEmail || "",

    // Event
    event_type: form.eventType || placeholders.to_be_specified,
    event_date: eventDate || placeholders.to_be_specified,
    event_start_time: form.eventStartTime || placeholders.to_be_specified,
    event_end_time: form.eventEndTime || placeholders.to_be_specified,
    event_location: form.eventLocation || placeholders.not_provided,
    setup_time: placeholders.to_be_specified,
    pickup_time: placeholders.to_be_specified,

    // Equipment & package
    equipment_list: form.equipmentDescription || placeholders.to_be_specified,
    package_name: form.serviceName || placeholders.to_be_specified,
    rental_duration: form.rentalDuration || placeholders.to_be_specified,
    included_prints: form.includedPrints || placeholders.to_be_specified,
    digital_gallery: placeholders.not_included,
    custom_template: placeholders.not_included,
    delivery_included: placeholders.not_included,
    setup_included: placeholders.not_included,
    operator_included: placeholders.not_included,
    options_list: placeholders.no_options,

    // Pricing
    rental_price: fmtCur(val),
    options_price: `0.00`,
    delivery_fees: placeholders.no_delivery_fees,
    discount_amount: `0.00`,
    subtotal: fmtCur(val),
    tax_rate: taxR > 0 ? String(taxR) : "0",
    tax_amount: taxAmt > 0 ? `${cur} ${fmt(taxAmt)}`.trim() : "0.00",
    total_amount: fmtCur(val),
    currency: cur,

    // Deposit
    deposit_amount: dep > 0 ? `${cur} ${fmt(dep)}`.trim() : placeholders.no_deposit,
    deposit_method: form.depositMethod || placeholders.not_provided,
    deposit_conditions: placeholders.not_provided,
    deposit_return: placeholders.not_provided,

    // Terms & signature
    payment_terms: form.paymentTerms || placeholders.to_be_specified,
    cancellation_terms: form.cancellationTerms || placeholders.to_be_specified,
    signature_date: today,
    signature_place: form.signaturePlace || placeholders.to_be_specified,
  };

  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  // Final safety net: replace any remaining {{...}} with generic fallback
  result = result.replace(/\{\{[a-zA-Z_]+\}\}/g, placeholders.to_be_specified);

  return result;
}
