import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useGetInvoice, useUpdateInvoiceStatus, useDeleteInvoice } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, Building2, Mail, CalendarDays, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  sent: { label: "Sent", color: "bg-info/10 text-info border-info/30", icon: Clock },
  paid: { label: "Paid", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  overdue: { label: "Overdue", color: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertCircle },
  cancelled: { label: "Cancelled", color: "bg-slate-50 text-slate-500 border-slate-200", icon: Clock },
};

function formatCurrency(val: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function PrintButton({ invoice, items }: { invoice: any; items: any[] }) {
  const handlePrint = () => {
    const html = `<!DOCTYPE html><html><head><title>${invoice.invoiceNumber}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#111;font-size:14px}
      h1{font-size:24px;margin:0}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
      .brand{font-size:22px;font-weight:700;color:#7c3aed}
      .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-top:8px;background:${invoice.status === "paid" ? "#d1fae5" : "#dbeafe"};color:${invoice.status === "paid" ? "#065f46" : "#1e40af"}}
      .section{margin-bottom:24px}
      .label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#999;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      th{background:#f5f5f5;text-align:left;padding:8px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#666}
      td{padding:10px 12px;border-bottom:1px solid #f0f0f0}
      .totals{margin-left:auto;width:280px}
      .totals td:first-child{color:#666}
      .totals td:last-child{text-align:right;font-weight:600}
      .grand td{font-size:18px;font-weight:700;border-top:2px solid #111!important}
      ${invoice.status === "paid" ? ".paid-stamp{background:#d1fae5;border:2px solid #6ee7b7;border-radius:8px;padding:12px;text-align:center;color:#065f46;font-weight:700;font-size:16px;margin-bottom:24px}" : ""}
      @media print{body{margin:20px}}
    </style></head><body>
    <div class="header">
      <div><div class="brand">HaloLight OS</div><h1 style="margin-top:12px">INVOICE</h1><div style="color:#666;font-size:16px;margin-top:4px">${invoice.invoiceNumber}</div><span class="badge">${invoice.status.toUpperCase()}</span></div>
      <div style="text-align:right;font-size:12px;color:#666">
        <div style="font-size:11px;color:#999">INVOICE DATE</div><div>${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</div>
        ${invoice.dueDate ? `<div style="margin-top:8px;font-size:11px;color:#999">DUE DATE</div><div>${new Date(invoice.dueDate).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</div>` : ""}
      </div>
    </div>
    ${invoice.status === "paid" ? `<div class="paid-stamp">✓ PAID — ${invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : ""}${invoice.paymentMethod ? " via " + invoice.paymentMethod : ""}${invoice.paymentReference ? " — Ref: " + invoice.paymentReference : ""}</div>` : ""}
    <div class="section"><div class="label">Bill To</div><div style="font-size:16px;font-weight:600">${invoice.clientName}</div>${invoice.clientEmail ? `<div style="color:#666">${invoice.clientEmail}</div>` : ""}</div>
    <table>
      <thead><tr><th style="width:50%">Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${items.map((item: any) => `<tr><td>${item.description}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${formatCurrency(item.unitPrice)}</td><td style="text-align:right">${formatCurrency(item.total)}</td></tr>`).join("")}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td>${formatCurrency(invoice.subtotal)}</td></tr>
      <tr><td>Tax (${invoice.taxRate}%)</td><td>${formatCurrency(invoice.taxAmount)}</td></tr>
      <tr class="grand"><td>Total</td><td>${formatCurrency(invoice.total)}</td></tr>
    </table>
    ${invoice.notes ? `<div class="section"><div class="label">Notes</div><div style="font-size:13px;color:#666;white-space:pre-wrap">${invoice.notes}</div></div>` : ""}
    ${invoice.terms ? `<div class="section"><div class="label">Terms</div><div style="font-size:13px;color:#666;white-space:pre-wrap">${invoice.terms}</div></div>` : ""}
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  };
  return <Button variant="outline" onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" /> Print / PDF</Button>;
}

export default function InvoiceDetail() {
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ paidAmount: "", paymentMethod: "Bank Transfer", paymentReference: "" });

  const { data: invoice, isLoading } = useGetInvoice(id, {
    query: { queryKey: ["invoice", id], enabled: !!id },
  });

  const statusMutation = useUpdateInvoiceStatus({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["invoice", id] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
        setShowMarkPaid(false);
        toast({ title: "Invoice updated" });
      },
    },
  });

  const deleteMutation = useDeleteInvoice({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); navigate("/invoices"); toast({ title: "Invoice deleted" }); },
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">Loading…</div>;
  if (!invoice) return <div className="p-8 text-muted-foreground">Invoice not found.</div>;

  const cfg = STATUS_CONFIG[invoice.status];
  const StatusIcon = cfg?.icon ?? Clock;
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
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/invoices"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-lg font-bold">{invoice.invoiceNumber}</span>
              {cfg && (
                <Badge variant="outline" className={cn("text-xs gap-1", cfg.color)}>
                  <StatusIcon className="w-3 h-3" /> {cfg.label}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{invoice.title}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrintButton invoice={invoice} items={items} />
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <Button onClick={() => { setPaymentForm({ paidAmount: invoice.total, paymentMethod: "Bank Transfer", paymentReference: "" }); setShowMarkPaid(true); }} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Mark as Paid
            </Button>
          )}
          <Select value={invoice.status} onValueChange={(s) => { if (s !== "paid") statusMutation.mutate({ id, data: { status: s as any } }); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Paid Banner */}
      {invoice.status === "paid" && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-emerald-700">Payment Received — </span>
            <span className="text-emerald-600">{formatCurrency(invoice.paidAmount ?? invoice.total)} on {formatDate(invoice.paidAt)}</span>
            {invoice.paymentMethod && <span className="text-emerald-600"> via {invoice.paymentMethod}</span>}
            {invoice.paymentReference && <span className="text-emerald-600"> · Ref: {invoice.paymentReference}</span>}
          </div>
        </div>
      )}

      {/* Overdue Banner */}
      {invoice.status === "overdue" && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">This invoice is overdue. Due date was {formatDate(invoice.dueDate)}.</p>
        </div>
      )}

      {/* Meta Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Bill To</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{invoice.clientName}</span></div>
            {invoice.clientEmail && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><a href={`mailto:${invoice.clientEmail}`} className="hover:text-primary">{invoice.clientEmail}</a></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Dates</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDate(invoice.createdAt)}</span></div>
            {invoice.dueDate && <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span className={cn(invoice.status === "overdue" ? "text-destructive font-medium" : "")}>{formatDate(invoice.dueDate)}</span></div>}
            {invoice.sentAt && <div className="flex justify-between"><span className="text-muted-foreground">Sent</span><span>{formatDate(invoice.sentAt)}</span></div>}
            {invoice.paidAt && <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-emerald-600 font-medium">{formatDate(invoice.paidAt)}</span></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Amount Due</h3>
          <p className={cn("text-2xl font-bold", invoice.status === "paid" ? "text-emerald-600" : invoice.status === "overdue" ? "text-destructive" : "")}>{formatCurrency(invoice.total)}</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span>Tax ({invoice.taxRate}%)</span><span>{formatCurrency(invoice.taxAmount)}</span></div>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/30"><h3 className="font-semibold">Line Items</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/20 border-b">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-muted-foreground">Description</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Unit Price</th>
              <th className="text-right px-5 py-3 font-medium text-muted-foreground">Total</th>
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
            <tr><td colSpan={3} className="px-5 py-3 text-right text-muted-foreground">Subtotal</td><td className="px-5 py-3 text-right font-medium">{formatCurrency(invoice.subtotal)}</td></tr>
            <tr><td colSpan={3} className="px-5 py-2 text-right text-muted-foreground">Tax ({invoice.taxRate}%)</td><td className="px-5 py-2 text-right">{formatCurrency(invoice.taxAmount)}</td></tr>
            <tr className="border-t"><td colSpan={3} className="px-5 py-3 text-right font-bold text-base">Total</td><td className="px-5 py-3 text-right font-bold text-lg">{formatCurrency(invoice.total)}</td></tr>
          </tfoot>
        </table>
      </div>

      {/* Notes & Terms */}
      {(invoice.notes || invoice.terms) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {invoice.notes && <div className="rounded-xl border bg-card p-5"><h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">Notes</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p></div>}
          {invoice.terms && <div className="rounded-xl border bg-card p-5"><h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">Payment Terms</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.terms}</p></div>}
        </div>
      )}

      {/* Mark Paid Dialog */}
      <Dialog open={showMarkPaid} onOpenChange={setShowMarkPaid}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Amount Paid</Label><Input type="number" value={paymentForm.paidAmount} onChange={(e) => setPaymentForm({ ...paymentForm, paidAmount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Payment Method</Label>
              <Select value={paymentForm.paymentMethod} onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Bank Transfer", "Credit Card", "Cash", "Check", "PayPal", "Stripe", "Other"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Reference / Transaction ID</Label><Input value={paymentForm.paymentReference} onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })} placeholder="TXN-123456" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaid(false)}>Cancel</Button>
            <Button onClick={handleMarkPaid} disabled={statusMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">{statusMutation.isPending ? "Saving…" : "Confirm Payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
