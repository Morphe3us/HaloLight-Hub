import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetLead,
  useUpdateLead,
  useDeleteLead,
  useCreateLeadActivity,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, Phone, Mail, CalendarDays, MessageSquare, PhoneCall, AtSign, Users, FileText, Send, ReceiptText, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PIPELINE_STAGES = [
  { key: "new", label: "New", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "contacted", label: "Contacted", color: "bg-info/10 text-info border-info/30" },
  { key: "qualified", label: "Qualified", color: "bg-violet-50 text-violet-700 border-violet-200" },
  { key: "proposal", label: "Proposal", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "negotiation", label: "Negotiation", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "won", label: "Won", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "lost", label: "Lost", color: "bg-destructive/10 text-destructive border-destructive/30" },
] as const;

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note: MessageSquare,
  call: PhoneCall,
  email: AtSign,
  meeting: Users,
  status_change: FileText,
  quote_sent: FileText,
  contract_sent: FileText,
  invoice_sent: ReceiptText,
};

const ACTIVITY_COLORS: Record<string, string> = {
  note: "bg-slate-100 text-slate-600",
  call: "bg-info/15 text-info",
  email: "bg-violet-100 text-violet-600",
  meeting: "bg-amber-100 text-amber-600",
  status_change: "bg-muted text-muted-foreground",
  quote_sent: "bg-emerald-100 text-emerald-600",
  contract_sent: "bg-info/15 text-info",
  invoice_sent: "bg-orange-100 text-orange-600",
};

function formatCurrency(val: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Number(val));
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function LeadDetail() {
  const [, params] = useRoute("/crm/leads/:id");
  const id = params?.id ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [activityForm, setActivityForm] = useState({ type: "note", title: "", description: "" });

  const { data: lead, isLoading } = useGetLead(id, {
    query: {
      queryKey: ["lead", id],
      enabled: !!id,
    },
  });

  const updateMutation = useUpdateLead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["lead", id] });
        qc.invalidateQueries({ queryKey: ["leads"] });
        setEditing(false);
        toast({ title: "Lead updated" });
      },
    },
  });

  const activityMutation = useCreateLeadActivity({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["lead", id] });
        setShowActivity(false);
        setActivityForm({ type: "note", title: "", description: "" });
        toast({ title: "Activity added" });
      },
    },
  });

  const startEdit = () => {
    if (!lead) return;
    setEditForm({
      companyName: lead.companyName,
      contactName: lead.contactName,
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      status: lead.status,
      value: lead.value,
      notes: lead.notes ?? "",
      eventType: lead.eventType ?? "",
    });
    setEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id,
      data: {
        companyName: editForm.companyName,
        contactName: editForm.contactName,
        email: editForm.email || undefined,
        phone: editForm.phone || undefined,
        status: editForm.status as any,
        value: editForm.value,
        notes: editForm.notes || undefined,
        eventType: editForm.eventType || undefined,
      },
    });
  };

  const addActivity = () => {
    if (!activityForm.title) return;
    activityMutation.mutate({
      id,
      data: {
        type: activityForm.type as any,
        title: activityForm.title,
        description: activityForm.description || undefined,
      },
    });
  };

  const getStage = (status: string) => PIPELINE_STAGES.find((s) => s.key === status);

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">Loading…</div>;
  if (!lead) return <div className="text-muted-foreground p-8">Lead not found.</div>;

  const stage = getStage(lead.status);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/crm/leads">
            <Button variant="ghost" size="icon" className="shrink-0"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold">{lead.companyName}</h1>
              {stage && <Badge variant="outline" className={cn("text-xs", stage.color)}>{stage.label}</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{lead.contactName}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setShowActivity(true)} className="gap-2"><Send className="w-4 h-4" /> Log Activity</Button>
          <Button onClick={startEdit} className="gap-2"><Edit2 className="w-4 h-4" /> Edit</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact Info */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Contact</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium">{lead.companyName}</span>
              </div>
              {lead.email && <div className="flex items-center gap-2.5 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${lead.email}`} className="hover:text-primary">{lead.email}</a>
              </div>}
              {lead.phone && <div className="flex items-center gap-2.5 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <a href={`tel:${lead.phone}`} className="hover:text-primary">{lead.phone}</a>
              </div>}
              {lead.expectedEventDate && <div className="flex items-center gap-2.5 text-sm">
                <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{formatDate(lead.expectedEventDate)}</span>
              </div>}
            </div>
          </div>

          {/* Opportunity */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Opportunity</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Value</span><span className="font-bold text-emerald-600 text-base">{formatCurrency(lead.value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Event Type</span><span>{lead.eventType ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Stage</span><span>{stage?.label ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDate(lead.createdAt)}</span></div>
            </div>
          </div>

          {/* Notes */}
          {lead.notes && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Activity Timeline */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Activity Timeline</h3>
              <span className="text-xs text-muted-foreground">{lead.activities?.length ?? 0} activities</span>
            </div>
            {(!lead.activities || lead.activities.length === 0) ? (
              <div className="text-center py-10 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No activities yet</p>
                <p className="text-xs mt-1">Log a call, email, or note to track progress</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-4">
                  {lead.activities.map((activity) => {
                    const Icon = ACTIVITY_ICONS[activity.type] ?? MessageSquare;
                    return (
                      <div key={activity.id} className="flex gap-4 relative">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 border-2 border-background", ACTIVITY_COLORS[activity.type] ?? "bg-muted text-muted-foreground")}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm">{activity.title}</p>
                            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formatDateTime(activity.createdAt)}</span>
                          </div>
                          {activity.description && <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5"><Label>Company Name</Label><Input value={editForm.companyName ?? ""} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Contact Name</Label><Input value={editForm.contactName ?? ""} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={editForm.email ?? ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={editForm.phone ?? ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Status</Label>
              <Select value={editForm.status ?? "new"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PIPELINE_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Value ($)</Label><Input type="number" value={editForm.value ?? ""} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Event Type</Label><Input value={editForm.eventType ?? ""} onChange={(e) => setEditForm({ ...editForm, eventType: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving…" : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Dialog */}
      <Dialog open={showActivity} onOpenChange={setShowActivity}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={activityForm.type} onValueChange={(v) => setActivityForm({ ...activityForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["note", "call", "email", "meeting", "status_change", "quote_sent", "contract_sent", "invoice_sent"].map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Title *</Label><Input value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} placeholder="What happened?" /></div>
            <div className="space-y-1.5"><Label>Details</Label><Textarea value={activityForm.description} onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivity(false)}>Cancel</Button>
            <Button onClick={addActivity} disabled={activityMutation.isPending || !activityForm.title}>{activityMutation.isPending ? "Saving…" : "Add Activity"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
