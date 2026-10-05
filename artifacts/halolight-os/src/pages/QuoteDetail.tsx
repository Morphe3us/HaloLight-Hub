import { useState } from "react";
import { paymentMethodPrint } from "@/lib/paymentMethodPrint";
import { escapeHtml, safeImageUrl } from "@/lib/escapeHtml";
import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetQuote,
  useUpdateQuoteStatus,
  useDeleteQuote,
  useGetCurrentUser,
  useCreateContract,
  useCreateInvoice,
  useSendQuote,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Printer,
  Building2,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  FileSignature,
  ReceiptText,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import { PageHeader } from "@/components/page";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted-foreground/50",
  sent: "bg-info",
  accepted: "bg-success",
  declined: "bg-destructive",
  expired: "bg-warning",
};

const STATUS_KEYS = ["draft", "sent", "accepted", "declined", "expired"];

function formatDate(d: string | null | undefined, locale = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function serviceDetailsHtml(
  quote: any,
  formatCurrency: (v: any) => string,
  t: (k: string, opts?: any) => string,
  lang: string,
): string {
  const fields: string[] = [];

  const eventDate = quote.eventDate
    ? new Date(quote.eventDate).toLocaleDateString(lang, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  if (quote.eventType || eventDate || quote.eventLocation) {
    fields.push(`
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(t("quotes.event_section", { defaultValue: "Event Details" }))}</div>
        <table class="detail-table">
          ${quote.eventType ? `<tr><td class="dk">${escapeHtml(t("quotes.event_type_label", { defaultValue: "Type" }))}</td><td>${escapeHtml(quote.eventType)}</td></tr>` : ""}
          ${eventDate ? `<tr><td class="dk">${escapeHtml(t("quotes.event_date_label", { defaultValue: "Date" }))}</td><td>${escapeHtml(eventDate)}</td></tr>` : ""}
          ${quote.eventStartTime ? `<tr><td class="dk">${escapeHtml(t("quotes.event_start_label", { defaultValue: "Start Time" }))}</td><td>${escapeHtml(quote.eventStartTime)}${quote.eventEndTime ? ` – ${escapeHtml(quote.eventEndTime)}` : ""}</td></tr>` : ""}
          ${quote.eventLocation ? `<tr><td class="dk">${escapeHtml(t("quotes.location_label", { defaultValue: "Location" }))}</td><td>${escapeHtml(quote.eventLocation)}</td></tr>` : ""}
        </table>
      </div>`);
  }

  const hasPackage =
    quote.packageName ||
    quote.rentalDuration ||
    quote.includedPrints ||
    quote.equipmentDescription;
  if (hasPackage) {
    const options: string[] = [];
    if (quote.digitalGallery)
      options.push(
        t("quotes.option_digital_gallery", { defaultValue: "Digital Gallery" }),
      );
    if (quote.customTemplate)
      options.push(
        t("quotes.option_custom_template", { defaultValue: "Custom Template" }),
      );
    if (quote.deliveryIncluded)
      options.push(t("quotes.option_delivery", { defaultValue: "Delivery" }));
    if (quote.setupIncluded)
      options.push(
        t("quotes.option_setup", { defaultValue: "Setup & Pickup" }),
      );
    if (quote.operatorIncluded)
      options.push(t("quotes.option_operator", { defaultValue: "Operator" }));

    fields.push(`
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(t("quotes.package_section", { defaultValue: "Service Package" }))}</div>
        <table class="detail-table">
          ${quote.packageName ? `<tr><td class="dk">${escapeHtml(t("quotes.package_name_label", { defaultValue: "Package" }))}</td><td>${escapeHtml(quote.packageName)}</td></tr>` : ""}
          ${quote.rentalDuration ? `<tr><td class="dk">${escapeHtml(t("quotes.rental_duration_label", { defaultValue: "Duration" }))}</td><td>${escapeHtml(quote.rentalDuration)} ${escapeHtml(t("quotes.hours_label", { defaultValue: "hours" }))}</td></tr>` : ""}
          ${quote.includedPrints ? `<tr><td class="dk">${escapeHtml(t("quotes.included_prints_label", { defaultValue: "Prints Included" }))}</td><td>${escapeHtml(quote.includedPrints)}</td></tr>` : ""}
          ${quote.equipmentDescription ? `<tr><td class="dk">${escapeHtml(t("quotes.equipment_label", { defaultValue: "Equipment" }))}</td><td>${escapeHtml(quote.equipmentDescription)}</td></tr>` : ""}
          ${options.length > 0 ? `<tr><td class="dk">${escapeHtml(t("quotes.options_label", { defaultValue: "Options" }))}</td><td>${escapeHtml(options.join(", "))}</td></tr>` : ""}
          ${quote.optionsList ? `<tr><td class="dk">${escapeHtml(t("quotes.options_detail_label", { defaultValue: "Options Detail" }))}</td><td>${escapeHtml(quote.optionsList)}</td></tr>` : ""}
        </table>
      </div>`);
  }

  const hasCustomPricing =
    Number(quote.rentalPrice) > 0 ||
    Number(quote.optionsPrice) > 0 ||
    Number(quote.deliveryFees) > 0 ||
    Number(quote.discountAmount) > 0;
  if (hasCustomPricing) {
    fields.push(`
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(t("quotes.pricing_breakdown_label", { defaultValue: "Pricing Breakdown" }))}</div>
        <table class="detail-table">
          ${Number(quote.rentalPrice) > 0 ? `<tr><td class="dk">${escapeHtml(t("quotes.rental_price_label", { defaultValue: "Rental" }))}</td><td>${escapeHtml(formatCurrency(quote.rentalPrice))}</td></tr>` : ""}
          ${Number(quote.optionsPrice) > 0 ? `<tr><td class="dk">${escapeHtml(t("quotes.options_price_label", { defaultValue: "Options" }))}</td><td>${escapeHtml(formatCurrency(quote.optionsPrice))}</td></tr>` : ""}
          ${Number(quote.deliveryFees) > 0 ? `<tr><td class="dk">${escapeHtml(t("quotes.delivery_fees_label", { defaultValue: "Delivery" }))}</td><td>${escapeHtml(formatCurrency(quote.deliveryFees))}</td></tr>` : ""}
          ${Number(quote.discountAmount) > 0 ? `<tr><td class="dk">${escapeHtml(t("quotes.discount_label", { defaultValue: "Discount" }))}</td><td>-${escapeHtml(formatCurrency(quote.discountAmount))}</td></tr>` : ""}
        </table>
      </div>`);
  }

  if (fields.length === 0) return "";

  return `
    <div class="service-block">
      ${fields.join("")}
    </div>`;
}

function PrintPreview({ quote, lang }: { quote: any; lang: string }) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrency();
  const { data: me } = useGetCurrentUser();
  const handlePrint = () => {
    const today = new Date().toLocaleDateString(lang, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const validUntilStr = quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString(lang, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
    const logoUrl = (me as any)?.logoUrl ?? "";
    const companyName = (me as any)?.companyName ?? (me as any)?.fullName ?? "";
    const rawEmail = (me as any)?.email ?? "";
    const providerEmail =
      !rawEmail ||
      rawEmail.includes("placeholder.com") ||
      /^user_[a-f0-9]+@/.test(rawEmail)
        ? ""
        : rawEmail;
    const items: Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      total: string;
    }> = quote.items ?? [];

    const detailsHtml = serviceDetailsHtml(quote, formatCurrency, t, lang);

    const html = `<!DOCTYPE html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(quote.quoteNumber)}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:40px auto;color:#111;font-size:13.5px;padding:0 28px}
      .doc-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #111;margin-bottom:24px}
      .provider-block img{max-height:52px;max-width:180px;object-fit:contain;display:block;margin-bottom:6px}
      .provider-name{font-size:16px;font-weight:700;margin-bottom:2px}
      .doc-meta{text-align:right;flex-shrink:0;margin-left:24px}
      .doc-type{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#999;margin-bottom:4px}
      .doc-number{font-size:18px;font-weight:700;font-family:'Courier New',monospace}
      .doc-sub{font-size:12px;color:#666;margin-top:3px}
      .parties{display:flex;gap:48px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid #e5e7eb;font-size:12.5px}
      .label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:5px;font-weight:600}
      .party-name{font-size:14.5px;font-weight:700;margin-bottom:2px}
      .party-detail{color:#555;line-height:1.55}
      .service-block{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin-bottom:20px}
      .detail-section{margin-bottom:10px}
      .detail-section:last-child{margin-bottom:0}
      .detail-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#999;font-weight:600;margin-bottom:5px}
      .detail-table{width:100%;border-collapse:collapse;font-size:12.5px}
      .detail-table td{padding:2px 0;vertical-align:top}
      .detail-table td.dk{color:#666;width:130px;padding-right:12px}
      .section{margin-bottom:22px}
      table.items{width:100%;border-collapse:collapse;margin-bottom:22px}
      table.items th{background:#f5f5f5;text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;font-weight:600}
      table.items td{padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px}
      .totals{margin-left:auto;width:280px}
      .totals tr td:first-child{color:#666}
      .totals tr td:last-child{text-align:right;font-weight:600}
      .grand td{font-size:18px;font-weight:700;border-top:2px solid #111!important}
      .notes{font-size:13px;color:#555;line-height:1.65;white-space:pre-wrap}
      @media print{body{margin:0;padding:16px}@page{margin:1.4cm 1.2cm}}
    </style></head><body>
    <div class="doc-header">
      <div class="provider-block">
        ${safeImageUrl(logoUrl) ? `<img src="${safeImageUrl(logoUrl)}" alt="${escapeHtml(companyName)}">` : ""}
        ${companyName ? `<div class="provider-name">${escapeHtml(companyName)}</div>` : ""}
        ${providerEmail ? `<div style="font-size:11.5px;color:#555">${escapeHtml(providerEmail)}</div>` : ""}
      </div>
      <div class="doc-meta">
        <div class="doc-type">${escapeHtml(t("quotes.print_quote_title", { defaultValue: "QUOTE" }))}</div>
        <div class="doc-number">${escapeHtml(quote.quoteNumber)}</div>
        <div class="doc-sub">${escapeHtml(quote.title)}</div>
        <div style="margin-top:8px;font-size:11px;color:#999">${escapeHtml(t("quotes.print_quote_date").toUpperCase())}</div>
        <div style="font-size:12px">${escapeHtml(today)}</div>
        ${validUntilStr ? `<div style="margin-top:6px;font-size:11px;color:#999">${escapeHtml(t("quotes.valid_until_label").toUpperCase())}</div><div style="font-size:12px">${escapeHtml(validUntilStr)}</div>` : ""}
      </div>
    </div>
    <div class="parties">
      <div>
        <div class="label">${escapeHtml(t("quotes.print_from"))}</div>
        <div class="party-name">${escapeHtml((me as any)?.fullName ?? "")}</div>
        ${(me as any)?.companyName ? `<div class="party-detail">${escapeHtml((me as any).companyName)}</div>` : ""}
        ${(me as any)?.phone ? `<div class="party-detail">${escapeHtml((me as any).phone)}</div>` : ""}
      </div>
      <div>
        <div class="label">${escapeHtml(t("quotes.print_prepared_for"))}</div>
        <div class="party-name">${escapeHtml(quote.clientName)}</div>
        ${quote.clientEmail ? `<div class="party-detail">${escapeHtml(quote.clientEmail)}</div>` : ""}
        ${quote.clientPhone ? `<div class="party-detail">${escapeHtml(quote.clientPhone)}</div>` : ""}
        ${quote.clientCompany ? `<div class="party-detail">${escapeHtml(quote.clientCompany)}</div>` : ""}
      </div>
    </div>
    ${detailsHtml}
    <table class="items">
      <thead><tr><th style="width:50%">${escapeHtml(t("quotes.description_col"))}</th><th style="text-align:right">${escapeHtml(t("quotes.qty_col"))}</th><th style="text-align:right">${escapeHtml(t("quotes.unit_price_col"))}</th><th style="text-align:right">${escapeHtml(t("quotes.total_col"))}</th></tr></thead>
      <tbody>${items.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td style="text-align:right">${escapeHtml(item.quantity)}</td><td style="text-align:right">${escapeHtml(formatCurrency(item.unitPrice))}</td><td style="text-align:right">${escapeHtml(formatCurrency(item.total))}</td></tr>`).join("")}</tbody>
    </table>
    <table class="totals">
      <tr><td>${escapeHtml(t("quotes.subtotal"))}</td><td>${escapeHtml(formatCurrency(quote.subtotal))}</td></tr>
      <tr><td>${escapeHtml(t("quotes.tax_label", { rate: quote.taxRate }))}</td><td>${escapeHtml(formatCurrency(quote.taxAmount))}</td></tr>
      <tr class="grand"><td style="font-weight:700">${escapeHtml(t("quotes.total_col"))}</td><td style="font-size:18px;font-weight:700">${escapeHtml(formatCurrency(quote.total))}</td></tr>
    </table>
    ${quote.notes ? `<div class="section"><div class="label">${escapeHtml(t("quotes.notes_section"))}</div><div class="notes">${escapeHtml(quote.notes)}</div></div>` : ""}
    ${paymentMethodPrint(t("quotes.payment_method", { defaultValue: "Payment method" }), quote.paymentMethod)}
    ${quote.terms ? `<div class="section"><div class="label">${escapeHtml(t("quotes.terms_section"))}</div><div class="notes">${escapeHtml(quote.terms)}</div></div>` : ""}
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.document.title = quote.quoteNumber;
      w.focus();
      w.print();
    }
  };

  return (
    <Button variant="outline" onClick={handlePrint} className="gap-2">
      <Printer className="w-4 h-4 stroke-[1.75]" /> {t("quotes.print_btn")}
    </Button>
  );
}

export default function QuoteDetail() {
  const [, params] = useRoute("/quotes/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();

  const [showCreateContract, setShowCreateContract] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [contractForm, setContractForm] = useState({
    title: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    value: "",
  });
  const [invoiceForm, setInvoiceForm] = useState({
    title: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    description: "",
    unitPrice: "",
    quantity: "1",
  });

  const { data: quote, isLoading } = useGetQuote(id, {
    query: { queryKey: ["quote", id], enabled: !!id },
  });

  const statusMutation = useUpdateQuoteStatus({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["quote", id] });
        qc.invalidateQueries({ queryKey: ["quotes"] });
        toast({ title: t("quotes.status_updated") });
      },
    },
  });

  const sendMutation = useSendQuote({
    mutation: {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: ["quote", id] });
        qc.invalidateQueries({ queryKey: ["quotes"] });
        toast({ title: t("quotes.quote_sent") });
        window.location.href = result.mailtoUrl;
      },
      onError: () =>
        toast({
          title: t("quotes.quote_send_failed"),
          variant: "destructive",
        }),
    },
  });

  const deleteMutation = useDeleteQuote({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["quotes"] });
        navigate("/quotes");
        toast({ title: t("quotes.quote_deleted") });
      },
    },
  });

  const createContractMutation = useCreateContract({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ["contracts"] });
        setShowCreateContract(false);
        toast({ title: t("pipeline.contract_created") });
        navigate(`/contracts/${data.id}`);
      },
    },
  });

  const createInvoiceMutation = useCreateInvoice({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ["invoices"] });
        setShowCreateInvoice(false);
        toast({ title: t("pipeline.invoice_created") });
        navigate(`/invoices/${data.id}`);
      },
    },
  });

  const openCreateContract = () => {
    if (!quote) return;
    setContractForm({
      title: `Contract — ${quote.title}`,
      clientName: quote.clientName,
      clientEmail: quote.clientEmail ?? "",
      clientPhone: (quote as any).clientPhone ?? "",
      value: quote.total,
    });
    setShowCreateContract(true);
  };

  const openCreateInvoice = () => {
    if (!quote) return;
    const firstItem = (quote.items ?? [])[0];
    setInvoiceForm({
      title: `Invoice — ${quote.title}`,
      clientName: quote.clientName,
      clientEmail: quote.clientEmail ?? "",
      clientPhone: (quote as any).clientPhone ?? "",
      description: firstItem?.description ?? quote.title,
      unitPrice: quote.total,
      quantity: "1",
    });
    setShowCreateInvoice(true);
  };

  const submitCreateContract = () => {
    if (!quote || !contractForm.title || !contractForm.clientName) return;
    createContractMutation.mutate({
      data: {
        quoteId: id,
        leadId: (quote as any).leadId ?? undefined,
        title: contractForm.title,
        clientName: contractForm.clientName,
        clientEmail: contractForm.clientEmail || undefined,
        clientPhone: contractForm.clientPhone || undefined,
        value: contractForm.value || undefined,
        clientCompany: (quote as any).clientCompany ?? undefined,
        clientAddress: (quote as any).clientAddress ?? undefined,
        eventType: (quote as any).eventType ?? undefined,
        eventDate: (quote as any).eventDate ?? undefined,
        eventLocation: (quote as any).eventLocation ?? undefined,
        packageName: (quote as any).packageName ?? undefined,
        rentalDuration: (quote as any).rentalDuration ?? undefined,
        includedPrints: (quote as any).includedPrints ?? undefined,
        rentalPrice: (quote as any).rentalPrice ?? undefined,
        optionsPrice: (quote as any).optionsPrice ?? undefined,
        deliveryFees: (quote as any).deliveryFees ?? undefined,
        discountAmount: (quote as any).discountAmount ?? undefined,
        equipmentIds: (quote as any).equipmentIds ?? undefined,
        equipmentDescription: (quote as any).equipmentDescription ?? undefined,
        currency: (quote as any).currency ?? undefined,
        language: (quote as any).language ?? undefined,
      },
    });
  };

  const submitCreateInvoice = () => {
    if (!quote || !invoiceForm.title || !invoiceForm.clientName) return;
    const qty = invoiceForm.quantity || "1";
    const price = invoiceForm.unitPrice || "0";
    createInvoiceMutation.mutate({
      data: {
        quoteId: id,
        leadId: (quote as any).leadId ?? undefined,
        title: invoiceForm.title,
        clientName: invoiceForm.clientName,
        clientEmail: invoiceForm.clientEmail || undefined,
        clientPhone: invoiceForm.clientPhone || undefined,
        clientCompany: (quote as any).clientCompany ?? undefined,
        clientAddress: (quote as any).clientAddress ?? undefined,
        eventType: (quote as any).eventType ?? undefined,
        eventDate: (quote as any).eventDate ?? undefined,
        eventLocation: (quote as any).eventLocation ?? undefined,
        packageName: (quote as any).packageName ?? undefined,
        rentalDuration: (quote as any).rentalDuration ?? undefined,
        includedPrints: (quote as any).includedPrints ?? undefined,
        rentalPrice: (quote as any).rentalPrice ?? undefined,
        optionsPrice: (quote as any).optionsPrice ?? undefined,
        deliveryFees: (quote as any).deliveryFees ?? undefined,
        discountAmount: (quote as any).discountAmount ?? undefined,
        equipmentIds: (quote as any).equipmentIds ?? undefined,
        equipmentDescription: (quote as any).equipmentDescription ?? undefined,
        items: [
          {
            description: invoiceForm.description || "Service",
            quantity: qty,
            unitPrice: price,
            order: 1,
          },
        ],
      },
    });
  };

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        {t("quotes.loading")}
      </div>
    );
  if (!quote)
    return (
      <div className="p-8 text-sm text-muted-foreground">{t("quotes.not_found")}</div>
    );

  const color = STATUS_COLORS[quote.status];
  const q = quote as any;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="space-y-4">
        <Link href="/quotes">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 stroke-[1.75]" />
            {t("common.back")}
          </Button>
        </Link>
        <PageHeader
          title={<span className="font-mono">{quote.quoteNumber}</span>}
          description={<span className="flex items-center gap-3 flex-wrap">
            <span>{quote.title}</span>
            {color && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
                {t(`quotes.status_${quote.status}`)}
              </span>
            )}
          </span>}
        />
        <div className="flex gap-2 flex-wrap">
          <PrintPreview quote={quote} lang={lang} />
          {quote.status !== "accepted" && quote.status !== "declined" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => sendMutation.mutate({ id })}
              disabled={sendMutation.isPending || !quote.clientEmail}
              className="gap-1.5"
            >
              <Send className="w-3.5 h-3.5 stroke-[1.75]" /> {t("quotes.send_quote")}
            </Button>
          )}
          {(quote.status === "draft" || quote.status === "sent") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                statusMutation.mutate({ id, data: { status: "accepted" } })
              }
              className="gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.75]" />{" "}
              {t("pipeline.accept_quote")}
            </Button>
          )}
          {(quote.status === "draft" || quote.status === "sent") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                statusMutation.mutate({ id, data: { status: "declined" } })
              }
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <XCircle className="w-3.5 h-3.5 stroke-[1.75]" /> {t("pipeline.reject_quote")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={openCreateContract}
            className="gap-1.5"
          >
            <FileSignature className="w-3.5 h-3.5 stroke-[1.75]" />{" "}
            {t("pipeline.create_contract")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={openCreateInvoice}
            className="gap-1.5"
          >
            <ReceiptText className="w-3.5 h-3.5 stroke-[1.75]" />{" "}
            {t("pipeline.create_invoice")}
          </Button>
          <Select
            value={quote.status}
            onValueChange={(s) =>
              statusMutation.mutate({ id, data: { status: s as any } })
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`quotes.status_${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            {t("quotes.client_section")}
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
              <span className="font-medium">{quote.clientName}</span>
            </div>
            {quote.clientEmail && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                <a
                  href={`mailto:${quote.clientEmail}`}
                  className="hover:underline underline-offset-4"
                >
                  {quote.clientEmail}
                </a>
              </div>
            )}
            {(quote as any).clientPhone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 stroke-[1.75] text-muted-foreground" />
                <span>{(quote as any).clientPhone}</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            {t("quotes.dates_section")}
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("common.created")}
              </span>
              <span>{formatDate(quote.createdAt, lang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("quotes.valid_until_label")}
              </span>
              <span>{formatDate(quote.validUntil, lang)}</span>
            </div>
            {quote.sentAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("quotes.sent_label")}
                </span>
                <span>{formatDate(quote.sentAt, lang)}</span>
              </div>
            )}
            {quote.acceptedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("quotes.accepted_at_label")}
                </span>
                <span>{formatDate(quote.acceptedAt, lang)}</span>
              </div>
            )}
            {q.eventDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("quotes.event_date_label", { defaultValue: "Event Date" })}
                </span>
                <span className="font-medium">
                  {formatDate(q.eventDate, lang)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            {t("quotes.summary_section")}
          </h3>
          <div className="space-y-2 text-sm">
            {q.rentalPrice && Number(q.rentalPrice) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("quotes.rental_price_label", { defaultValue: "Rental" })}
                </span>
                <span className="tabular-nums">{formatCurrency(q.rentalPrice)}</span>
              </div>
            )}
            {q.optionsPrice && Number(q.optionsPrice) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("quotes.options_price_label", { defaultValue: "Options" })}
                </span>
                <span className="tabular-nums">{formatCurrency(q.optionsPrice)}</span>
              </div>
            )}
            {q.deliveryFees && Number(q.deliveryFees) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("quotes.delivery_fees_label", {
                    defaultValue: "Delivery",
                  })}
                </span>
                <span className="tabular-nums">{formatCurrency(q.deliveryFees)}</span>
              </div>
            )}
            {q.discountAmount && Number(q.discountAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("quotes.discount_label", { defaultValue: "Discount" })}
                </span>
                <span className="text-destructive tabular-nums">
                  -{formatCurrency(q.discountAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("quotes.subtotal")}
              </span>
              <span className="tabular-nums">{formatCurrency(quote.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("quotes.tax_label", { rate: quote.taxRate })}
              </span>
              <span className="tabular-nums">{formatCurrency(quote.taxAmount)}</span>
            </div>
            <div className="flex justify-between items-baseline border-t border-border pt-2 mt-2">
              <span className="font-medium">{t("quotes.total_col")}</span>
              <span className="font-semibold text-lg tracking-tight tabular-nums">
                {formatCurrency(quote.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {(q.eventType ||
        q.eventDate ||
        q.eventLocation ||
        q.packageName ||
        q.rentalDuration ||
        q.includedPrints) && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-medium text-foreground">
            {t("quotes.event_section", {
              defaultValue: "Event & Service Details",
            })}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {q.eventType && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">
                  {t("quotes.event_type_label", { defaultValue: "Event Type" })}
                </p>
                <p className="font-medium">{q.eventType}</p>
              </div>
            )}
            {q.eventDate && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">
                  {t("quotes.event_date_label", { defaultValue: "Event Date" })}
                </p>
                <p className="font-medium">{formatDate(q.eventDate, lang)}</p>
              </div>
            )}
            {q.eventStartTime && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">
                  {t("quotes.event_start_label", {
                    defaultValue: "Start Time",
                  })}
                </p>
                <p className="font-medium">
                  {q.eventStartTime}
                  {q.eventEndTime ? ` – ${q.eventEndTime}` : ""}
                </p>
              </div>
            )}
            {q.eventLocation && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">
                  {t("quotes.location_label", { defaultValue: "Location" })}
                </p>
                <p className="font-medium">{q.eventLocation}</p>
              </div>
            )}
            {q.packageName && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">
                  {t("quotes.package_name_label", { defaultValue: "Package" })}
                </p>
                <p className="font-medium">{q.packageName}</p>
              </div>
            )}
            {q.rentalDuration && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">
                  {t("quotes.rental_duration_label", {
                    defaultValue: "Duration",
                  })}
                </p>
                <p className="font-medium">{q.rentalDuration}h</p>
              </div>
            )}
            {q.includedPrints && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-0.5">
                  {t("quotes.included_prints_label", {
                    defaultValue: "Prints",
                  })}
                </p>
                <p className="font-medium">{q.includedPrints}</p>
              </div>
            )}
            {q.equipmentDescription && (
              <div className="col-span-2">
                <p className="text-[13px] text-muted-foreground mb-0.5">
                  {t("quotes.equipment_label", { defaultValue: "Equipment" })}
                </p>
                <p className="font-medium">{q.equipmentDescription}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">{t("quotes.line_items_section")}</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className="text-left px-5 py-3 text-[13px] font-normal text-muted-foreground">
                {t("quotes.description_col")}
              </th>
              <th className="text-right px-4 py-3 text-[13px] font-normal text-muted-foreground">
                {t("quotes.qty_col")}
              </th>
              <th className="text-right px-4 py-3 text-[13px] font-normal text-muted-foreground">
                {t("quotes.unit_price_col")}
              </th>
              <th className="text-right px-5 py-3 text-[13px] font-normal text-muted-foreground">
                {t("quotes.total_col")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {((quote.items ?? []) as any[]).map((item: any) => (
              <tr
                key={item.id}
                className={cn(Number(item.total) < 0 ? "text-destructive" : "")}
              >
                <td className="px-5 py-3">{item.description}</td>
                <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                  {item.quantity}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                  {formatCurrency(item.unitPrice)}
                </td>
                <td className="px-5 py-3 text-right font-medium tabular-nums">
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border">
            <tr>
              <td
                colSpan={3}
                className="px-5 py-3 text-right text-muted-foreground"
              >
                {t("quotes.subtotal")}
              </td>
              <td className="px-5 py-3 text-right font-medium tabular-nums">
                {formatCurrency(quote.subtotal)}
              </td>
            </tr>
            <tr>
              <td
                colSpan={3}
                className="px-5 py-2 text-right text-muted-foreground"
              >
                {t("quotes.tax_label", { rate: quote.taxRate })}
              </td>
              <td className="px-5 py-2 text-right tabular-nums">
                {formatCurrency(quote.taxAmount)}
              </td>
            </tr>
            <tr className="border-t border-border">
              <td
                colSpan={3}
                className="px-5 py-3 text-right font-medium"
              >
                {t("quotes.total_col")}
              </td>
              <td className="px-5 py-3 text-right font-semibold text-lg tracking-tight tabular-nums">
                {formatCurrency(quote.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {quote.paymentMethod && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{t("quotes.payment_method", { defaultValue: "Payment method" })}: </span>{quote.paymentMethod}</p>}
      {(quote.notes || quote.terms) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quote.notes && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h4 className="text-sm font-medium text-foreground mb-2">
                {t("quotes.notes_section")}
              </h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {quote.notes}
              </p>
            </div>
          )}
          {quote.terms && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h4 className="text-sm font-medium text-foreground mb-2">
                {t("quotes.terms_section")}
              </h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {quote.terms}
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={showCreateContract} onOpenChange={setShowCreateContract}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("pipeline.create_contract_from_quote")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>{t("contracts.title_label")} *</Label>
              <Input
                value={contractForm.title}
                onChange={(e) =>
                  setContractForm({ ...contractForm, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("contracts.client_name_label")} *</Label>
              <Input
                value={contractForm.clientName}
                onChange={(e) =>
                  setContractForm({
                    ...contractForm,
                    clientName: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("contracts.client_email_label")}</Label>
              <Input
                value={contractForm.clientEmail}
                onChange={(e) =>
                  setContractForm({
                    ...contractForm,
                    clientEmail: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("leads.phone_label")}</Label>
              <Input
                value={contractForm.clientPhone}
                onChange={(e) =>
                  setContractForm({
                    ...contractForm,
                    clientPhone: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("contracts.value_dollar_label")}</Label>
              <Input
                type="number"
                value={contractForm.value}
                onChange={(e) =>
                  setContractForm({ ...contractForm, value: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateContract(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={submitCreateContract}
              disabled={
                createContractMutation.isPending ||
                !contractForm.title ||
                !contractForm.clientName
              }
            >
              {createContractMutation.isPending
                ? t("leads.saving")
                : t("pipeline.create_contract")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("pipeline.create_invoice_from_quote")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>{t("invoices.title_label")} *</Label>
              <Input
                value={invoiceForm.title}
                onChange={(e) =>
                  setInvoiceForm({ ...invoiceForm, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("invoices.client_name_label")} *</Label>
              <Input
                value={invoiceForm.clientName}
                onChange={(e) =>
                  setInvoiceForm({ ...invoiceForm, clientName: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("invoices.client_email_label")}</Label>
              <Input
                value={invoiceForm.clientEmail}
                onChange={(e) =>
                  setInvoiceForm({
                    ...invoiceForm,
                    clientEmail: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("leads.phone_label")}</Label>
              <Input
                value={invoiceForm.clientPhone}
                onChange={(e) =>
                  setInvoiceForm({
                    ...invoiceForm,
                    clientPhone: e.target.value,
                  })
                }
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("pipeline.item_description")}</Label>
              <Input
                value={invoiceForm.description}
                onChange={(e) =>
                  setInvoiceForm({
                    ...invoiceForm,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pipeline.unit_price")}</Label>
              <Input
                type="number"
                value={invoiceForm.unitPrice}
                onChange={(e) =>
                  setInvoiceForm({ ...invoiceForm, unitPrice: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pipeline.quantity")}</Label>
              <Input
                type="number"
                value={invoiceForm.quantity}
                onChange={(e) =>
                  setInvoiceForm({ ...invoiceForm, quantity: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateInvoice(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={submitCreateInvoice}
              disabled={
                createInvoiceMutation.isPending ||
                !invoiceForm.title ||
                !invoiceForm.clientName
              }
            >
              {createInvoiceMutation.isPending
                ? t("leads.saving")
                : t("pipeline.create_invoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
