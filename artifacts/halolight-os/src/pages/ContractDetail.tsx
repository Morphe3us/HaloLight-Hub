import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useGetContract, useUpdateContractStatus, useDeleteContract, useUpdateContract } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, Building2, Mail, CalendarDays, Edit2, FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  sent: { label: "Sent", color: "bg-info/10 text-info border-info/30" },
  signed: { label: "Signed", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  active: { label: "Active", color: "bg-success/10 text-success border-green-200" },
  expired: { label: "Expired", color: "bg-amber-50 text-amber-700 border-amber-200" },
  cancelled: { label: "Cancelled", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

function formatCurrency(val: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Number(val));
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function PrintButton({ contractNumber, title, clientName, content, value }: {
  contractNumber: string; title: string; clientName: string; content: string; value: string;
}) {
  const handlePrint = () => {
    const html = `<!DOCTYPE html><html><head><title>${contractNumber}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#111;font-size:14px;line-height:1.7}
      h1{font-size:22px;margin:0 0 4px}
      .brand{font-size:22px;font-weight:700;color:#7c3aed;margin-bottom:24px}
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
      <div><div class="meta-label">Client</div><div style="font-weight:600">${clientName}</div></div>
      <div><div class="meta-label">Contract Value</div><div style="font-weight:600">${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0}).format(Number(value))}</div></div>
      <div><div class="meta-label">Date</div><div>${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</div></div>
    </div>
    <div class="content">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  };
  return <Button variant="outline" onClick={handlePrint} className="gap-2"><Printer className="w-4 h-4" /> Print / PDF</Button>;
}

export default function ContractDetail() {
  const [, params] = useRoute("/contracts/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const { data: contract, isLoading } = useGetContract(id, {
    query: { queryKey: ["contract", id], enabled: !!id },
  });

  const statusMutation = useUpdateContractStatus({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contract", id] }); qc.invalidateQueries({ queryKey: ["contracts"] }); toast({ title: "Status updated" }); },
    },
  });

  const updateMutation = useUpdateContract({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contract", id] }); setEditing(false); toast({ title: "Contract updated" }); },
    },
  });

  const deleteMutation = useDeleteContract({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); navigate("/contracts"); toast({ title: "Contract deleted" }); },
    },
  });

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

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">Loading…</div>;
  if (!contract) return <div className="p-8 text-muted-foreground">Contract not found.</div>;

  const cfg = STATUS_CONFIG[contract.status];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/contracts"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-lg font-bold">{contract.contractNumber}</span>
              {cfg && <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{contract.title}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrintButton contractNumber={contract.contractNumber} title={contract.title} clientName={contract.clientName} content={contract.content} value={contract.value} />
          <Button variant="outline" onClick={startEdit} className="gap-2"><Edit2 className="w-4 h-4" /> Edit</Button>
          <Select value={contract.status} onValueChange={(s) => statusMutation.mutate({ id, data: { status: s as any } })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Meta Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Client</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{contract.clientName}</span></div>
            {contract.clientEmail && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><a href={`mailto:${contract.clientEmail}`} className="hover:text-primary">{contract.clientEmail}</a></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Dates</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDate(contract.createdAt)}</span></div>
            {contract.sentAt && <div className="flex justify-between"><span className="text-muted-foreground">Sent</span><span>{formatDate(contract.sentAt)}</span></div>}
            {contract.signedAt && <div className="flex justify-between"><span className="text-muted-foreground">Signed</span><span className="text-emerald-600 font-medium">{formatDate(contract.signedAt)}</span></div>}
            {contract.startDate && <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span>{formatDate(contract.startDate)}</span></div>}
            {contract.endDate && <div className="flex justify-between"><span className="text-muted-foreground">End</span><span>{formatDate(contract.endDate)}</span></div>}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Value</h3>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(contract.value)}</p>
          {contract.notes && <p className="text-xs text-muted-foreground">{contract.notes}</p>}
        </div>
      </div>

      {/* Contract Content */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/30 flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Contract Document</h3>
        </div>
        <div className="p-6">
          <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{contract.content}</pre>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Contract</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>Title</Label><Input value={editForm.title ?? ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Client Name</Label><Input value={editForm.clientName ?? ""} onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Client Email</Label><Input value={editForm.clientEmail ?? ""} onChange={(e) => setEditForm({ ...editForm, clientEmail: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Value ($)</Label><Input type="number" value={editForm.value ?? ""} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Content</Label><Textarea value={editForm.content ?? ""} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} rows={12} className="font-mono text-xs" /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving…" : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
