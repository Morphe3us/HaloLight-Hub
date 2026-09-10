import { withContractTerms, removeEmptyContractSections, contractTotal, type ContractTerms } from "./contractTerms.js";

export function fillContractVariables(
  template: string,
  data: ContractTerms & {
    contractNumber: string;
    providerCompanyName?: string | null;
    providerRepresentative?: string | null;
    providerAddress?: string | null;
    providerEmail?: string | null;
    providerPhone?: string | null;
    providerWebsite?: string | null;
    providerLogoUrl?: string | null;
    providerTaxId?: string | null;
    providerSignature?: string | null;
    providerSignerTitle?: string | null;
    clientName?: string | null;
    clientEmail?: string | null;
    clientPhone?: string | null;
    clientCompany?: string | null;
    clientAddress?: string | null;
    eventType?: string | null;
    eventDate?: Date | null;
    eventLocation?: string | null;
    eventStartTime?: string | null;
    eventEndTime?: string | null;
    setupTime?: string | null;
    pickupTime?: string | null;
    packageName?: string | null;
    rentalDuration?: string | null;
    includedPrints?: string | null;
    rentalPrice?: string | null;
    optionsPrice?: string | null;
    deliveryFees?: string | null;
    discountAmount?: string | null;
    taxRate?: string | null;
    depositAmount?: string | null;
    depositMethod?: string | null;
    depositConditions?: string | null;
    depositReturn?: string | null;
    paymentTerms?: string | null;
    cancellationTerms?: string | null;
    signaturePlace?: string | null;
    equipmentDescription?: string | null;
    digitalGallery?: boolean | null;
    customTemplate?: boolean | null;
    deliveryIncluded?: boolean | null;
    setupIncluded?: boolean | null;
    operatorIncluded?: boolean | null;
    optionsList?: string | null;
    currency?: string | null;
    language?: string | null;
    value?: string | null;
  },
): string {
  const HIDE = "\x00HIDE_LINE\x00";

  const INCLUDED: Record<string, string> = {
    en: "Included",
    fr: "Inclus",
    es: "Incluido",
    de: "Inklusive",
    it: "Incluso",
    nl: "Inbegrepen",
    pl: "W zestawie",
    pt: "Incluído",
  };
  // Locale strings reach toLocaleDateString/toLocaleString below; anything
  // outside the supported set would throw a RangeError mid-generation.
  const lang =
    data.language && data.language in INCLUDED ? data.language : "en";
  const included = (flag: boolean | null | undefined) =>
    flag ? (INCLUDED[lang] ?? "Included") : HIDE;

  const fmt = (v: string | null | undefined) => v?.trim() || HIDE;
  const fmtVisible = (v: string | null | undefined) => v?.trim() || "";

  const fmtDate = (d: Date | null | undefined) => {
    if (!d || Number.isNaN(d.getTime())) return HIDE;
    return d.toLocaleDateString(lang, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const fmtAmount = (v: string | null | undefined) => {
    if (!v || Number(v) === 0) return HIDE;
    return `${Number(v).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.currency ?? "€"}`;
  };
  const amountNumber = (v: string | null | undefined) =>
    v && Number.isFinite(Number(v)) ? Number(v) : 0;
  const rentalAmount = amountNumber(data.rentalPrice);
  const optionsAmount = amountNumber(data.optionsPrice);
  const deliveryAmount = amountNumber(data.deliveryFees);
  const discountAmount = amountNumber(data.discountAmount);
  const taxRate = amountNumber(data.taxRate);
  const subtotal = Math.max(
    0,
    rentalAmount + optionsAmount + deliveryAmount - discountAmount,
  );
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = contractTotal(data);
  const fmtComputedAmount = (v: number) =>
    v === 0
      ? HIDE
      : `${v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.currency ?? "€"}`;
  const today = new Date().toLocaleDateString(lang, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const nameParts = (data.clientName ?? "").split(" ");
  const firstName = fmt(nameParts[0]);
  const lastName =
    nameParts.length > 1 ? fmt(nameParts.slice(1).join(" ")) : HIDE;

  const equipList = data.equipmentDescription
    ? data.equipmentDescription
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .join("\n")
    : HIDE;

  let result = withContractTerms(template, data, totalAmount, lang, data.currency ?? "EUR")
    .replace(/\{\{contract_number\}\}/g, () => data.contractNumber)
    .replace(/\{\{client_name\}\}/g, () => fmt(data.clientName))
    .replace(/\{\{client_first_name\}\}/g, () => firstName)
    .replace(/\{\{client_last_name\}\}/g, () => lastName)
    .replace(/\{\{client_email\}\}/g, () => fmt(data.clientEmail))
    .replace(/\{\{client_phone\}\}/g, () => fmt(data.clientPhone))
    .replace(/\{\{client_company_name\}\}/g, () => fmt(data.clientCompany))
    .replace(/\{\{client_address\}\}/g, () => fmt(data.clientAddress))
    .replace(/\{\{event_type\}\}/g, () => fmt(data.eventType))
    .replace(/\{\{event_date\}\}/g, () => fmtDate(data.eventDate))
    .replace(/\{\{event_start_time\}\}/g, () => fmt(data.eventStartTime))
    .replace(/\{\{event_end_time\}\}/g, () => fmt(data.eventEndTime))
    .replace(/\{\{event_location\}\}/g, () => fmt(data.eventLocation))
    .replace(/\{\{package_name\}\}/g, () => fmt(data.packageName))
    .replace(/\{\{rental_duration\}\}/g, () => fmt(data.rentalDuration))
    .replace(/\{\{included_prints\}\}/g, () => fmt(data.includedPrints))
    .replace(/\{\{equipment_list\}\}/g, () => equipList)
    .replace(/\{\{digital_gallery\}\}/g, () => included(data.digitalGallery))
    .replace(/\{\{custom_template\}\}/g, () => included(data.customTemplate))
    .replace(/\{\{delivery_included\}\}/g, () => included(data.deliveryIncluded))
    .replace(/\{\{setup_included\}\}/g, () => included(data.setupIncluded))
    .replace(/\{\{operator_included\}\}/g, () => included(data.operatorIncluded))
    .replace(/\{\{options_list\}\}/g, () => fmt(data.optionsList))
    .replace(/\{\{rental_price\}\}/g, () => fmtAmount(data.rentalPrice))
    .replace(/\{\{options_price\}\}/g, () => fmtAmount(data.optionsPrice))
    .replace(/\{\{delivery_fees\}\}/g, () => fmtAmount(data.deliveryFees))
    .replace(/\{\{discount_amount\}\}/g, () => fmtAmount(data.discountAmount))
    .replace(/\{\{contract_value\}\}/g, () => fmtAmount(data.value))
    .replace(/\{\{subtotal\}\}/g, () => fmtComputedAmount(subtotal))
    .replace(/\{\{tax_rate\}\}/g, () => taxRate > 0 ? String(taxRate) : HIDE)
    .replace(/\{\{tax_amount\}\}/g, () => fmtComputedAmount(taxAmount))
    .replace(/\{\{total_amount\}\}/g, () => fmtComputedAmount(totalAmount))
    .replace(/\{\{currency\}\}/g, () => "")
    .replace(/\{\{rental_company_name\}\}/g, () => fmt(data.providerCompanyName))
    .replace(
      /\{\{rental_company_representative\}\}/g,
      () => fmt(data.providerRepresentative),
    )
    .replace(/\{\{rental_company_address\}\}/g, () => fmt(data.providerAddress))
    .replace(/\{\{rental_company_email\}\}/g, () => fmt(data.providerEmail))
    .replace(/\{\{rental_company_phone\}\}/g, () => fmt(data.providerPhone))
    .replace(/\{\{rental_company_website\}\}/g, () => fmt(data.providerWebsite))
    .replace(/\{\{rental_company_logo\}\}/g, () => fmt(data.providerLogoUrl))
    .replace(/\{\{company_logo_url\}\}/g, () => fmt(data.providerLogoUrl))
    .replace(/\{\{rental_company_vat\}\}/g, () => fmt(data.providerTaxId))
    .replace(/\{\{setup_time\}\}/g, () => fmt(data.setupTime))
    .replace(/\{\{pickup_time\}\}/g, () => fmt(data.pickupTime))
    .replace(/\{\{deposit_amount\}\}/g, () => fmtAmount(data.depositAmount))
    .replace(/\{\{deposit_method\}\}/g, () => fmt(data.depositMethod))
    .replace(/\{\{deposit_conditions\}\}/g, () => fmt(data.depositConditions))
    .replace(/\{\{deposit_return\}\}/g, () => fmt(data.depositReturn))
    .replace(/\{\{cancellation_terms\}\}/g, () => fmt(data.cancellationTerms))
    .replace(/\{\{payment_terms\}\}/g, () => fmt(data.paymentTerms))
    .replace(/\{\{signature_place\}\}/g, () => fmt(data.signaturePlace))
    .replace(/\{\{signature_date\}\}/g, () => today)
    .replace(
      /\{\{provider_signature\}\}/g,
      () => fmtVisible(data.providerSignature) || "_________________________________",
    )
    .replace(/\{\{provider_signer_title\}\}/g, () => fmt(data.providerSignerTitle))
    // Catch-all for any remaining {{...}} except contract_number (already replaced above)
    .replace(/\{\{(?!contract_number\}\})[^}]+\}\}/g, () => HIDE);

  // Filter lines with HIDE marker, then collapse excess blank lines
  const lines = result.split("\n");
  const filtered = lines.filter((line) => !line.includes("\x00HIDE_LINE\x00"));
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of filtered) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun <= 2) collapsed.push(line);
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }
  return removeEmptyContractSections(collapsed.join("\n"));
}
