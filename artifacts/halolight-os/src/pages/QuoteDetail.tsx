import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetQuote, useUpdateQuoteStatus, useDeleteQuote, useGetCurrentUser, useCreateContract, useCreateInvoice } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, Building2, Mail, Phone, CheckCircle2, XCircle, FileSignature, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-info/10 text-info border-info/30",
  accepted: "bg-success/8 text-success border-success/20",
  declined: "bg-destructive/10 text-destructive border-destructive/30",
  expired: "bg-warning/8 text-warning border-warning/20",
};

const STATUS_KEYS = ["draft", "sent", "accepted", "declined", "expired"];

function formatDate(d: string | null | undefined, locale = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

function PrintPreview({ quoteNumber, title, clientName, clientEmail, items, subtotal, taxRate, taxAmount, total, notes, terms, validUntil, lang }: {
  quoteNumber: string; title: string; clientName: string; clientEmail?: string | null;
  items: Array<{ description: string; quantity: string; unitPrice: string; total: string }>;
  subtotal: string; taxRate: string; taxAmount: string; total: string;
  notes?: string | null; terms?: string | null; validUntil?: string | null;
  lang: string;
}) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrency();
  const { data: me } = useGetCurrentUser();
  const handlePrint = () => {
    const today = new Date().toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
    const validUntilStr = validUntil
      ? new Date(validUntil).toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" })
      : null;
    const logoUrl = (me as any)?.logoUrl ?? "";
    const companyName = (me as any)?.companyName ?? (me as any)?.fullName ?? "";
    const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${quoteNumber}</title>
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
      .parties{display:flex;gap:48px;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e5e7eb;font-size:12.5px}
      .label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:5px;font-weight:600}
      .party-name{font-size:14.5px;font-weight:700;margin-bottom:2px}
      .party-detail{color:#555;line-height:1.55}
      .section{margin-bottom:22px}
      table{width:100%;border-collapse:collapse;margin-bottom:22px}
      th{background:#f5f5f5;text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;font-weight:600}
      td{padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px}
      .totals{margin-left:auto;width:280px}
      .totals tr td:first-child{color:#666}
      .totals tr td:last-child{text-align:right;font-weight:600}
      .grand td{font-size:18px;font-weight:700;border-top:2px solid #111!important}
      .notes{font-size:13px;color:#555;line-height:1.65;white-space:pre-wrap}
      @media print{body{margin:0;padding:16px}@page{margin:1.4cm 1.2cm}}
    </style></head><body>
    <div class="doc-header">
      <div class="provider-block">
        ${logoUrl ? `<img src="${logoUrl}" alt="${companyName.replace(/"/g, "&quot;")}">` : ""}
        ${companyName ? `<div class="provider-name">${companyName}</div>` : ""}
        ${(me as any)?.email ? `<div style="font-size:11.5px;color:#555">${(me as any).email}</div>` : ""}
      </div>
      <div class="doc-meta">
        <div class="doc-type">${t("quotes.print_quote_title", { defaultValue: "QUOTE" })}</div>
        <div class="doc-number">${quoteNumber}</div>
        <div class="doc-sub">${title}</div>
        <div style="margin-top:8px;font-size:11px;color:#999">${t("quotes.print_quote_date").toUpperCase()}</div>
        <div style="font-size:12px">${today}</div>
        ${validUntilStr ? `<div style="margin-top:6px;font-size:11px;color:#999">${t("quotes.valid_until_label").toUpperCase()}</div><div style="font-size:12px">${validUntilStr}</div>` : ""}
      </div>
    </div>
    <div class="parties">
      <div>
        <div class="label">${t("quotes.print_from")}</div>
        <div class="party-name">${me?.fullName ?? ""}</div>
        ${(me as any)?.companyName ? `<div class="party-detail">${(me as any).companyName}</div>` : ""}
        ${(me as any)?.phone ? `<div class="party-detail">${(me as any).phone}</div>` : ""}
      </div>
      <div>
        <div class="label">${t("quotes.print_prepared_for")}</div>
        <div class="party-name">${clientName}</div>
        ${clientEmail ? `<div class="party-detail">${clientEmail}</div>` : ""}
      </div>
    </div>
    <table>
      <thead><tr><th style="width:50%">${t("quotes.description_col")}</th><th style="text-align:right">${t("quotes.qty_col")}</th><th style="text-align:right">${t("quotes.unit_price_col")}</th><th style="text-align:right">${t("quotes.total_col")}</th></tr></thead>
      <tbody>${items.map((item) => `<tr><td>${item.description}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${formatCurrency(item.unitPrice)}</td><td style="text-align:right">${formatCurrency(item.total)}</td></tr>`).join("")}</tbody>
    </table>
    <table class="totals">
      <tr><td>${t("quotes.subtotal")}</td><td>${formatCurrency(subtotal)}</td></tr>
      <tr><td>${t("quotes.tax_label", { rate: taxRate })}</td><td>${formatCurrency(taxAmount)}</td></tr>
      <tr class="grand"><td style="font-weight:700">${t("quotes.total_col")}</td><td style="font-size:18px;font-weight:700">${formatCurrency(total)}</td></tr>
    </table>
    ${notes ? `<div class="section"><div class="label">${t("quotes.notes_section")}</div><div class="notes">${notes}</div></div>` : ""}
    ${terms ? `<div class="section"><div class="label">${t("quotes.terms_section")}</div><div class="notes">${terms}</div></div>` : ""}
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  };

  return (
    <Button variant="outline" onClick={handlePrint} className="gap-2">
      <Printer className="w-4 h-4" /> {t("quotes.print_btn")}
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
  const [contractForm, setContractForm] = useState({ title: "", clientName: "", clientEmail: "", clientPhone: "", value: "" });
  const [invoiceForm, setInvoiceForm] = useState({ title: "", clientName: "", clientEmail: "", clientPhone: "", description: "", unitPrice: "", quantity: "1" });

  const { data: quote, isLoading } = useGetQuote(id, {
    query: { queryKey: ["quote", id], enabled: !!id },
  });

  const statusMutation = useUpdateQuoteStatus({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["quote", id] }); qc.invalidateQueries({ queryKey: ["quotes"] }); toast({ title: t("quotes.status_updated") }); },
    },
  });

  const deleteMutation = useDeleteQuote({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["quotes"] }); navigate("/quotes"); toast({ title: t("quotes.quote_deleted") }); },
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
      clientPhone: quote.clientPhone ?? "",
      value: quote.total,
    });
    setShowCreateContract(true);
  };

  const openCreateInvoice = () => {
    if (!quote) return;
    const firstItem = quote.items?.[0];
    setInvoiceForm({
      title: `Invoice — ${quote.title}`,
      clientName: quote.clientName,
      clientEmail: quote.clientEmail ?? "",
      clientPhone: quote.clientPhone ?? "",
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
        eventType: (quote as any).eventType ?? undefined,
      },
    });
  };

  const submitCreateInvoice = () => {
    if (!quote || !invoiceForm.title || !invoiceForm.clientName) return;
    const qty = invoiceForm.quantity || "1";
    const price = invoiceForm.unitPrice || "0";
    const total = String(Number(qty) * Number(price));
    createInvoiceMutation.mutate({
      data: {
        quoteId: id,
        leadId: (quote as any).leadId ?? undefined,
        title: invoiceForm.title,
        clientName: invoiceForm.clientName,
        clientEmail: invoiceForm.clientEmail || undefined,
        clientPhone: invoiceForm.clientPhone || undefined,
        clientCompany: (quote as any).clientCompany ?? undefined,
        eventType: (quote as any).eventType ?? undefined,
        items: [{ description: invoiceForm.description || "Service", quantity: qty, unitPrice: price, order: 1 }],
      },
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">{t("quotes.loading")}</div>;
  if (!quote) return <div className="p-8 text-muted-foreground">{t("quotes.not_found")}</div>;

  const color = STATUS_COLORS[quote.status];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/quotes"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="w-4 h-4" />{t("common.back")}</Button></Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-lg font-bold">{quote.quoteNumber}</span>
              {color && <Badge variant="outline" className={cn("text-xs", color)}>{t(`quotes.status_${quote.status}`)}</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{quote.title}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {quote && (
            <PrintPreview
              quoteNumber={quote.quoteNumber}
              title={quote.title}
              clientName={quote.clientName}
              clientEmail={quote.clientEmail}
              items={quote.items ?? []}
              subtotal={quote.subtotal}
              taxRate={quote.taxRate}
              taxAmount={quote.taxAmount}
              total={quote.total}
              notes={quote.notes}
              terms={quote.terms}
              validUntil={quote.validUntil}
              lang={lang}
            />
          )}
          {(quote.status === "draft" || quote.status === "sent") && (
            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id, data: { status: "accepted" } })} className="gap-1.5 border-success/40 text-success hover:bg-success/5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t("pipeline.accept_quote")}
            </Button>
          )}
          {(quote.status === "draft" || quote.status === "sent") && (
            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id, data: { status: "declined" } })} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5">
              <XCircle className="w-3.5 h-3.5" /> {t("pipeline.reject_quote")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={openCreateContract} className="gap-1.5">
            <FileSignature className="w-3.5 h-3.5" /> {t("pipeline.create_contract")}
          </Button>
          <Button size="sm" variant="outline" onClick={openCreateInvoice} className="gap-1.5">
            <ReceiptText className="w-3.5 h-3.5" /> {t("pipeline.create_invoice")}
          </Button>
          <Select value={quote.status} onValueChange={(s) => statusMutation.mutate({ id, data: { status: s as any } })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`quotes.status_${k}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("quotes.client_section")}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{quote.clientName}</span></div>
            {quote.clientEmail && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><a href={`mailto:${quote.clientEmail}`} className="hover:text-primary">{quote.clientEmail}</a></div>}
            {quote.clientPhone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>{quote.clientPhone}</span></div>}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("quotes.dates_section")}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("common.created")}</span><span>{formatDate(quote.createdAt, lang)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("quotes.valid_until_label")}</span><span>{formatDate(quote.validUntil, lang)}</span></div>
            {quote.sentAt && <div className="flex justify-between"><span className="text-muted-foreground">{t("quotes.sent_label")}</span><span>{formatDate(quote.sentAt, lang)}</span></div>}
            {quote.acceptedAt && <div className="flex justify-between"><span className="text-muted-foreground">{t("quotes.accepted_at_label")}</span><span>{formatDate(quote.acceptedAt, lang)}</span></div>}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("quotes.summary_section")}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("quotes.subtotal")}</span><span>{formatCurrency(quote.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("quotes.tax_label", { rate: quote.taxRate })}</span><span>{formatCurrency(quote.taxAmount)}</span></div>
            <div className="flex justify-between border-t pt-2 mt-2"><span className="font-bold">{t("quotes.total_col")}</span><span className="font-bold text-lg">{formatCurrency(quote.total)}</span></div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/30">
          <h3 className="font-semibold">{t("quotes.line_items_section")}</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/20 border-b">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground">{t("quotes.description_col")}</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("quotes.qty_col")}</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("quotes.unit_price_col")}</th>
              <th className="text-right px-5 py-3 font-medium text-muted-foreground">{t("quotes.total_col")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(quote.items ?? []).map((item) => (
              <tr key={item.id} className={cn(Number(item.total) < 0 ? "text-destructive" : "")}>
                <td className="px-5 py-3">{item.description}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{item.quantity}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                <td className="px-5 py-3 text-right font-medium">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/20">
            <tr><td colSpan={3} className="px-5 py-3 text-right text-muted-foreground">{t("quotes.subtotal")}</td><td className="px-5 py-3 text-right font-medium">{formatCurrency(quote.subtotal)}</td></tr>
            <tr><td colSpan={3} className="px-5 py-2 text-right text-muted-foreground">{t("quotes.tax_label", { rate: quote.taxRate })}</td><td className="px-5 py-2 text-right">{formatCurrency(quote.taxAmount)}</td></tr>
            <tr className="border-t"><td colSpan={3} className="px-5 py-3 text-right font-bold text-base">{t("quotes.total_col")}</td><td className="px-5 py-3 text-right font-bold text-lg">{formatCurrency(quote.total)}</td></tr>
          </tfoot>
        </table>
      </div>

      {(quote.notes || quote.terms) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quote.notes && (
            <div className="rounded-xl border bg-card p-5">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("quotes.notes_section")}</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
          {quote.terms && (
            <div className="rounded-xl border bg-card p-5">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("quotes.terms_section")}</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.terms}</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={showCreateContract} onOpenChange={setShowCreateContract}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("pipeline.create_contract_from_quote")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5"><Label>{t("contracts.title_label")} *</Label><Input value={contractForm.title} onChange={(e) => setContractForm({ ...contractForm, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("contracts.client_name_label")} *</Label><Input value={contractForm.clientName} onChange={(e) => setContractForm({ ...contractForm, clientName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("contracts.client_email_label")}</Label><Input value={contractForm.clientEmail} onChange={(e) => setContractForm({ ...contractForm, clientEmail: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("leads.phone_label")}</Label><Input value={contractForm.clientPhone} onChange={(e) => setContractForm({ ...contractForm, clientPhone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("contracts.value_dollar_label")}</Label><Input type="number" value={contractForm.value} onChange={(e) => setContractForm({ ...contractForm, value: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateContract(false)}>{t("common.cancel")}</Button>
            <Button onClick={submitCreateContract} disabled={createContractMutation.isPending || !contractForm.title || !contractForm.clientName}>
              {createContractMutation.isPending ? t("leads.saving") : t("pipeline.create_contract")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("pipeline.create_invoice_from_quote")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5"><Label>{t("invoices.title_label")} *</Label><Input value={invoiceForm.title} onChange={(e) => setInvoiceForm({ ...invoiceForm, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("invoices.client_name_label")} *</Label><Input value={invoiceForm.clientName} onChange={(e) => setInvoiceForm({ ...invoiceForm, clientName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("invoices.client_email_label")}</Label><Input value={invoiceForm.clientEmail} onChange={(e) => setInvoiceForm({ ...invoiceForm, clientEmail: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("leads.phone_label")}</Label><Input value={invoiceForm.clientPhone} onChange={(e) => setInvoiceForm({ ...invoiceForm, clientPhone: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>{t("pipeline.item_description")}</Label><Input value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("pipeline.unit_price")}</Label><Input type="number" value={invoiceForm.unitPrice} onChange={(e) => setInvoiceForm({ ...invoiceForm, unitPrice: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("pipeline.quantity")}</Label><Input type="number" value={invoiceForm.quantity} onChange={(e) => setInvoiceForm({ ...invoiceForm, quantity: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateInvoice(false)}>{t("common.cancel")}</Button>
            <Button onClick={submitCreateInvoice} disabled={createInvoiceMutation.isPending || !invoiceForm.title || !invoiceForm.clientName}>
              {createInvoiceMutation.isPending ? t("leads.saving") : t("pipeline.create_invoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
