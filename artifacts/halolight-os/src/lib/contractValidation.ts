const HIDE = "\x00HIDE_LINE\x00";

const INCLUDED_TEXT: Record<string, string> = {
  en: "Included",
  fr: "Inclus",
  de: "Inbegriffen",
  es: "Incluido",
  it: "Incluso",
  nl: "Inbegrepen",
  pl: "Wliczone",
  pt: "Incluído",
};

const ADDITIONAL_OPTIONS_PAID: Record<string, string> = {
  en: "Additional paid options",
  fr: "Options supplémentaires facturées",
  de: "Kostenpflichtige Zusatzoptionen",
  es: "Opciones adicionales a cargo",
  it: "Opzioni aggiuntive a pagamento",
  nl: "Betaalde extra opties",
  pl: "Dodatkowe opcje płatne",
  pt: "Opções adicionais pagas",
};

const EMAIL_NOT_PROVIDED: Record<string, string> = {
  en: "Email not provided",
  fr: "E-mail non renseigné",
  de: "E-Mail nicht angegeben",
  es: "Correo no especificado",
  it: "Email non fornita",
  nl: "E-mail niet opgegeven",
  pl: "E-mail nie podany",
  pt: "E-mail não informado",
};

function getIncludedText(lang: string): string {
  return INCLUDED_TEXT[lang] ?? "Included";
}

function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (
    email.includes("placeholder.com") ||
    email.includes("@placeholder") ||
    /^user_[a-f0-9]+@/.test(email)
  );
}

function sanitizeEmail(email: string | null | undefined, lang: string): string {
  if (!email) return "";
  if (isPlaceholderEmail(email))
    return EMAIL_NOT_PROVIDED[lang] ?? "Email not provided";
  return email;
}

function formatPrice(amount: number, currency: string, lang: string): string {
  if (!currency) return amount.toFixed(2);
  try {
    const locale = lang === "en" ? "en-GB" : lang;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

import { withContractTerms, removeEmptyContractSections, type ContractTerms } from "../../../api-server/src/lib/contractTerms";

export interface ContractFormData extends ContractTerms {
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
  setupTime: string;
  pickupTime: string;
  serviceName: string;
  rentalDuration: string;
  includedPrints: string;
  equipmentDescription: string;
  optionsList: string;
  // Service option flags
  digitalGallery: boolean;
  customTemplate: boolean;
  deliveryIncluded: boolean;
  setupIncluded: boolean;
  operatorIncluded: boolean;
  // Pricing
  value: string;
  optionsPrice: string;
  deliveryFees: string;
  discountAmount: string;
  currency: string;
  taxRate: string;
  // Deposit
  depositAmount: string;
  depositMethod: string;
  depositConditions: string;
  depositReturn: string;
  // Terms
  paymentTerms: string;
  cancellationTerms: string;
  signaturePlace: string;
  // Meta
  content: string;
  notes: string;
  templateId: string;
  leadId: string;
  quoteId: string;
  invoiceId: string;
  // Equipment linking
  equipmentIds: string[];
}

export interface ProviderData {
  companyName?: string | null;
  companyAddress?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  taxId?: string | null;
  signature?: string | null;
  signerTitle?: string | null;
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

export function computeReadiness(
  form: ContractFormData,
  provider: ProviderData,
): ReadinessSection[] {
  const providerName = [provider.firstName, provider.lastName]
    .filter(Boolean)
    .join(" ");
  const sourceLinked = Boolean(form.quoteId || form.invoiceId);

  const sections: Array<{
    key: string;
    fields: (string | null | undefined)[];
  }> = [
    {
      key: "provider",
      fields: [
        provider.companyName,
        providerName || null,
        provider.email,
        provider.phone,
      ],
    },
    {
      key: "client",
      fields: [
        form.clientName,
        form.clientEmail,
        form.clientPhone,
        form.clientAddress,
      ],
    },
    {
      key: "event",
      fields: [form.eventType, form.eventDate, form.eventLocation],
    },
    {
      key: "service",
      fields: [
        form.serviceName,
        form.rentalDuration,
        form.includedPrints,
        form.equipmentDescription,
      ],
    },
    {
      key: "pricing",
      fields: [
        sourceLinked
          ? "source"
          : form.value && Number(form.value) > 0
            ? form.value
            : null,
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

export function validateContract(
  form: ContractFormData,
  provider: ProviderData,
): ValidationResult {
  const blocking: string[] = [];
  const optional: OptionalIssue[] = [];

  const providerName = [provider.firstName, provider.lastName]
    .filter(Boolean)
    .join(" ");
  if (!provider.companyName) blocking.push("field_provider_company");
  if (!providerName) blocking.push("field_provider_name");
  if (!form.clientName.trim()) blocking.push("field_client_name");
  if (!form.clientEmail.trim()) blocking.push("field_client_email");
  if (
    !form.quoteId &&
    !form.invoiceId &&
    (!form.value || Number(form.value) <= 0)
  )
    blocking.push("field_total_amount");
  if (!form.currency.trim()) blocking.push("field_currency");

  if (!form.clientPhone.trim())
    optional.push({
      field: "field_client_phone",
      placeholderKey: "placeholder_not_provided",
    });
  if (!form.clientAddress.trim())
    optional.push({
      field: "field_client_address",
      placeholderKey: "placeholder_not_provided",
    });
  if (!form.eventType.trim())
    optional.push({
      field: "field_event_type",
      placeholderKey: "placeholder_to_be_specified",
    });
  if (!form.eventDate.trim())
    optional.push({
      field: "field_event_date",
      placeholderKey: "placeholder_to_be_specified",
    });
  if (!form.serviceName.trim())
    optional.push({
      field: "field_service_name",
      placeholderKey: "placeholder_to_be_specified",
    });
  if (!form.depositAmount.trim())
    optional.push({
      field: "field_deposit_amount",
      placeholderKey: "placeholder_no_deposit",
    });

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

/**
 * Compute the pricing breakdown from form values.
 */
export function computePricing(form: ContractFormData) {
  const rentalVal = Math.max(0, Number(form.value) || 0);
  const optionsVal = Math.max(0, Number(form.optionsPrice) || 0);
  const deliveryVal = Math.max(0, Number(form.deliveryFees) || 0);
  const discountVal = Math.max(0, Number(form.discountAmount) || 0);
  const taxR = Math.max(0, Number(form.taxRate) || 0);
  // Clamped to 0 to match the server-side computation in fillContractVariables
  const subtotal = Math.max(0, rentalVal + optionsVal + deliveryVal - discountVal);
  const taxAmt = subtotal * (taxR / 100);
  const total = subtotal + taxAmt;
  return {
    rentalVal,
    optionsVal,
    deliveryVal,
    discountVal,
    taxR,
    subtotal,
    taxAmt,
    total,
  };
}

/**
 * Fill all {{variable}} placeholders in a contract template.
 *
 * Lines containing the HIDE sentinel are removed in post-processing,
 * so callers can set a variable to HIDE to suppress entire lines.
 */
export function fillAllVariables(
  content: string,
  form: ContractFormData,
  provider: ProviderData,
  lang: string,
  placeholders: PlaceholderSet,
): string {
  const localeTag = lang === "en" ? "en-GB" : lang;
  const today = new Date().toLocaleDateString(localeTag, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const providerName = [provider.firstName, provider.lastName]
    .filter(Boolean)
    .join(" ");
  const { first: clientFirst, last: clientLast } = splitName(form.clientName);

  const eventDate = form.eventDate
    ? new Date(form.eventDate + "T12:00:00").toLocaleDateString(localeTag, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  const cur = form.currency || "";
  const fmtP = (n: number) => formatPrice(n, cur, lang);

  const {
    rentalVal,
    optionsVal,
    deliveryVal,
    discountVal,
    taxR,
    subtotal,
    taxAmt,
    total,
  } = computePricing(form);
  const dep = Math.max(0, Number(form.depositAmount) || 0);
  const included = getIncludedText(lang);

  const providerSig = provider.signature?.trim()
    ? provider.signature.trim()
    : "_________________________________";

  const replacements: Record<string, string> = {
    // NOTE: contract_number is intentionally omitted here — it is injected
    // server-side after the contract number is generated. The catch-all regex
    // below uses a negative lookahead to leave {{contract_number}} untouched
    // so the server can replace it with the real number.

    // Provider
    rental_company_name: provider.companyName || "",
    rental_company_representative: providerName || "",
    rental_company_address: provider.companyAddress?.trim() || HIDE,
    rental_company_email: sanitizeEmail(provider.email, lang),
    rental_company_phone: provider.phone || "",
    rental_company_website: provider.website?.trim() || HIDE,
    rental_company_logo: provider.logoUrl?.trim() || HIDE,
    company_logo_url: provider.logoUrl?.trim() || HIDE,
    rental_company_vat: provider.taxId?.trim() || HIDE,

    // Provider signature block
    provider_signature: providerSig,
    provider_signer_title: provider.signerTitle?.trim()
      ? provider.signerTitle.trim()
      : HIDE,

    // Client
    client_first_name: clientFirst || form.clientName,
    client_last_name: clientLast,
    client_full_name: form.clientName || "",
    client_name: form.clientName || "",
    client_company_name: form.clientCompany || placeholders.not_provided,
    client_company: form.clientCompany || placeholders.not_provided,
    client_address: form.clientAddress || placeholders.not_provided,
    client_phone: form.clientPhone || placeholders.not_provided,
    client_email: sanitizeEmail(form.clientEmail, lang),

    // Event
    event_type: form.eventType || placeholders.to_be_specified,
    event_date: eventDate || placeholders.to_be_specified,
    event_start_time: form.eventStartTime || placeholders.to_be_specified,
    event_end_time: form.eventEndTime || placeholders.to_be_specified,
    event_location: form.eventLocation?.trim() || HIDE,
    // Optional — hide line if not filled
    setup_time: form.setupTime?.trim() ? form.setupTime.trim() : HIDE,
    pickup_time: form.pickupTime?.trim() ? form.pickupTime.trim() : HIDE,

    // Equipment & package — guard against "undefined" string from bad auto-fill
    equipment_list:
      form.equipmentDescription?.trim() &&
      form.equipmentDescription.trim() !== "undefined"
        ? form.equipmentDescription.trim()
        : placeholders.to_be_specified,
    package_name: form.serviceName || placeholders.to_be_specified,
    rental_duration: form.rentalDuration || placeholders.to_be_specified,
    included_prints: form.includedPrints || placeholders.to_be_specified,
    options_list:
      optionsVal > 0 && !form.optionsList?.trim()
        ? (ADDITIONAL_OPTIONS_PAID[lang] ?? "Additional paid options")
        : optionsVal === 0 && !form.optionsList?.trim()
          ? HIDE
          : form.optionsList.trim(),

    // Service option flags — show "Included" or hide the entire line
    digital_gallery: form.digitalGallery ? included : HIDE,
    custom_template: form.customTemplate ? included : HIDE,
    delivery_included: form.deliveryIncluded ? included : HIDE,
    setup_included: form.setupIncluded ? included : HIDE,
    operator_included: form.operatorIncluded ? included : HIDE,

    // Pricing — Intl.NumberFormat with locale-aware format; currency variable = "" (already in price)
    rental_price: fmtP(rentalVal),
    options_price: optionsVal > 0 ? fmtP(optionsVal) : HIDE,
    delivery_fees: deliveryVal > 0 ? fmtP(deliveryVal) : HIDE,
    discount_amount: discountVal > 0 ? fmtP(discountVal) : HIDE,
    subtotal: fmtP(subtotal),
    tax_rate: taxR > 0 ? String(taxR) : HIDE,
    tax_amount: taxAmt > 0 ? fmtP(taxAmt) : HIDE,
    total_amount: fmtP(total),
    // currency variable outputs empty — prices already include the symbol via Intl.NumberFormat
    currency: "",

    // Deposit
    deposit_amount: dep > 0 ? fmtP(dep) : placeholders.no_deposit,
    deposit_method: form.depositMethod?.trim() || HIDE,
    deposit_conditions: form.depositConditions?.trim() || HIDE,
    deposit_return: form.depositReturn?.trim() || HIDE,

    // Terms & signature
    payment_terms: form.paymentTerms || placeholders.to_be_specified,
    cancellation_terms: form.cancellationTerms || placeholders.to_be_specified,
    signature_date: today,
    signature_place: form.signaturePlace || placeholders.to_be_specified,
  };

  let result = withContractTerms(content, form, total, lang, cur);
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), () => value);
  }

  // Final safety net: replace any remaining {{...}} with generic fallback.
  // Negative lookahead preserves {{contract_number}} for server-side injection.
  result = result.replace(
    /\{\{(?!contract_number\}\})[a-zA-Z_]+\}\}/g,
    placeholders.to_be_specified,
  );

  // Post-processing:
  // 1. Remove any line that contains the HIDE sentinel
  // 2. Trim trailing whitespace from each line (e.g. "700,00 € " from empty {{currency}})
  // 3. Collapse more than 2 consecutive blank lines into 2
  result = result
    .split("\n")
    .filter((line) => !line.includes(HIDE))
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return removeEmptyContractSections(result);
}
