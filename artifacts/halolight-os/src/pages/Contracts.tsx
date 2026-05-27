import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListContracts, useCreateContract, useDeleteContract, useListContractTemplates } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileSignature, Trash2, ChevronRight } from "lucide-react";
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
  return new Date(d).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export default function Contracts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", clientName: "", clientEmail: "", value: "", templateId: "", content: "", notes: "" });

  const { data, isLoading } = useListContracts(
    { status: filterStatus !== "all" ? (filterStatus as any) : undefined },
    { query: { queryKey: ["contracts", filterStatus] } }
  );
  const { data: templatesData } = useListContractTemplates({ query: { queryKey: ["contract-templates"] } });

  const createMutation = useCreateContract({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["contracts"] });
        setShowCreate(false);
        setForm({ title: "", clientName: "", clientEmail: "", value: "", templateId: "", content: "", notes: "" });
        toast({ title: t("contracts.contract_created") });
      },
    },
  });

  const deleteMutation = useDeleteContract({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast({ title: t("contracts.contract_deleted") }); },
    },
  });

  const contracts = data?.items ?? [];
  const templates = templatesData?.items ?? [];

  const handleTemplateSelect = (id: string) => {
    const tpl = templates.find((tmpl) => tmpl.id === id);
    setForm({ ...form, templateId: id, content: tpl?.content ?? "" });
  };

  const handleCreate = () => {
    if (!form.title || !form.clientName) return;
    createMutation.mutate({
      data: {
        title: form.title,
        clientName: form.clientName,
        clientEmail: form.clientEmail || undefined,
        value: form.value || "0",
        templateId: form.templateId || undefined,
        content: form.content,
        notes: form.notes || undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("contracts.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("contracts.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> {t("contracts.new_contract")}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("contracts.total_label"), value: String(contracts.length) },
          { label: t("contracts.signed_label"), value: String(contracts.filter((c) => c.status === "signed" || c.status === "active").length) },
          { label: t("contracts.pending_label"), value: String(contracts.filter((c) => c.status === "sent").length) },
          { label: t("contracts.contract_value"), value: formatCurrency(contracts.reduce((s, c) => s + Number(c.value), 0)) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
            <p className="text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("contracts.all_statuses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("contracts.all_statuses")}</SelectItem>
            {STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`contracts.status_${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{t("contracts.count", { count: contracts.length })}</span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">{t("contracts.loading")}</div>
        ) : contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FileSignature className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">{t("contracts.no_contracts")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("contracts.col_contract_num")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("contracts.col_client")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t("common.status")}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t("contracts.col_signed")}</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("contracts.value_section")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contracts.map((c) => {
                const color = STATUS_COLORS[c.status];
                return (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors group">
                    <td className="px-4 py-3">
                      <Link href={`/contracts/${c.id}`}>
                        <span className="font-mono text-sm font-medium hover:text-primary cursor-pointer">{c.contractNumber}</span>
                      </Link>
                      <p className="text-xs text-muted-foreground truncate max-w-[160px]">{c.title}</p>
                    </td>
                    <td className="px-4 py-3 font-medium">{c.clientName}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {color && <Badge variant="outline" className={cn("text-xs", color)}>{t(`contracts.status_${c.status}`)}</Badge>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{formatDate(c.signedAt, lang)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.value)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/contracts/${c.id}`}><Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="w-4 h-4" /></Button></Link>
                        <button onClick={() => deleteMutation.mutate({ id: c.id })} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
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
          <DialogHeader><DialogTitle>{t("contracts.new_contract")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {templates.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("contracts.template_label")}</Label>
                <Select value={form.templateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger><SelectValue placeholder={t("contracts.template_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    {templates.map((tmpl) => <SelectItem key={tmpl.id} value={tmpl.id}>{tmpl.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>{t("contracts.title_label")} *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("contracts.title_placeholder")} /></div>
              <div className="space-y-1.5"><Label>{t("contracts.client_name_label")} *</Label><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("contracts.client_email_label")}</Label><Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("contracts.value_dollar_label")}</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("contracts.content_label")}</Label>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={10} placeholder={t("contracts.content_placeholder")} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5"><Label>{t("contracts.notes_label")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.title || !form.clientName}>{createMutation.isPending ? t("contracts.creating") : t("contracts.create_contract_btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
