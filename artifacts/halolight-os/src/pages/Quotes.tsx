import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListQuotes, useCreateQuote, useDeleteQuote } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Trash2, ChevronRight, X } from "lucide-react";
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

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type LineItem = { description: string; quantity: string; unitPrice: string };

export default function Quotes() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", clientName: "", clientEmail: "", taxRate: "10", notes: "", terms: "" });
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: "1", unitPrice: "" }]);

  const { data, isLoading } = useListQuotes(
    { status: filterStatus !== "all" ? (filterStatus as any) : undefined },
    { query: { queryKey: ["quotes", filterStatus] } }
  );

  const createMutation = useCreateQuote({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["quotes"] });
        setShowCreate(false);
        setForm({ title: "", clientName: "", clientEmail: "", taxRate: "10", notes: "", terms: "" });
        setItems([{ description: "", quantity: "1", unitPrice: "" }]);
        toast({ title: t("quotes.quote_created") });
      },
    },
  });

  const deleteMutation = useDeleteQuote({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["quotes"] }); toast({ title: t("quotes.quote_deleted") }); },
    },
  });

  const quotes = data?.items ?? [];
  const totalRevenue = quotes.filter((q) => q.status === "accepted").reduce((s, q) => s + Number(q.total), 0);

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
          <h1 className="text-2xl font-bold tracking-tight">{t("quotes.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("quotes.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> {t("quotes.new_quote")}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("quotes.total_quotes"), value: String(quotes.length) },
          { label: t("quotes.accepted"), value: String(quotes.filter((q) => q.status === "accepted").length) },
          { label: t("quotes.pending"), value: String(quotes.filter((q) => q.status === "sent").length) },
          { label: t("quotes.won_revenue"), value: formatCurrency(totalRevenue) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
            <p className="text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("quotes.all_statuses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("quotes.all_statuses")}</SelectItem>
            {STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`quotes.status_${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{t("quotes.count", { count: quotes.length })}</span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">{t("quotes.loading")}</div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">{t("quotes.no_quotes")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("quotes.col_quote_num")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("quotes.col_client")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t("common.status")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t("quotes.valid_until_label")}</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("quotes.total_col")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotes.map((q) => {
                const color = STATUS_COLORS[q.status];
                return (
                  <tr key={q.id} className="hover:bg-muted/20 transition-colors group">
                    <td className="px-4 py-3">
                      <Link href={`/quotes/${q.id}`}>
                        <span className="font-mono text-sm font-medium hover:text-primary cursor-pointer">{q.quoteNumber}</span>
                      </Link>
                      <p className="text-xs text-muted-foreground truncate max-w-[160px]">{q.title}</p>
                    </td>
                    <td className="px-4 py-3 font-medium">{q.clientName}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {color && <Badge variant="outline" className={cn("text-xs", color)}>{t(`quotes.status_${q.status}`)}</Badge>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{formatDate(q.validUntil)}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatCurrency(q.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/quotes/${q.id}`}><Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="w-4 h-4" /></Button></Link>
                        <button onClick={() => deleteMutation.mutate({ id: q.id })} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("quotes.new_quote")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>{t("quotes.title_label")} *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("quotes.title_placeholder")} /></div>
              <div className="space-y-1.5"><Label>{t("quotes.client_name_label")} *</Label><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("quotes.client_email_label")}</Label><Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><Label>{t("quotes.line_items_section")}</Label><Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="w-3 h-3" /> {t("quotes.add_item")}</Button></div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-6"><Input placeholder={t("quotes.description_col")} value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} /></div>
                    <div className="col-span-2"><Input placeholder={t("quotes.qty_col")} type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} /></div>
                    <div className="col-span-3"><Input placeholder={t("quotes.unit_price_col")} type="number" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} /></div>
                    <div className="col-span-1 pt-1"><button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>{t("quotes.tax_rate_label")}</Label><Input type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></div>
              <div className="flex items-end pb-1">
                <div className="text-right w-full">
                  <p className="text-xs text-muted-foreground">{t("quotes.subtotal")}: {formatCurrency(calcSubtotal())}</p>
                  <p className="text-base font-bold">{t("quotes.total_col")}: {formatCurrency(calcTotal())}</p>
                </div>
              </div>
            </div>
            <div className="space-y-1.5"><Label>{t("quotes.notes_section")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="space-y-1.5"><Label>{t("quotes.terms_section")}</Label><Textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} rows={2} placeholder={t("quotes.terms_placeholder")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.title || !form.clientName}>{createMutation.isPending ? t("quotes.creating") : t("quotes.create_quote_btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
