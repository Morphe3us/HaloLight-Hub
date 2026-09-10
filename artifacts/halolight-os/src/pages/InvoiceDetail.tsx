import { useState } from "react";
import { paymentMethodPrint } from "@/lib/paymentMethodPrint";
import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetInvoice, useUpdateInvoiceStatus, useDeleteInvoice, useGetCurrentUser, useCreateContract } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, Building2, Mail, CheckCircle2, AlertCircle, Clock, Bell, FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-info/10 text-info border-info/30",
  paid: "bg-success/8 text-success border-success/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  draft: Clock,
  sent: Clock,
  paid: CheckCircle2,
  overdue: AlertCircle,
  cancelled: Clock,
};

const STATUS_KEYS = ["draft", "sent", "paid", "overdue", "cancelled"];

function formatDate(d: string | null | undefined, locale = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

function invoiceServiceDetailsHtml(invoice: any, formatCurrency: (v: any) => string, t: (k: string, opts?: any) => string, lang: string): string {
  const fields: string[] = [];

  const eventDate = invoice.eventDate
    ? new Date(invoice.eventDate).toLocaleDateString(lang, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : null;

  if (invoice.eventType || eventDate || invoice.eventLocation) {
    fields.push(`
      <div class="detail-section">
        <div class="detail-label">${t("invoices.event_section", { defaultValue: "Event Details" })}</div>
        <table class="detail-table">
          ${invoice.eventType ? `<tr><td class="dk">${t("invoices.event_type_label", { defaultValue: "Type" })}</td><td>${invoice.eventType}</td></tr>` : ""}
          ${eventDate ? `<tr><td class="dk">${t("invoices.event_date_label", { defaultValue: "Date" })}</td><td>${eventDate}</td></tr>` : ""}
          ${invoice.eventStartTime ? `<tr><td class="dk">${t("invoices.event_start_label", { defaultValue: "Start Time" })}</td><td>${invoice.eventStartTime}${invoice.eventEndTime ? ` – ${invoice.eventEndTime}` : ""}</td></tr>` : ""}
          ${invoice.eventLocation ? `<tr><td class="dk">${t("invoices.location_label", { defaultValue: "Location" })}</td><td>${invoice.eventLocation}</td></tr>` : ""}
        </table>
      </div>`);
  }

  const hasPackage = invoice.packageName || invoice.rentalDuration || invoice.includedPrints || invoice.equipmentDescription;
  if (hasPackage) {
    const options: string[] = [];
    if (invoice.digitalGallery) options.push(t("invoices.option_digital_gallery", { defaultValue: "Digital Gallery" }));
    if (invoice.customTemplate) options.push(t("invoices.option_custom_template", { defaultValue: "Custom Template" }));
    if (invoice.deliveryIncluded) options.push(t("invoices.option_delivery", { defaultValue: "Delivery" }));
    if (invoice.setupIncluded) options.push(t("invoices.option_setup", { defaultValue: "Setup & Pickup" }));
    if (invoice.operatorIncluded) options.push(t("invoices.option_operator", { defaultValue: "Operator" }));

    fields.push(`
      <div class="detail-section">
        <div class="detail-label">${t("invoices.package_section", { defaultValue: "Service Package" })}</div>
        <table class="detail-table">
          ${invoice.packageName ? `<tr><td class="dk">${t("invoices.package_name_label", { defaultValue: "Package" })}</td><td>${invoice.packageName}</td></tr>` : ""}
          ${invoice.rentalDuration ? `<tr><td class="dk">${t("invoices.rental_duration_label", { defaultValue: "Duration" })}</td><td>${invoice.rentalDuration} ${t("invoices.hours_label", { defaultValue: "hours" })}</td></tr>` : ""}
          ${invoice.includedPrints ? `<tr><td class="dk">${t("invoices.included_prints_label", { defaultValue: "Prints Included" })}</td><td>${invoice.includedPrints}</td></tr>` : ""}
          ${invoice.equipmentDescription ? `<tr><td class="dk">${t("invoices.equipment_label", { defaultValue: "Equipment" })}</td><td>${invoice.equipmentDescription}</td></tr>` : ""}
          ${options.length > 0 ? `<tr><td class="dk">${t("invoices.options_label", { defaultValue: "Options" })}</td><td>${options.join(", ")}</td></tr>` : ""}
        </table>
      </div>`);
  }

  const hasCustomPricing = Number(invoice.rentalPrice) > 0 || Number(invoice.optionsPrice) > 0 || Number(invoice.deliveryFees) > 0 || Number(invoice.discountAmount) > 0;
  if (hasCustomPricing) {
    fields.push(`
      <div class="detail-section">
        <div class="detail-label">${t("invoices.pricing_breakdown_label", { defaultValue: "Pricing Breakdown" })}</div>
        <table class="detail-table">
          ${Number(invoice.rentalPrice) > 0 ? `<tr><td class="dk">${t("invoices.rental_price_label", { defaultValue: "Rental" })}</td><td>${formatCurrency(invoice.rentalPrice)}</td></tr>` : ""}
          ${Number(invoice.optionsPrice) > 0 ? `<tr><td class="dk">${t("invoices.options_price_label", { defaultValue: "Options" })}</td><td>${formatCurrency(invoice.optionsPrice)}</td></tr>` : ""}
          ${Number(invoice.deliveryFees) > 0 ? `<tr><td class="dk">${t("invoices.delivery_fees_label", { defaultValue: "Delivery" })}</td><td>${formatCurrency(invoice.deliveryFees)}</td></tr>` : ""}
          ${Number(invoice.discountAmount) > 0 ? `<tr><td class="dk">${t("invoices.discount_label", { defaultValue: "Discount" })}</td><td>-${formatCurrency(invoice.discountAmount)}</td></tr>` : ""}
        </table>
      </div>`);
  }

  if (fields.length === 0) return "";

  return `
    <div class="service-block">
      ${fields.join("")}
    </div>`;
}

function PrintButton({ invoice, items, lang }: { invoice: any; items: any[]; lang: string }) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrency();
  const { data: me } = useGetCurrentUser();
  const handlePrint = () => {
    const today = new Date().toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
    const dueDateStr = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" })
      : null;
    const paidAtStr = invoice.paidAt
      ? new Date(invoice.paidAt).toLocaleDateString(lang, { month: "long", day: "numeric", year: "numeric" })
      : "";
    const logoUrl = (me as any)?.logoUrl ?? "";
    const companyName = (me as any)?.companyName ?? (me as any)?.fullName ?? "";
    const rawEmail = (me as any)?.email ?? "";
    const providerEmail = (!rawEmail || rawEmail.includes("placeholder.com") || /^user_[a-f0-9]+@/.test(rawEmail)) ? "" : rawEmail;

    const detailsHtml = invoiceServiceDetailsHtml(invoice, formatCurrency, t, lang);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${invoice.invoiceNumber}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:40px auto;color:#111;font-size:13.5px;padding:0 28px}
      .doc-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #111;margin-bottom:24px}
      .provider-block img{max-height:52px;max-width:180px;object-fit:contain;display:block;margin-bottom:6px}
      .provider-name{font-size:16px;font-weight:700;margin-bottom:2px}
      .doc-meta{text-align:right;flex-shrink:0;margin-left:24px}
      .doc-type{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#999;margin-bottom:4px}
      .doc-number{font-size:18px;font-weight:700;font-family:'Courier New',monospace}
      .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px;background:${invoice.status === "paid" ? "#d1fae5" : "#dbeafe"};color:${invoice.status === "paid" ? "#065f46" : "#1e40af"}}
      .label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:5px;font-weight:600}
      .party-name{font-size:14.5px;font-weight:700;margin-bottom:2px}
      .party-detail{color:#555;line-height:1.55;font-size:12.5px}
      .parties{display:flex;gap:48px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid #e5e7eb}
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
      .totals td:first-child{color:#666}
      .totals td:last-child{text-align:right;font-weight:600}
      .grand td{font-size:18px;font-weight:700;border-top:2px solid #111!important}
      ${invoice.status === "paid" ? ".paid-stamp{background:#d1fae5;border:1.5px solid #6ee7b7;border-radius:8px;padding:12px;text-align:center;color:#065f46;font-weight:700;font-size:15px;margin-bottom:22px}" : ""}
      @media print{body{margin:0;padding:16px}@page{margin:1.4cm 1.2cm}}
    </style></head><body>
    <div class="doc-header">
      <div class="provider-block">
        ${logoUrl ? `<img src="${logoUrl}" alt="${companyName.replace(/"/g, "&quot;")}">` : ""}
        ${companyName ? `<div class="provider-name">${companyName}</div>` : ""}
        ${providerEmail ? `<div style="font-size:11.5px;color:#555">${providerEmail}</div>` : ""}
      </div>
      <div class="doc-meta">
        <div class="doc-type">${t("invoices.print_invoice", { defaultValue: "INVOICE" }).toUpperCase()}</div>
        <div class="doc-number">${invoice.invoiceNumber}</div>
        <span class="badge">${t("invoices.status_" + invoice.status).toUpperCase()}</span>
        <div style="margin-top:8px;font-size:11px;color:#999">${t("invoices.print_invoice_date").toUpperCase()}</div>
        <div style="font-size:12px">${today}</div>
        ${dueDateStr ? `<div style="margin-top:6px;font-size:11px;color:#999">${t("invoices.due_date_label").toUpperCase()}</div><div style="font-size:12px">${dueDateStr}</div>` : ""}
      </div>
    </div>
    ${invoice.status === "paid" ? `<div class="paid-stamp">&#10003; ${t("invoices.print_paid")} &mdash; ${paidAtStr}${invoice.paymentMethod ? " " + t("invoices.via") + " " + invoice.paymentMethod : ""}${invoice.paymentReference ? " &mdash; " + t("invoices.ref_label") + " " + invoice.paymentReference : ""}</div>` : ""}
    <div class="parties">
      <div>
        <div class="label">${t("invoices.print_from")}</div>
        <div class="party-name">${(me as any)?.fullName ?? ""}</div>
        ${(me as any)?.companyName ? `<div class="party-detail">${(me as any).companyName}</div>` : ""}
        ${(me as any)?.phone ? `<div class="party-detail">${(me as any).phone}</div>` : ""}
      </div>
      <div>
        <div class="label">${t("invoices.bill_to")}</div>
        <div class="party-name">${invoice.clientName}</div>
        ${invoice.clientEmail ? `<div class="party-detail">${invoice.clientEmail}</div>` : ""}
        ${invoice.clientPhone ? `<div class="party-detail">${invoice.clientPhone}</div>` : ""}
        ${invoice.clientCompany ? `<div class="party-detail">${invoice.clientCompany}</div>` : ""}
      </div>
    </div>
    ${detailsHtml}
    <table class="items">
      <thead><tr><th style="width:50%">${t("invoices.description_col")}</th><th style="text-align:right">${t("invoices.qty_col")}</th><th style="text-align:right">${t("invoices.unit_price_col")}</th><th style="text-align:right">${t("invoices.total_col")}</th></tr></thead>
      <tbody>${items.map((item: any) => `<tr><td>${item.description}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${formatCurrency(item.unitPrice)}</td><td style="text-align:right">${formatCurrency(item.total)}</td></tr>`).join("")}</tbody>
    </table>
    <table class="totals">
      <tr><td>${t("invoices.subtotal_label")}</td><td>${formatCurrency(invoice.subtotal)}</td></tr>
      <tr><td>${t("invoices.tax_label", { rate: invoice.taxRate })}</td><td>${formatCurrency(invoice.taxAmount)}</td></tr>
      <tr class="grand"><td>${t("invoices.total_col")}</td><td>${formatCurrency(invoice.total)}</td></tr>
    </table>
    ${invoice.notes ? `<div class="section"><div class="label">${t("invoices.notes_section")}</div><div style="font-size:13px;color:#666;white-space:pre-wrap">${invoice.notes}</div></div>` : ""}
    ${paymentMethodPrint(t("invoices.payment_method", { defaultValue: "Payment method" }), invoice.paymentMethod)}
    ${invoice.terms ? `<div class="section"><div class="label">${t("invoices.payment_terms_section")}</div><div style="font-size:13px;color:#666;white-space:pre-wrap">${invoice.terms}</div></div>` : ""}
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.document.title = invoice.invoiceNumber; w.focus(); w.print(); }
  };
  return <Button variant="outline" onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" /> {t("quotes.print_btn")}</Button>;
}

export default function InvoiceDetail() {
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();

  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ paidAmount: "", paymentMethod: "Bank Transfer", paymentReference: "" });
  const [sendingReminder, setSendingReminder] = useState(false);
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [contractForm, setContractForm] = useState({ title: "", notes: "", startDate: "", endDate: "" });

  const { data: invoice, isLoading } = useGetInvoice(id, {
    query: { queryKey: ["invoice", id], enabled: !!id },
  });

  const statusMutation = useUpdateInvoiceStatus({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["invoice", id] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
        setShowMarkPaid(false);
        toast({ title: t("invoices.invoice_updated") });
      },
    },
  });

  const deleteMutation = useDeleteInvoice({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); navigate("/invoices"); toast({ title: t("invoices.invoice_deleted") }); },
    },
  });

  const createContractMutation = useCreateContract({
    mutation: {
      onSuccess: (contract: any) => {
        qc.invalidateQueries({ queryKey: ["contracts"] });
        setShowCreateContract(false);
        toast({ title: t("contracts.contract_created") });
        navigate(`/contracts/${contract.id}`);
      },
    },
  });

  const handleSendReminder = () => {
    const hasContact = invoice?.clientEmail || (invoice as any)?.clientPhone;
    if (!hasContact) {
      toast({ title: t("pipeline.reminder_no_contact"), variant: "destructive" });
      return;
    }
    setSendingReminder(true);
    setTimeout(() => {
      setSendingReminder(false);
      toast({ title: t("pipeline.reminder_simulated"), description: t("pipeline.reminder_sent_desc", { client: invoice?.clientName ?? "" }) });
    }, 800);
  };

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">{t("invoices.loading")}</div>;
  if (!invoice) return <div className="p-8 text-muted-foreground">{t("invoices.not_found")}</div>;

  const color = STATUS_COLORS[invoice.status];
  const StatusIcon = STATUS_ICONS[invoice.status] ?? Clock;
  const items = invoice.items ?? [];
  const inv = invoice as any;

  const handleMarkPaid = () => {
    statusMutation.mutate({
      id,
      data: {
        status: "paid",
        paidAmount: paymentForm.paidAmount || invoice.total,
        paymentMethod: paymentForm.paymentMethod || undefined,
        paymentReference: paymentForm.paymentReference || undefined,
      },
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/invoices"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="w-4 h-4" />{t("common.back")}</Button></Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-lg font-bold">{invoice.invoiceNumber}</span>
              {color && (
                <Badge variant="outline" className={cn("text-xs gap-1", color)}>
                  <StatusIcon className="w-3 h-3" /> {t(`invoices.status_${invoice.status}`)}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{invoice.title}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrintButton invoice={invoice} items={items} lang={lang} />
          {(invoice.status === "sent" || invoice.status === "overdue") && (
            <Button size="sm" variant="outline" onClick={handleSendReminder} disabled={sendingReminder} className="gap-1.5">
              <Bell className="w-3.5 h-3.5" /> {sendingReminder ? t("pipeline.sending") : t("pipeline.send_reminder")}
            </Button>
          )}
          {invoice.status === "sent" && (
            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id, data: { status: "overdue" } })} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5">
              <AlertCircle className="w-3.5 h-3.5" /> {t("pipeline.mark_overdue")}
            </Button>
          )}
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <Button onClick={() => { setPaymentForm({ paidAmount: invoice.total, paymentMethod: "Bank Transfer", paymentReference: "" }); setShowMarkPaid(true); }} className="gap-2 bg-success hover:bg-success/90">
              <CheckCircle2 className="w-4 h-4" /> {t("invoices.mark_as_paid_btn")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setContractForm({ title: invoice.title || `Contract — ${invoice.clientName}`, notes: "", startDate: "", endDate: "" });
              setShowCreateContract(true);
            }}
          >
            <FileSignature className="w-3.5 h-3.5" /> {t("contracts.create_contract_btn")}
          </Button>
          <Select value={invoice.status} onValueChange={(s) => { if (s !== "paid") statusMutation.mutate({ id, data: { status: s as any } }); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`invoices.status_${k}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {invoice.status === "paid" && (
        <div className="rounded-xl bg-success/8 border border-success/20 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-success">{t("invoices.payment_received_label")} — </span>
            <span className="text-success">{formatCurrency(invoice.paidAmount ?? invoice.total)} {t("invoices.paid_on")} {formatDate(invoice.paidAt, lang)}</span>
            {invoice.paymentMethod && <span className="text-success"> {t("invoices.via")} {invoice.paymentMethod}</span>}
            {invoice.paymentReference && <span className="text-success"> · {t("invoices.ref_label")} {invoice.paymentReference}</span>}
          </div>
        </div>
      )}

      {invoice.status === "overdue" && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">{t("invoices.overdue_full", { date: formatDate(invoice.dueDate, lang) })}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("invoices.bill_to")}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{invoice.clientName}</span></div>
            {invoice.clientEmail && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><a href={`mailto:${invoice.clientEmail}`} className="hover:text-primary">{invoice.clientEmail}</a></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("invoices.dates_section")}</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("common.created")}</span><span>{formatDate(invoice.createdAt, lang)}</span></div>
            {invoice.dueDate && <div className="flex justify-between"><span className="text-muted-foreground">{t("invoices.due_date_label")}</span><span className={cn(invoice.status === "overdue" ? "text-destructive font-medium" : "")}>{formatDate(invoice.dueDate, lang)}</span></div>}
            {invoice.sentAt && <div className="flex justify-between"><span className="text-muted-foreground">{t("invoices.sent_label")}</span><span>{formatDate(invoice.sentAt, lang)}</span></div>}
            {invoice.paidAt && <div className="flex justify-between"><span className="text-muted-foreground">{t("invoices.paid_label")}</span><span className="text-success font-medium">{formatDate(invoice.paidAt, lang)}</span></div>}
            {inv.eventDate && <div className="flex justify-between"><span className="text-muted-foreground">{t("invoices.event_date_label", { defaultValue: "Event Date" })}</span><span className="font-medium">{formatDate(inv.eventDate, lang)}</span></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("invoices.amount_due")}</h3>
          <p className={cn("text-2xl font-bold", invoice.status === "paid" ? "text-success" : invoice.status === "overdue" ? "text-destructive" : "")}>{formatCurrency(invoice.total)}</p>
          <div className="text-xs text-muted-foreground space-y-1">
            {inv.rentalPrice && Number(inv.rentalPrice) > 0 && <div className="flex justify-between"><span>{t("invoices.rental_price_label", { defaultValue: "Rental" })}</span><span>{formatCurrency(inv.rentalPrice)}</span></div>}
            {inv.optionsPrice && Number(inv.optionsPrice) > 0 && <div className="flex justify-between"><span>{t("invoices.options_price_label", { defaultValue: "Options" })}</span><span>{formatCurrency(inv.optionsPrice)}</span></div>}
            {inv.deliveryFees && Number(inv.deliveryFees) > 0 && <div className="flex justify-between"><span>{t("invoices.delivery_fees_label", { defaultValue: "Delivery" })}</span><span>{formatCurrency(inv.deliveryFees)}</span></div>}
            {inv.discountAmount && Number(inv.discountAmount) > 0 && <div className="flex justify-between"><span>{t("invoices.discount_label", { defaultValue: "Discount" })}</span><span className="text-destructive">-{formatCurrency(inv.discountAmount)}</span></div>}
            <div className="flex justify-between"><span>{t("invoices.subtotal_label")}</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span>{t("invoices.tax_label", { rate: invoice.taxRate })}</span><span>{formatCurrency(invoice.taxAmount)}</span></div>
          </div>
        </div>
      </div>

      {(inv.eventType || inv.eventDate || inv.eventLocation || inv.packageName || inv.rentalDuration || inv.includedPrints) && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("invoices.event_section", { defaultValue: "Event & Service Details" })}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {inv.eventType && <div><p className="text-xs text-muted-foreground mb-0.5">{t("invoices.event_type_label", { defaultValue: "Event Type" })}</p><p className="font-medium">{inv.eventType}</p></div>}
            {inv.eventDate && <div><p className="text-xs text-muted-foreground mb-0.5">{t("invoices.event_date_label", { defaultValue: "Event Date" })}</p><p className="font-medium">{formatDate(inv.eventDate, lang)}</p></div>}
            {inv.eventStartTime && <div><p className="text-xs text-muted-foreground mb-0.5">{t("invoices.event_start_label", { defaultValue: "Start Time" })}</p><p className="font-medium">{inv.eventStartTime}{inv.eventEndTime ? ` – ${inv.eventEndTime}` : ""}</p></div>}
            {inv.eventLocation && <div><p className="text-xs text-muted-foreground mb-0.5">{t("invoices.location_label", { defaultValue: "Location" })}</p><p className="font-medium">{inv.eventLocation}</p></div>}
            {inv.packageName && <div><p className="text-xs text-muted-foreground mb-0.5">{t("invoices.package_name_label", { defaultValue: "Package" })}</p><p className="font-medium">{inv.packageName}</p></div>}
            {inv.rentalDuration && <div><p className="text-xs text-muted-foreground mb-0.5">{t("invoices.rental_duration_label", { defaultValue: "Duration" })}</p><p className="font-medium">{inv.rentalDuration}h</p></div>}
            {inv.includedPrints && <div><p className="text-xs text-muted-foreground mb-0.5">{t("invoices.included_prints_label", { defaultValue: "Prints Included" })}</p><p className="font-medium">{inv.includedPrints}</p></div>}
            {inv.equipmentDescription && <div className="col-span-2"><p className="text-xs text-muted-foreground mb-0.5">{t("invoices.equipment_label", { defaultValue: "Equipment" })}</p><p className="font-medium">{inv.equipmentDescription}</p></div>}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/30"><h3 className="font-semibold">{t("invoices.line_items_section")}</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/20 border-b">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground">{t("invoices.description_col")}</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("invoices.qty_col")}</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("invoices.unit_price_col")}</th>
              <th className="text-right px-5 py-3 font-medium text-muted-foreground">{t("invoices.total_col")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(items as any[]).map((item: any) => (
              <tr key={item.id} className={cn(Number(item.total) < 0 ? "text-destructive" : "")}>
                <td className="px-5 py-3">{item.description}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                <td className="px-5 py-3 text-right font-medium">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/20">
            <tr><td colSpan={3} className="px-5 py-3 text-right text-muted-foreground">{t("invoices.subtotal_label")}</td><td className="px-5 py-3 text-right font-medium">{formatCurrency(invoice.subtotal)}</td></tr>
            <tr><td colSpan={3} className="px-5 py-2 text-right text-muted-foreground">{t("invoices.tax_label", { rate: invoice.taxRate })}</td><td className="px-5 py-2 text-right">{formatCurrency(invoice.taxAmount)}</td></tr>
            <tr className="border-t"><td colSpan={3} className="px-5 py-3 text-right font-bold text-base">{t("invoices.total_col")}</td><td className="px-5 py-3 text-right font-bold text-lg">{formatCurrency(invoice.total)}</td></tr>
          </tfoot>
        </table>
      </div>

      {invoice.paymentMethod && <p className="text-sm"><span className="font-medium">{t("invoices.payment_method", { defaultValue: "Payment method" })}: </span>{invoice.paymentMethod}</p>}
      {(invoice.notes || invoice.terms) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {invoice.notes && <div className="rounded-xl border bg-card p-5"><h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("invoices.notes_section")}</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p></div>}
          {invoice.terms && <div className="rounded-xl border bg-card p-5"><h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("invoices.payment_terms_section")}</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.terms}</p></div>}
        </div>
      )}

      <Dialog open={showCreateContract} onOpenChange={setShowCreateContract}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("contracts.new_contract")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-info/8 border border-info/20 px-3 py-2 text-xs text-info">
              {t("invoices.service_auto_filled_contract")}
            </div>
            <div className="space-y-1.5">
              <Label>{t("contracts.title_label")}</Label>
              <Input value={contractForm.title} onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })} placeholder={t("contracts.title_placeholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("contracts.start_label")}</Label>
                <Input type="date" value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("contracts.end_label")}</Label>
                <Input type="date" value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("contracts.notes_label")}</Label>
              <Input value={contractForm.notes} onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })} placeholder="Optional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateContract(false)}>{t("common.cancel")}</Button>
            <Button
              disabled={!contractForm.title || createContractMutation.isPending}
              onClick={() => {
                createContractMutation.mutate({
                  data: {
                    invoiceId: id,
                    title: contractForm.title,
                    clientName: invoice.clientName,
                    notes: contractForm.notes || undefined,
                    startDate: contractForm.startDate || undefined,
                    endDate: contractForm.endDate || undefined,
                  } as any,
                });
              }}
            >
              {createContractMutation.isPending ? t("contracts.creating") : t("contracts.create_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMarkPaid} onOpenChange={setShowMarkPaid}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("invoices.record_payment")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>{t("invoices.amount_paid_label")}</Label><Input type="number" value={paymentForm.paidAmount} onChange={(e) => setPaymentForm({ ...paymentForm, paidAmount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("invoices.payment_method_label")}</Label>
              <Select value={paymentForm.paymentMethod} onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Bank Transfer", "Credit Card", "Cash", "Check", "PayPal", "Stripe", "Other"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t("invoices.reference_label")}</Label><Input value={paymentForm.paymentReference} onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })} placeholder="TXN-123456" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaid(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleMarkPaid} disabled={statusMutation.isPending} className="bg-success hover:bg-success/90">{statusMutation.isPending ? t("invoices.saving") : t("invoices.confirm_payment")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
