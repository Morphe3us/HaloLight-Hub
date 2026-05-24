import { useRoute, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetQuote, useUpdateQuoteStatus, useDeleteQuote } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, Building2, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useCurrency } from "@/lib/currency";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-info/10 text-info border-info/30",
  accepted: "bg-success/8 text-success border-success/20",
  declined: "bg-destructive/10 text-destructive border-destructive/30",
  expired: "bg-warning/8 text-warning border-warning/20",
};

const STATUS_KEYS = ["draft", "sent", "accepted", "declined", "expired"];

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function PrintPreview({ quoteNumber, title, clientName, clientEmail, items, subtotal, taxRate, taxAmount, total, notes, terms, validUntil }: {
  quoteNumber: string; title: string; clientName: string; clientEmail?: string | null;
  items: Array<{ description: string; quantity: string; unitPrice: string; total: string }>;
  subtotal: string; taxRate: string; taxAmount: string; total: string;
  notes?: string | null; terms?: string | null; validUntil?: string | null;
}) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrency();
  const handlePrint = () => {
    const html = `<!DOCTYPE html><html><head><title>${quoteNumber}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#111;font-size:14px}
      h1{font-size:24px;margin:0}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
      .brand{font-size:22px;font-weight:700;color:#7c3aed}
      .meta{text-align:right;font-size:12px;color:#666}
      .section{margin-bottom:24px}
      .label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#999;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      th{background:#f5f5f5;text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#666}
      td{padding:10px 12px;border-bottom:1px solid #f0f0f0}
      .totals{margin-left:auto;width:280px}
      .totals tr td:first-child{color:#666}
      .totals tr td:last-child{text-align:right;font-weight:600}
      .grand{font-size:18px;font-weight:700;border-top:2px solid #111!important}
      .notes{font-size:13px;color:#666;line-height:1.6;white-space:pre-wrap}
      @media print{body{margin:20px}}
    </style></head><body>
    <div class="header">
      <div><div class="brand">HaloLight Hub</div><h1 style="margin-top:12px">${quoteNumber}</h1><div style="color:#666;margin-top:4px">${title}</div></div>
      <div class="meta">
        <div style="font-size:11px;color:#999">QUOTE DATE</div>
        <div>${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</div>
        ${validUntil ? `<div style="margin-top:8px;font-size:11px;color:#999">VALID UNTIL</div><div>${new Date(validUntil).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</div>` : ""}
      </div>
    </div>
    <div class="section">
      <div class="label">Prepared For</div>
      <div style="font-size:16px;font-weight:600">${clientName}</div>
      ${clientEmail ? `<div style="color:#666">${clientEmail}</div>` : ""}
    </div>
    <table>
      <thead><tr><th style="width:50%">Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${items.map((item) => `<tr><td>${item.description}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${formatCurrency(item.unitPrice)}</td><td style="text-align:right">${formatCurrency(item.total)}</td></tr>`).join("")}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td>${formatCurrency(subtotal)}</td></tr>
      <tr><td>Tax (${taxRate}%)</td><td>${formatCurrency(taxAmount)}</td></tr>
      <tr class="grand"><td style="font-weight:700">Total</td><td style="font-size:18px;font-weight:700">${formatCurrency(total)}</td></tr>
    </table>
    ${notes ? `<div class="section"><div class="label">Notes</div><div class="notes">${notes}</div></div>` : ""}
    ${terms ? `<div class="section"><div class="label">Terms &amp; Conditions</div><div class="notes">${terms}</div></div>` : ""}
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
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();

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

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">{t("quotes.loading")}</div>;
  if (!quote) return <div className="p-8 text-muted-foreground">{t("quotes.not_found")}</div>;

  const color = STATUS_COLORS[quote.status];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/quotes"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
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
            />
          )}
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
            <div className="flex justify-between"><span className="text-muted-foreground">{t("common.created")}</span><span>{formatDate(quote.createdAt)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("quotes.valid_until_label")}</span><span>{formatDate(quote.validUntil)}</span></div>
            {quote.sentAt && <div className="flex justify-between"><span className="text-muted-foreground">{t("quotes.sent_label")}</span><span>{formatDate(quote.sentAt)}</span></div>}
            {quote.acceptedAt && <div className="flex justify-between"><span className="text-muted-foreground">{t("quotes.accepted_at_label")}</span><span>{formatDate(quote.acceptedAt)}</span></div>}
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
    </div>
  );
}
