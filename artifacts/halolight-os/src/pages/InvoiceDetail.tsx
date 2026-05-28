import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetInvoice, useUpdateInvoiceStatus, useDeleteInvoice, useGetCurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, Building2, Mail, CheckCircle2, AlertCircle, Clock, Bell } from "lucide-react";
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
      .parties{display:flex;gap:48px;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e5e7eb}
      .section{margin-bottom:22px}
      table{width:100%;border-collapse:collapse;margin-bottom:22px}
      th{background:#f5f5f5;text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;font-weight:600}
      td{padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px}
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
        ${(me as any)?.email ? `<div style="font-size:11.5px;color:#555">${(me as any).email}</div>` : ""}
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
        <div class="party-name">${me?.fullName ?? ""}</div>
        ${(me as any)?.companyName ? `<div class="party-detail">${(me as any).companyName}</div>` : ""}
        ${(me as any)?.phone ? `<div class="party-detail">${(me as any).phone}</div>` : ""}
      </div>
      <div>
        <div class="label">${t("invoices.bill_to")}</div>
        <div class="party-name">${invoice.clientName}</div>
        ${invoice.clientEmail ? `<div class="party-detail">${invoice.clientEmail}</div>` : ""}
      </div>
    </div>
    <table>
      <thead><tr><th style="width:50%">${t("invoices.description_col")}</th><th style="text-align:right">${t("invoices.qty_col")}</th><th style="text-align:right">${t("invoices.unit_price_col")}</th><th style="text-align:right">${t("invoices.total_col")}</th></tr></thead>
      <tbody>${items.map((item: any) => `<tr><td>${item.description}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${formatCurrency(item.unitPrice)}</td><td style="text-align:right">${formatCurrency(item.total)}</td></tr>`).join("")}</tbody>
    </table>
    <table class="totals">
      <tr><td>${t("invoices.subtotal_label")}</td><td>${formatCurrency(invoice.subtotal)}</td></tr>
      <tr><td>${t("invoices.tax_label", { rate: invoice.taxRate })}</td><td>${formatCurrency(invoice.taxAmount)}</td></tr>
      <tr class="grand"><td>${t("invoices.total_col")}</td><td>${formatCurrency(invoice.total)}</td></tr>
    </table>
    ${invoice.notes ? `<div class="section"><div class="label">${t("invoices.notes_section")}</div><div style="font-size:13px;color:#666;white-space:pre-wrap">${invoice.notes}</div></div>` : ""}
    ${invoice.terms ? `<div class="section"><div class="label">${t("invoices.payment_terms_section")}</div><div style="font-size:13px;color:#666;white-space:pre-wrap">${invoice.terms}</div></div>` : ""}
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
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
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("invoices.amount_due")}</h3>
          <p className={cn("text-2xl font-bold", invoice.status === "paid" ? "text-success" : invoice.status === "overdue" ? "text-destructive" : "")}>{formatCurrency(invoice.total)}</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between"><span>{t("invoices.subtotal_label")}</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span>{t("invoices.tax_label", { rate: invoice.taxRate })}</span><span>{formatCurrency(invoice.taxAmount)}</span></div>
          </div>
        </div>
      </div>

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
            {items.map((item) => (
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

      {(invoice.notes || invoice.terms) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {invoice.notes && <div className="rounded-xl border bg-card p-5"><h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("invoices.notes_section")}</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p></div>}
          {invoice.terms && <div className="rounded-xl border bg-card p-5"><h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("invoices.payment_terms_section")}</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.terms}</p></div>}
        </div>
      )}

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
