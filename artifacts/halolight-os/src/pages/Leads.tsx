import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { customFetch, useListLeads, useCreateLead, useDeleteLead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, LayoutGrid, List, ChevronRight, Trash2, TrendingUp, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import CustomerSearchCombobox from "@/components/CustomerSearchCombobox";

const PIPELINE_STAGES = [
  { key: "new", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "contacted", color: "bg-info/10 text-info border-info/30" },
  { key: "qualified", color: "bg-info/8 text-info border-info/20" },
  { key: "proposal", color: "bg-warning/8 text-warning border-warning/20" },
  { key: "negotiation", color: "bg-warning/8 text-warning border-warning/20" },
  { key: "won", color: "bg-success/8 text-success border-success/20" },
  { key: "lost", color: "bg-destructive/10 text-destructive border-destructive/30" },
] as const;

const STATUS_DOT: Record<string, string> = {
  new: "bg-slate-400",
  contacted: "bg-primary",
  qualified: "bg-info",
  proposal: "bg-warning",
  negotiation: "bg-warning",
  won: "bg-success",
  lost: "bg-destructive",
};

const SOURCE_KEYS = ["website", "referral", "social_media", "trade_show", "cold_outreach", "inbound_call", "other"];

type ViewMode = "pipeline" | "list";

export default function Leads() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { format: formatCurrency } = useCurrency();

  const [view, setView] = useState<ViewMode>("pipeline");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [form, setForm] = useState({
    companyName: "", contactName: "", email: "", phone: "",
    source: "other", status: "new", value: "", notes: "", eventType: "",
  });

  const { data, isLoading } = useListLeads(
    { search: search || undefined, status: filterStatus !== "all" ? (filterStatus as any) : undefined },
    { query: { queryKey: ["leads", search, filterStatus] } }
  );

  const createMutation = useCreateLead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["leads"] });
        setShowCreate(false);
        setCustomerSearch("");
        setForm({ companyName: "", contactName: "", email: "", phone: "", source: "other", status: "new", value: "", notes: "", eventType: "" });
        toast({ title: t("leads.lead_created") });
      },
    },
  });

  const deleteMutation = useDeleteLead({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast({ title: t("leads.lead_deleted") }); },
    },
  });

  const handleExportCsv = async () => {
    try {
      const blob = await customFetch<Blob>("/api/exports/csv/leads", { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("leads.export_csv"), description: "Export failed", variant: "destructive" });
    }
  };

  const leads = data?.items ?? [];
  const totalValue = leads.reduce((sum, l) => sum + Number(l.value ?? 0), 0);
  const wonLeads = leads.filter((l) => l.status === "won");
  const wonValue = wonLeads.reduce((sum, l) => sum + Number(l.value ?? 0), 0);

  const byStage = (stage: string) => leads.filter((l) => l.status === stage);

  const handleCreate = () => {
    if (!form.companyName || !form.contactName) return;
    createMutation.mutate({
      data: {
        companyName: form.companyName,
        contactName: form.contactName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        source: form.source as any,
        status: form.status as any,
        value: form.value || "0",
        notes: form.notes || undefined,
        eventType: form.eventType || undefined,
      },
    });
  };

  const getStatusBadge = (status: string) => {
    const stage = PIPELINE_STAGES.find((s) => s.key === status);
    return stage ? (
      <Badge variant="outline" className={cn("text-xs", stage.color)}>
        <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", STATUS_DOT[status])} />
        {t(`leads.stage_${status}`)}
      </Badge>
    ) : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("leads.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("leads.subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={handleExportCsv} className="gap-2">
            <Download className="w-4 h-4" /> {t("leads.export_csv")}
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" /> {t("leads.new_lead")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("leads.total_leads"), value: String(leads.length), sub: t("leads.in_pipeline") },
          { label: t("leads.pipeline_value"), value: formatCurrency(totalValue), sub: t("leads.total_opportunity") },
          { label: t("leads.won_label"), value: String(wonLeads.length), sub: t("leads.deals_closed") },
          { label: t("leads.won_value"), value: formatCurrency(wonValue), sub: t("leads.revenue_earned") },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
            <p className="text-xl font-bold mt-1">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("leads.search_placeholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("leads.all_statuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("leads.all_statuses")}</SelectItem>
            {PIPELINE_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{t(`leads.stage_${s.key}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border overflow-hidden">
          <button onClick={() => setView("pipeline")} className={cn("px-3 py-2 text-sm transition-colors", view === "pipeline" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setView("list")} className={cn("px-3 py-2 text-sm transition-colors", view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">{t("leads.loading_leads")}</div>
      ) : view === "pipeline" ? (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = byStage(stage.key);
              const stageValue = stageLeads.reduce((sum, l) => sum + Number(l.value ?? 0), 0);
              return (
                <div key={stage.key} className="w-[240px] shrink-0">
                  <div className={cn("rounded-t-lg border px-3 py-2 flex items-center justify-between", stage.color)}>
                    <span className="font-semibold text-sm">{t(`leads.stage_${stage.key}`)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium opacity-70">{formatCurrency(stageValue)}</span>
                      <span className="bg-card/60 text-xs font-bold px-1.5 py-0.5 rounded-full">{stageLeads.length}</span>
                    </div>
                  </div>
                  <div className="border border-t-0 rounded-b-lg bg-muted/30 min-h-[120px] p-2 space-y-2">
                    {stageLeads.map((lead) => (
                      <Link key={lead.id} href={`/crm/leads/${lead.id}`}>
                        <div className="bg-card rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30 group">
                          <p className="font-semibold text-sm truncate">{lead.companyName}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{lead.contactName}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs font-medium text-success">{formatCurrency(lead.value)}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {lead.eventType && <p className="text-xs text-muted-foreground mt-1 truncate">{lead.eventType}</p>}
                        </div>
                      </Link>
                    ))}
                    {stageLeads.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t("leads.no_leads_stage")}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground">{t("leads.no_leads_title")}</p>
              <p className="text-sm text-muted-foreground/60 mt-1">{t("leads.no_leads_desc")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("leads.col_company")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">{t("leads.col_contact")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">{t("leads.col_source")}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("common.status")}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t("leads.col_value")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/20 transition-colors group">
                    <td className="px-4 py-3">
                      <Link href={`/crm/leads/${lead.id}`}>
                        <div className="font-medium hover:text-primary cursor-pointer">{lead.companyName}</div>
                        {lead.eventType && <div className="text-xs text-muted-foreground">{lead.eventType}</div>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{lead.contactName}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{t(`leads.source_${lead.source}`, { defaultValue: lead.source })}</td>
                    <td className="px-4 py-3">{getStatusBadge(lead.status)}</td>
                    <td className="px-4 py-3 text-right font-medium text-success">{formatCurrency(lead.value)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteMutation.mutate({ id: lead.id })}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) { setCustomerSearch(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("leads.new_lead")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>{t("sales_search.search_label")}</Label>
              <CustomerSearchCombobox
                value={customerSearch}
                onChange={setCustomerSearch}
                onSelect={(s) => {
                  setForm((f) => ({
                    ...f,
                    companyName: s.company ?? s.name,
                    contactName: s.name,
                    email: s.email ?? f.email,
                    phone: s.phone ?? f.phone,
                    eventType: s.eventType ?? f.eventType,
                  }));
                }}
                onClear={() => setCustomerSearch("")}
                existingEmail={form.email}
              />
              <p className="text-xs text-muted-foreground">{t("sales_search.or_create_new")}</p>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("leads.company_label")} *</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder={t("leads.company_placeholder")} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("leads.contact_label")} *</Label>
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder={t("leads.contact_placeholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("leads.email_label")}</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("leads.phone_label")}</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("leads.source_label")}</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`leads.source_${k}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("leads.status_label")}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{t(`leads.stage_${s.key}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("leads.event_type_label")}</Label>
              <Input value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} placeholder={t("leads.event_type_placeholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("leads.value_label")}</Label>
              <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t("leads.notes_label")}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.companyName || !form.contactName}>
              {createMutation.isPending ? t("leads.creating") : t("leads.create_lead_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
