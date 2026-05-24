import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetLead,
  useUpdateLead,
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
import { ArrowLeft, Building2, Phone, Mail, CalendarDays, MessageSquare, PhoneCall, AtSign, Users, FileText, Send, ReceiptText, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PIPELINE_STAGES = [
  { key: "new", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "contacted", color: "bg-info/10 text-info border-info/30" },
  { key: "qualified", color: "bg-info/8 text-info border-info/20" },
  { key: "proposal", color: "bg-warning/8 text-warning border-warning/20" },
  { key: "negotiation", color: "bg-warning/8 text-warning border-warning/20" },
  { key: "won", color: "bg-success/8 text-success border-success/20" },
  { key: "lost", color: "bg-destructive/10 text-destructive border-destructive/30" },
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
  email: "bg-info/15 text-info",
  meeting: "bg-warning/15 text-warning",
  status_change: "bg-muted text-muted-foreground",
  quote_sent: "bg-success/15 text-success",
  contract_sent: "bg-info/15 text-info",
  invoice_sent: "bg-warning/15 text-warning",
};

const ACTIVITY_TYPES = ["note", "call", "email", "meeting", "status_change", "quote_sent", "contract_sent", "invoice_sent"];

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [activityForm, setActivityForm] = useState({ type: "note", title: "", description: "" });

  const { data: lead, isLoading } = useGetLead(id, {
    query: { queryKey: ["lead", id], enabled: !!id },
  });

  const updateMutation = useUpdateLead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["lead", id] });
        qc.invalidateQueries({ queryKey: ["leads"] });
        setEditing(false);
        toast({ title: t("leads.lead_updated") });
      },
    },
  });

  const activityMutation = useCreateLeadActivity({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["lead", id] });
        setShowActivity(false);
        setActivityForm({ type: "note", title: "", description: "" });
        toast({ title: t("leads.activity_added") });
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

  if (isLoading) return <div className="flex items-center justify-center h-40 text-muted-foreground">{t("common.loading")}</div>;
  if (!lead) return <div className="text-muted-foreground p-8">{t("leads.lead_not_found")}</div>;

  const stage = getStage(lead.status);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/crm/leads">
            <Button variant="ghost" size="icon" className="shrink-0"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold">{lead.companyName}</h1>
              {stage && <Badge variant="outline" className={cn("text-xs", stage.color)}>{t(`leads.stage_${lead.status}`)}</Badge>}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{lead.contactName}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setShowActivity(true)} className="gap-2"><Send className="w-4 h-4" /> {t("leads.log_activity")}</Button>
          <Button onClick={startEdit} className="gap-2"><Edit2 className="w-4 h-4" /> {t("common.edit")}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("leads.contact_section")}</h3>
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

          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{t("leads.opportunity_section")}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("leads.value_label2")}</span><span className="font-bold text-success text-base">{formatCurrency(lead.value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("leads.event_type_label")}</span><span>{lead.eventType ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("leads.stage_label")}</span><span>{t(`leads.stage_${lead.status}`)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("common.created")}</span><span>{formatDate(lead.createdAt)}</span></div>
            </div>
          </div>

          {lead.notes && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{t("leads.notes_label")}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{t("leads.activity_timeline")}</h3>
              <span className="text-xs text-muted-foreground">{t("leads.activities_count", { count: lead.activities?.length ?? 0 })}</span>
            </div>
            {(!lead.activities || lead.activities.length === 0) ? (
              <div className="text-center py-10 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("leads.no_activities")}</p>
                <p className="text-xs mt-1">{t("leads.activity_hint")}</p>
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

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("leads.edit_lead")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5"><Label>{t("leads.company_label")}</Label><Input value={editForm.companyName ?? ""} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>{t("leads.contact_label")}</Label><Input value={editForm.contactName ?? ""} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("leads.email_label")}</Label><Input value={editForm.email ?? ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("leads.phone_label")}</Label><Input value={editForm.phone ?? ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("leads.status_label")}</Label>
              <Select value={editForm.status ?? "new"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PIPELINE_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{t(`leads.stage_${s.key}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t("leads.value_label")}</Label><Input type="number" value={editForm.value ?? ""} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("leads.event_type_label")}</Label><Input value={editForm.eventType ?? ""} onChange={(e) => setEditForm({ ...editForm, eventType: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>{t("leads.notes_label")}</Label><Textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>{updateMutation.isPending ? t("leads.saving") : t("leads.save_changes")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showActivity} onOpenChange={setShowActivity}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("leads.log_activity")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>{t("leads.activity_type_label")}</Label>
              <Select value={activityForm.type} onValueChange={(v) => setActivityForm({ ...activityForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{t(`leads.activity_type_${type}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t("leads.activity_title_label")} *</Label><Input value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} placeholder={t("leads.what_happened")} /></div>
            <div className="space-y-1.5"><Label>{t("leads.activity_details_label")}</Label><Textarea value={activityForm.description} onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivity(false)}>{t("common.cancel")}</Button>
            <Button onClick={addActivity} disabled={activityMutation.isPending || !activityForm.title}>{activityMutation.isPending ? t("leads.saving") : t("leads.add_activity_btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
