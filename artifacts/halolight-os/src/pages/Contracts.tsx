import { useState } from "react";
import { Link } from "wouter";
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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  sent: { label: "Sent", color: "bg-blue-50 text-blue-700 border-blue-200" },
  signed: { label: "Signed", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  active: { label: "Active", color: "bg-green-50 text-green-700 border-green-200" },
  expired: { label: "Expired", color: "bg-amber-50 text-amber-700 border-amber-200" },
  cancelled: { label: "Cancelled", color: "bg-red-50 text-red-700 border-red-200" },
};

function formatCurrency(val: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Number(val));
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function Contracts() {
  const { toast } = useToast();
  const qc = useQueryClient();
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
        toast({ title: "Contract created" });
      },
    },
  });

  const deleteMutation = useDeleteContract({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast({ title: "Contract deleted" }); },
    },
  });

  const contracts = data?.items ?? [];
  const templates = templatesData?.items ?? [];

  const handleTemplateSelect = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contracts</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage service agreements and contracts</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> New Contract</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: String(contracts.length) },
          { label: "Signed", value: String(contracts.filter((c) => c.status === "signed" || c.status === "active").length) },
          { label: "Pending", value: String(contracts.filter((c) => c.status === "sent").length) },
          { label: "Contract Value", value: formatCurrency(contracts.reduce((s, c) => s + Number(c.value), 0)) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
            <p className="text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{contracts.length} contract{contracts.length !== 1 ? "s" : ""}</span>
      </div>

      {/* List */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">Loading…</div>
        ) : contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FileSignature className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="font-medium text-muted-foreground">No contracts found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contract #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Signed</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contracts.map((c) => {
                const cfg = STATUS_CONFIG[c.status];
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
                      {cfg && <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{formatDate(c.signedAt)}</td>
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
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {templates.length > 0 && (
              <div className="space-y-1.5">
                <Label>Start from Template</Label>
                <Select value={form.templateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger><SelectValue placeholder="Choose a template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>Contract Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Wedding Package Agreement" /></div>
              <div className="space-y-1.5"><Label>Client Name *</Label><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Client Email</Label><Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Contract Value ($)</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={10} placeholder="Contract terms and conditions…" className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !form.title || !form.clientName}>{createMutation.isPending ? "Creating…" : "Create Contract"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
