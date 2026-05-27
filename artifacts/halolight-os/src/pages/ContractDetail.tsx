import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetContract, useUpdateContractStatus, useDeleteContract, useUpdateContract, useGetCurrentUser, useCreateInvoice } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, Building2, Mail, Edit2, FileSignature, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-info/10 text-info border-info/30",
  signed: "bg-success/8 text-success border-success/20",
  active: "bg-success/10 text-success border-green-200",
  expired: "bg-warning/8 text-warning border-warning/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const STATUS_KEYS = ["draft", "sent", "signed", "active", "expired", "cancelled"];

function formatDate(d: string | null | undefined, locale = "en") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

function PrintButton({ contractNumber, title, clientName, content, value, lang }: {
  contractNumber: string; title: string; clientName: string; content: string; value: string; lang: string;
}) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrency();
  const { data: me } = useGetCurrentUser();
  const handlePrint = () => {
    const today = new Date().toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
    const html = `<!DOCTYPE html><html><head><title>${contractNumber}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#111;font-size:14px;line-height:1.7}
      h1{font-size:22px;margin:0 0 4px}
      .brand{font-size:22px;font-weight:700;color:#DDB398;margin-bottom:24px}
      .header{border-bottom:2px solid #eee;padding-bottom:24px;margin-bottom:24px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;padding:16px;background:#f9f9f9;border-radius:8px;font-size:13px}
      .meta-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#999;margin-bottom:2px}
      .content{white-space:pre-wrap;font-size:13px;line-height:1.8;background:#fafafa;padding:24px;border-radius:8px;border:1px solid #eee}
      @media print{body{margin:20px}}
    </style></head><body>
    <div class="brand">HaloLight Hub</div>
    <div class="header">
      <h1>${title}</h1>
      <div style="color:#666;margin-top:4px">${contractNumber}</div>
    </div>
    <div class="meta">
      <div><div class="meta-label">${t("contracts.print_prepared_by")}</div><div style="font-weight:600">${me?.fullName ?? ""}</div>${me?.companyName ? `<div style="color:#666;margin-top:2px;font-size:12px">${me.companyName}</div>` : ""}${me?.email ? `<div style="color:#666;font-size:12px">${me.email}</div>` : ""}</div>
      <div><div class="meta-label">${t("contracts.client_section")}</div><div style="font-weight:600">${clientName}</div></div>
      <div><div class="meta-label">${t("contracts.contract_value")}</div><div style="font-weight:600">${formatCurrency(Number(value))}</div></div>
      <div><div class="meta-label">${t("contracts.print_date")}</div><div>${today}</div></div>
    </div>
    <div class="content">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  };
  return <Button variant="outline" onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" /> {t("quotes.print_btn")}</Button>;
}

export default function ContractDetail() {
  const [, params] = useRoute("/contracts/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ title: "", clientName: "", clientEmail: "", clientPhone: "", description: "", unitPrice: "", quantity: "1" });

  const { data: contract, isLoading } = useGetContract(id, {
    query: { queryKey: ["contract", id], enabled: !!id },
  });

  const statusMutation = useUpdateContractStatus({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contract", id] }); qc.invalidateQueries({ queryKey: ["contracts"] }); toast({ title: t("contracts.status_updated") }); },
    },
  });

  const updateMutation = useUpdateContract({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contract", id] }); setEditing(false); toast({ title: t("contracts.contract_updated") }); },
    },
  });

  const deleteMutation = useDeleteContract({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); navigate("/contracts"); toast({ title: t("contracts.contract_deleted") }); },
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

  const openCreateInvoice = () => {
    if (!contract) return;
    setInvoiceForm({
      title: `Invoice — ${contract.title}`,
      clientName: contract.clientName,
      clientEmail: contract.clientEmail ?? "",
      clientPhone: (contract as any).clientPhone ?? "",
      description: contract.title,
      unitPrice: contract.value,
      quantity: "1",
    });
    setShowCreateInvoice(true);
  };

  const submitCreateInvoice = () => {
    if (!contract || !invoiceForm.title || !invoiceForm.clientName) return;
    const qty = invoiceForm.quantity || "1";
    const price = invoiceForm.unitPrice || "0";
    const total = String(Number(qty) * Number(price));
    createInvoiceMutation.mutate({
      data: {
        contractId: id,
        quoteId: (contract as any).quoteId ?? undefined,
        leadId: (contract as any).leadId ?? undefined,
        title: invoiceForm.title,
        clientName: invoiceForm.clientName,
        clientEmail: invoiceForm.clientEmail || undefined,
        clientPhone: invoiceForm.clientPhone || undefined,
        clientCompany: (contract as any).clientCompany ?? undefined,
        eventType: (contract as any).eventType ?? undefined,
        items: [{ description: invoiceForm.description || "Service", quantity: qty, unitPrice: price, order: 1 }],
      },
    });
  };

  const startEdit = () => {
    if (!contract) return;
    setEditForm({ title: contract.title, clientName: contract.clientName, clientEmail: contract.clientEmail ?? "", value: contract.value, content: contract.content, notes: contract.notes ?? "" });
    setEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id,
      data: {
        title: editForm.title,
        clientName: editForm.clientName,
        clientEmail: editForm.clientEmail || undefined,
        value: editForm.value,
        content: editForm.content,
        notes: editForm.notes || undefined,
      },
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">{t("contracts.loading")}</div>;
  if (!contract) return <div className="p-8 text-muted-foreground">{t("contracts.not_found")}</div>;

  const color = STATUS_COLORS[contract.status];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/contracts"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-lg font-bold">{contract.contractNumber}</span>
              {color && <Badge variant="outline" className={cn("text-xs", color)}>{t(`contracts.status_${contract.status}`)}</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{contract.title}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrintButton contractNumber={contract.contractNumber} title={contract.title} clientName={contract.clientName} content={contract.content} value={contract.value} lang={lang} />
          <Button variant="outline" size="sm" onClick={openCreateInvoice} className="gap-1.5">
            <ReceiptText className="w-3.5 h-3.5" /> {t("pipeline.create_invoice")}
          </Button>
          <Button variant="outline" onClick={startEdit} className="gap-2"><Edit2 className="w-4 h-4" /> {t("common.edit")}</Button>
          <Select value={contract.status} onValueChange={(s) => statusMutation.mutate({ id, data: { status: s as any } })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`contracts.status_${k}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("contracts.client_section")}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{contract.clientName}</span></div>
            {contract.clientEmail && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><a href={`mailto:${contract.clientEmail}`} className="hover:text-primary">{contract.clientEmail}</a></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("contracts.dates_section")}</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("common.created")}</span><span>{formatDate(contract.createdAt, lang)}</span></div>
            {contract.sentAt && <div className="flex justify-between"><span className="text-muted-foreground">{t("contracts.sent_label")}</span><span>{formatDate(contract.sentAt, lang)}</span></div>}
            {contract.signedAt && <div className="flex justify-between"><span className="text-muted-foreground">{t("contracts.signed_label2")}</span><span className="text-success font-medium">{formatDate(contract.signedAt, lang)}</span></div>}
            {contract.startDate && <div className="flex justify-between"><span className="text-muted-foreground">{t("contracts.start_label")}</span><span>{formatDate(contract.startDate, lang)}</span></div>}
            {contract.endDate && <div className="flex justify-between"><span className="text-muted-foreground">{t("contracts.end_label")}</span><span>{formatDate(contract.endDate, lang)}</span></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("contracts.value_section")}</h3>
          <p className="text-2xl font-bold text-success">{formatCurrency(contract.value)}</p>
          {contract.notes && <p className="text-xs text-muted-foreground">{contract.notes}</p>}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">{t("contracts.document_section")}</h3>
        </div>
        <div className="p-6">
          <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{contract.content}</pre>
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("contracts.edit_contract")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>{t("contracts.title_label")}</Label><Input value={editForm.title ?? ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("contracts.client_name_label")}</Label><Input value={editForm.clientName ?? ""} onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("contracts.client_email_label")}</Label><Input value={editForm.clientEmail ?? ""} onChange={(e) => setEditForm({ ...editForm, clientEmail: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("contracts.value_dollar_label")}</Label><Input type="number" value={editForm.value ?? ""} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>{t("contracts.content_label")}</Label><Textarea value={editForm.content ?? ""} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} rows={12} className="font-mono text-xs" /></div>
            <div className="space-y-1.5"><Label>{t("contracts.notes_label")}</Label><Textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>{updateMutation.isPending ? t("contracts.saving") : t("contracts.save_changes")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("pipeline.create_invoice_from_contract")}</DialogTitle></DialogHeader>
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
