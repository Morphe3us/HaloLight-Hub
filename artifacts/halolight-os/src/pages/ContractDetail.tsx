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
  contractNumber: string; title: string; clientName: string; content: string | null | undefined; value: string; lang: string;
}) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrency();
  const { data: me } = useGetCurrentUser();
  const handlePrint = () => {
    const today = new Date().toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });
    const logoUrl = (me as any)?.logoUrl ?? "";
    const companyName = (me as any)?.companyName ?? (me as any)?.fullName ?? "";
    const rawEmail = (me as any)?.email ?? "";
    const providerEmail = (!rawEmail || rawEmail.includes("placeholder.com") || /^user_[a-f0-9]+@/.test(rawEmail)) ? "" : rawEmail;
    const providerPhone = (me as any)?.phone ?? "";
    const sep = lang === "fr" ? " :" : ":";

    const rawContent = content ?? "";

    // Convert text content to clean HTML: replace heavy separators with subtle dividers
    const escaped = rawContent.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const formattedBody = escaped
      .replace(/═{5,}/g, '<hr class="sep-major">')
      .replace(/─{5,}/g, '<hr class="sep-minor">')
      .replace(/\n/g, "<br>");

    const bodyHtml = formattedBody.trim()
      ? `<div class="body-wrap">${formattedBody}</div>`
      : `<div class="body-empty">${t("contracts.no_content_message", { defaultValue: "No contract body has been generated yet. Use the Edit button to add contract content, or generate a contract from a template." })}</div>`;

    const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${contractNumber}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:40px auto;color:#111;font-size:13.5px;line-height:1.65;padding:0 28px}
  .doc-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #111;margin-bottom:24px}
  .provider-block{}
  .provider-block img{max-height:54px;max-width:180px;object-fit:contain;display:block;margin-bottom:8px}
  .provider-name{font-size:17px;font-weight:700;line-height:1.2;margin-bottom:3px}
  .provider-sub{font-size:11.5px;color:#555;line-height:1.5}
  .doc-meta{text-align:right;flex-shrink:0;margin-left:24px}
  .doc-type{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#999;margin-bottom:5px}
  .doc-number{font-size:18px;font-weight:700;font-family:'Courier New',monospace;color:#111}
  .doc-date{font-size:11.5px;color:#666;margin-top:5px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:28px;background:#f7f7f7;border-radius:8px;padding:16px 20px;margin-bottom:20px;font-size:12.5px}
  .party-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#999;font-weight:600;margin-bottom:5px}
  .party-name{font-size:14px;font-weight:700;margin-bottom:2px}
  .party-detail{color:#555;line-height:1.55}
  .contract-value-bar{display:flex;justify-content:flex-end;margin-bottom:22px}
  .cv-inner{background:#111;color:#fff;border-radius:8px;padding:10px 18px;text-align:right;display:inline-block}
  .cv-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;opacity:.65;margin-bottom:3px}
  .cv-amount{font-size:20px;font-weight:700}
  .body-wrap{font-size:13px;line-height:1.8;color:#1a1a1a}
  .body-empty{font-size:13px;color:#888;font-style:italic;background:#fafafa;border:1px dashed #ddd;border-radius:8px;padding:24px 20px;text-align:center}
  .sep-major{border:none;border-top:1.5px solid #d1d5db;margin:18px 0}
  .sep-minor{border:none;border-top:1px solid #e9eaec;margin:10px 0}
  @media print{
    body{margin:0;padding:16px}
    @page{size:A4;margin:1.4cm 1.2cm}
    .doc-header{padding-bottom:14px;margin-bottom:18px}
  }
</style></head><body>
<div class="doc-header">
  <div class="provider-block">
    ${logoUrl ? `<img src="${logoUrl}" alt="${companyName.replace(/"/g, "&quot;")}">` : ""}
    ${companyName ? `<div class="provider-name">${companyName}</div>` : ""}
    <div class="provider-sub">${providerEmail}${providerPhone ? ` &middot; ${providerPhone}` : ""}</div>
  </div>
  <div class="doc-meta">
    <div class="doc-type">${t("contracts.print_contract_label", { defaultValue: "CONTRACT" })}</div>
    <div class="doc-number">${contractNumber}</div>
    <div class="doc-date">${today}</div>
  </div>
</div>
<div class="parties">
  <div>
    <div class="party-label">${t("contracts.print_prepared_by")}</div>
    <div class="party-name">${(me as any)?.fullName ?? ""}</div>
    ${companyName ? `<div class="party-detail">${companyName}</div>` : ""}
    ${providerEmail ? `<div class="party-detail">${providerEmail}</div>` : ""}
  </div>
  <div>
    <div class="party-label">${t("contracts.client_section")}</div>
    <div class="party-name">${clientName}</div>
    <div class="party-detail">${t("contracts.print_date")}${sep} ${today}</div>
  </div>
</div>
<div class="contract-value-bar">
  <div class="cv-inner">
    <div class="cv-label">${t("contracts.contract_value")}</div>
    <div class="cv-amount">${formatCurrency(Number(value))}</div>
  </div>
</div>
${bodyHtml}
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.document.title = contractNumber; w.focus(); w.print(); }
  };
  return <Button variant="outline" onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" /> {t("contracts.export_pdf_btn")}</Button>;
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
        eventDate: (contract as any).eventDate ?? undefined,
        eventLocation: (contract as any).eventLocation ?? undefined,
        packageName: (contract as any).packageName ?? undefined,
        rentalDuration: (contract as any).rentalDuration ?? undefined,
        includedPrints: (contract as any).includedPrints ?? undefined,
        rentalPrice: (contract as any).rentalPrice ?? undefined,
        optionsPrice: (contract as any).optionsPrice ?? undefined,
        deliveryFees: (contract as any).deliveryFees ?? undefined,
        discountAmount: (contract as any).discountAmount ?? undefined,
        equipmentIds: (contract as any).equipmentIds ?? undefined,
        equipmentDescription: (contract as any).equipmentDescription ?? undefined,
        items: [{ description: invoiceForm.description || "Service", quantity: qty, unitPrice: price, order: 1 }],
      },
    });
  };

  const startEdit = () => {
    if (!contract) return;
    setEditForm({ title: contract.title, clientName: contract.clientName, clientEmail: contract.clientEmail ?? "", value: contract.value, content: contract.content ?? "", notes: contract.notes ?? "" });
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
          <Link href="/contracts"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="w-4 h-4" />{t("common.back")}</Button></Link>
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
          {contract.content ? (
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{contract.content}</pre>
          ) : (
            <p className="text-sm text-muted-foreground italic text-center py-8">
              {t("contracts.no_content_message", { defaultValue: "No contract body yet. Use the Edit button to add content, or generate a contract from a template." })}
            </p>
          )}
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
