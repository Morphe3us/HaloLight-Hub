import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useListLeads, useCreateLead, useDeleteLead, useUpdateLead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, LayoutGrid, List, Building2, Phone, Mail, ChevronRight, Trash2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const PIPELINE_STAGES = [
  { key: "new", label: "New", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "contacted", label: "Contacted", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "qualified", label: "Qualified", color: "bg-violet-50 text-violet-700 border-violet-200" },
  { key: "proposal", label: "Proposal", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "negotiation", label: "Negotiation", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "won", label: "Won", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "lost", label: "Lost", color: "bg-red-50 text-red-700 border-red-200" },
] as const;

const STATUS_DOT: Record<string, string> = {
  new: "bg-slate-400",
  contacted: "bg-blue-500",
  qualified: "bg-violet-500",
  proposal: "bg-amber-500",
  negotiation: "bg-orange-500",
  won: "bg-emerald-500",
  lost: "bg-red-400",
};

const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  referral: "Referral",
  social_media: "Social Media",
  trade_show: "Trade Show",
  cold_outreach: "Cold Outreach",
  inbound_call: "Inbound Call",
  other: "Other",
};

function formatCurrency(val: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Number(val));
}

type ViewMode = "pipeline" | "list";

export default function Leads() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>("pipeline");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
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
        setForm({ companyName: "", contactName: "", email: "", phone: "", source: "other", status: "new", value: "", notes: "", eventType: "" });
        toast({ title: "Lead created" });
      },
    },
  });

  const deleteMutation = useDeleteLead({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); toast({ title: "Lead deleted" }); },
    },
  });

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
        {stage.label}
      </Badge>
    ) : null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your sales pipeline and track opportunities</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> New Lead
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: String(leads.length), sub: "in pipeline" },
          { label: "Pipeline Value", value: formatCurrency(totalValue), sub: "total opportunity" },
          { label: "Won", value: String(wonLeads.length), sub: "deals closed" },
          { label: "Won Value", value: formatCurrency(wonValue), sub: "revenue earned" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
            <p className="text-xl font-bold mt-1">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search leads..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PIPELINE_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
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
        <div className="flex items-center justify-center h-40 text-muted-foreground">Loading leads…</div>
      ) : view === "pipeline" ? (
        /* Pipeline View */
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = byStage(stage.key);
              const stageValue = stageLeads.reduce((sum, l) => sum + Number(l.value ?? 0), 0);
              return (
                <div key={stage.key} className="w-[240px] shrink-0">
                  <div className={cn("rounded-t-lg border px-3 py-2 flex items-center justify-between", stage.color)}>
                    <span className="font-semibold text-sm">{stage.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium opacity-70">{formatCurrency(stageValue)}</span>
                      <span className="bg-white/60 text-xs font-bold px-1.5 py-0.5 rounded-full">{stageLeads.length}</span>
                    </div>
                  </div>
                  <div className="border border-t-0 rounded-b-lg bg-muted/30 min-h-[120px] p-2 space-y-2">
                    {stageLeads.map((lead) => (
                      <Link key={lead.id} href={`/crm/leads/${lead.id}`}>
                        <div className="bg-white rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30 group">
                          <p className="font-semibold text-sm truncate">{lead.companyName}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{lead.contactName}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs font-medium text-emerald-600">{formatCurrency(lead.value)}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {lead.eventType && <p className="text-xs text-muted-foreground mt-1 truncate">{lead.eventType}</p>}
                        </div>
                      </Link>
                    ))}
                    {stageLeads.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No leads</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="rounded-xl border bg-card overflow-hidden">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-medium text-muted-foreground">No leads found</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Add your first lead to start building your pipeline</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
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
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{SOURCE_LABELS[lead.source] ?? lead.source}</td>
                    <td className="px-4 py-3">{getStatusBadge(lead.status)}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(lead.value)}</td>
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
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Lead</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Company Name *</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Acme Corp" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Contact Name *</Label>
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Jane Smith" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Event Type</Label>
              <Input value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} placeholder="Wedding, Corporate…" />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Value ($)</Label>
              <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.companyName || !form.contactName}>
              {createMutation.isPending ? "Creating…" : "Create Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
