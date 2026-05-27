import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListInvoices, useCreateInvoice, useDeleteInvoice, useUpdateInvoiceStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, ReceiptText, Trash2, ChevronRight, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-info/10 text-info border-info/30",
  paid: "bg-success/8 text-success border-success/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

const STATUS_KEYS = ["draft", "sent", "paid", "overdue", "cancelled"];

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function isOverdue(dueDate: string | null | undefined, status: string) {
  if (status === "paid" || status === "cancelled" || !dueDate) return false;
  return new Date(dueDate) < new Date();
}

type LineItem = { description: string; quantity: string; unitPrice: string };

export default function Invoices() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", clientName: "", clientEmail: "", taxRate: "10", notes: "", terms: "", dueDate: "" });
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: "1", unitPrice: "" }]);

  const { data, isLoading } = useListInvoices(
    { status: filterStatus !== "all" ? (filterStatus as any) : undefined },
    { query: { queryKey: ["invoices", filterStatus] } }
  );

  const createMutation = useCreateInvoice({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["invoices"] });
        setShowCreate(false);
        setForm({ title: "", clientName: "", clientEmail: "", taxRate: "10", notes: "", terms: "", dueDate: "" });
        setItems([{ description: "", quantity: "1", unitPrice: "" }]);
        toast({ title: t("invoices.invoice_created") });
      },
    },
  });

  const deleteMutation = useDeleteInvoice({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast({ title: t("invoices.invoice_deleted") }); },
    },
  });

  const markPaidMutation = useUpdateInvoiceStatus({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast({ title: t("invoices.invoice_marked_paid") }); },
    },
  });

  const invoices = data?.items ?? [];
  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total), 0);
  const pendingTotal = invoices.filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.total), 0);
  const overdueTotal = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + Number(i.total), 0);

  const addItem = () => setItems([...items, { description: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string) => {
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };
  const calcSubtotal = () => items.reduce((s, item) => s + (parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0")), 0);
  const calcTotal = () => { const sub = calcSubtotal(); return sub + sub * (parseFloat(form.taxRate || "0") / 100); };

  const handleCreate = () => {
    if (!form.title || !form.clientName) return;
    createMutation.mutate({
      data: {
        title: form.title,
        clientName: form.clientName,
        clientEmail: form.clientEmail || undefined,
        taxRate: form.taxRate,
        notes: form.notes || undefined,
        terms: form.terms || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        items: items.filter((i) => i.description && i.unitPrice).map((i) => ({
          description: i.description, quantity: i.quantity, unitPrice: i.unitPrice,
        })),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("invoices.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("invoices.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> {t("invoices.new_invoice")}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium">{t("invoices.total_invoices")}</p>
          <p className="text-xl font-bold mt-1">{invoices.length}</p>
        </div>
        <div className="rounded-xl border bg-success/8 border-success/20 p-4">
          <p className="text-xs text-success font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {t("invoices.status_paid")}</p>
          <p className="text-xl font-bold mt-1 text-success">{formatCurrency(paidTotal)}</p>
        </div>
        <div className="rounded-xl border bg-info/10 border-info/30 p-4">
          <p className="text-xs text-info font-medium">{t("invoices.pending")}</p>
          <p className="text-xl font-bold mt-1 text-info">{formatCurrency(pendingTotal)}</p>
        </div>
        <div className="rounded-xl border bg-destructive/10 border-destructive/30 p-4">
          <p className="text-xs text-destructive font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {t("invoices.status_overdue")}</p>
          <p className="text-xl font-bold mt-1 text-destructive">{formatCurrency(overdueTotal)}</p>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("invoices.all_statuses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("invoices.all_statuses")}</SelectItem>
            {STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`invoices.status_${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{t("invoices.count", { count: invoices.length })}</span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">{t("invoices.loading")}</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ReceiptText className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">{t("invoices.no_invoices")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("invoices.col_invoice_num")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("invoices.col_client")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t("common.status")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t("invoices.due_date_label")}</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("invoices.col_amount")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((inv) => {
                const overdue = isOverdue(inv.dueDate, inv.status);
                const effectiveStatus = overdue && inv.status === "sent" ? "overdue" : inv.status;
                const color = STATUS_COLORS[effectiveStatus] ?? STATUS_COLORS[inv.status];
                return (
                  <tr key={inv.id} className={cn("hover:bg-muted/20 transition-colors group", overdue && "bg-destructive/10/30")}>
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`}>
                        <span className="font-mono text-sm font-medium hover:text-primary cursor-pointer">{inv.invoiceNumber}</span>
                      </Link>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{inv.title}</p>
                    </td>
                    <td className="px-4 py-3 font-medium">{inv.clientName}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {color && <Badge variant="outline" className={cn("text-xs", color)}>{t(`invoices.status_${effectiveStatus}`)}</Badge>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs">
                      <span className={cn(overdue ? "text-destructive font-medium" : "text-muted-foreground")}>{formatDate(inv.dueDate)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("font-bold", inv.status === "paid" ? "text-success" : overdue ? "text-destructive" : "")}>{formatCurrency(inv.total)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {inv.status !== "paid" && inv.status !== "cancelled" && (
                          <button
                            onClick={() => markPaidMutation.mutate({ id: inv.id, data: { status: "paid", paidAmount: inv.total } })}
                            className="text-xs text-success hover:text-success/80 border border-success/30 rounded px-2 py-0.5 bg-success/8 hover:bg-success/15 transition-colors whitespace-nowrap"
                          >
                            {t("invoices.mark_paid")}
                          </button>
                        )}
                        <Link href={`/invoices/${inv.id}`}><Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="w-4 h-4" /></Button></Link>
                        <button onClick={() => deleteMutation.mutate({ id: inv.id })} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("invoices.new_invoice")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>{t("invoices.title_label")} *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("invoices.title_placeholder")} /></div>
              <div className="space-y-1.5"><Label>{t("invoices.client_name_label")} *</Label><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("invoices.client_email_label")}</Label><Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("invoices.due_date_label")}</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><Label>{t("invoices.line_items_section")}</Label><Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="w-3 h-3" /> {t("invoices.add_item")}</Button></div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                    <div className="sm:col-span-6"><Input placeholder={t("invoices.description_col")} value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} /></div>
                    <div className="sm:col-span-2"><Input placeholder={t("invoices.qty_col")} type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} /></div>
                    <div className="sm:col-span-3"><Input placeholder={t("invoices.unit_price_col")} type="number" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} /></div>
                    <div className="sm:col-span-1 flex items-center sm:pt-1"><button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>{t("invoices.tax_rate_label")}</Label><Input type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></div>
              <div className="flex items-end pb-1">
                <div className="text-right w-full">
                  <p className="text-xs text-muted-foreground">{t("invoices.subtotal_label")}: {formatCurrency(calcSubtotal())}</p>
                  <p className="text-base font-bold">{t("invoices.total_col")}: {formatCurrency(calcTotal())}</p>
                </div>
              </div>
            </div>
            <div className="space-y-1.5"><Label>{t("invoices.notes_section")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="space-y-1.5"><Label>{t("invoices.payment_terms_section")}</Label><Textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} rows={2} placeholder="Net 30, etc." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.title || !form.clientName}>{createMutation.isPending ? t("invoices.creating") : t("invoices.create_invoice_btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
