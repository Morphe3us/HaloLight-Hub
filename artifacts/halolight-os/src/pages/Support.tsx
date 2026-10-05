import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListSupportTickets, useCreateSupportTicket } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Ticket, AlertCircle, ChevronRight } from "lucide-react";
import { EmptyState, Notice, PageHeader, Stat, StatGrid } from "@/components/page";
import { encodeSupportFiles } from "./supportAttachmentFiles";

const statusDot: Record<string, string> = {
  open: "bg-info",
  in_progress: "bg-foreground/60",
  waiting_on_client: "bg-warning",
  resolved: "bg-success",
  closed: "bg-muted-foreground/50",
};

const priorityText: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-muted-foreground",
  high: "text-warning",
  urgent: "text-destructive",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  open: "support.status_open",
  in_progress: "support.in_progress",
  waiting_on_client: "support.waiting_client",
  resolved: "support.status_resolved",
  closed: "support.status_closed",
};

const PRIORITY_LABEL_KEYS: Record<string, string> = {
  low: "support.priority_low",
  medium: "support.priority_medium",
  high: "support.priority_high",
  urgent: "support.priority_urgent",
};

export default function Support() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const emptyForm = { title: "", description: "", priority: "medium", category: "general", equipmentModel: "", serialNumber: "" };
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [encoding, setEncoding] = useState(false);

  const { data, isLoading, isError, refetch } = useListSupportTickets({ status: statusFilter === "all" ? undefined : statusFilter });
  const { mutateAsync: createTicket, isPending } = useCreateSupportTicket({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
        setShowCreate(false);
        setForm(emptyForm);
        setFiles([]);
        toast({ title: t("support.ticket_created_msg"), description: t("support.ticket_created_desc") });
      },
    },
  });

  async function submitTicket() {
    setEncoding(true);
    try {
      const attachments = await encodeSupportFiles(files);
      await createTicket({ data: { ...form, equipmentModel: form.equipmentModel.trim() || null,
        serialNumber: form.serialNumber.trim() || null, priority: form.priority as "medium", category: form.category as "general", attachments } });
    } catch {
      toast({ title: t("common.error"), description: t("support.create_failed", { defaultValue: "Ticket creation failed. Check the fields and attachments, then try again." }), variant: "destructive" });
    } finally { setEncoding(false); }
  }

  const tickets = data?.items ?? [];
  const filtered = tickets.filter((ticket) =>
    !search || ticket.title?.toLowerCase().includes(search.toLowerCase()) || ticket.ticketNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    open: tickets.filter((ticket) => ticket.status === "open").length,
    inProgress: tickets.filter((ticket) => ticket.status === "in_progress").length,
    resolved: tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed").length,
  };

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        title={t("support.center_title")}
        description={t("support.center_subtitle")}
        actions={
          <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {t("support.new_ticket")}
          </Button>
        }
      />

      <StatGrid className="grid-cols-3 md:grid-cols-3">
        <Stat label={t("support.stat_open")} value={stats.open} tone={stats.open > 0 ? "info" : undefined} />
        <Stat label={t("support.stat_in_progress")} value={stats.inProgress} />
        <Stat label={t("support.stat_resolved")} value={stats.resolved} tone={stats.resolved > 0 ? "success" : undefined} />
      </StatGrid>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground stroke-[1.75]" />
          <Input
            placeholder={t("support.search_tickets")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("support.all_statuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("support.all_statuses")}</SelectItem>
            <SelectItem value="open">{t("support.status_open")}</SelectItem>
            <SelectItem value="in_progress">{t("support.in_progress")}</SelectItem>
            <SelectItem value="waiting_on_client">{t("support.waiting_client")}</SelectItem>
            <SelectItem value="resolved">{t("support.status_resolved")}</SelectItem>
            <SelectItem value="closed">{t("support.status_closed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <Notice
          icon={AlertCircle}
          title={t("common.error")}
          action={<Button variant="outline" size="sm" onClick={() => void refetch()}>{t("common.retry", { defaultValue: "Retry" })}</Button>}
        />
      ) : isLoading ? (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {[1, 2, 3].map((i) => <div key={i} className="h-[72px] px-4 py-3"><div className="h-full bg-muted rounded-md animate-pulse" /></div>)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Ticket} text={t("support.no_tickets_title")}>
          <p className="text-[13px] text-muted-foreground -mt-2">{t("support.no_tickets_desc")}</p>
        </EmptyState>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {filtered.map((ticket) => (
            <li key={ticket.id}>
              <Link href={`/support/tickets/${ticket.id}`} className="group flex items-start justify-between gap-4 px-4 py-3 hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1 text-xs text-muted-foreground">
                    <span className="font-mono">{ticket.ticketNumber}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot[ticket.status ?? "open"] ?? "bg-muted-foreground/50"}`} />
                      {t(STATUS_LABEL_KEYS[ticket.status ?? "open"] ?? "support.status_open")}
                    </span>
                    <span className={priorityText[ticket.priority ?? "medium"] ?? ""}>
                      {t(PRIORITY_LABEL_KEYS[ticket.priority ?? "medium"] ?? "support.priority_medium")}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{ticket.title}</p>
                  <p className="text-[13px] text-muted-foreground truncate mt-0.5">{ticket.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : ""}
                  </span>
                  <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={showCreate} onOpenChange={open => { if (!encoding && !isPending) setShowCreate(open); }}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("support.new_ticket_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("support.title_label")}</Label>
              <Input
                placeholder={t("support.title_placeholder")}
                value={form.title}
                maxLength={250}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("support.desc_label")}</Label>
              <Textarea
                placeholder={t("support.desc_placeholder")}
                value={form.description}
                maxLength={20000}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label htmlFor="ticket-equipment">{t("support.equipment_model", { defaultValue: "Equipment/model (optional)" })}</Label>
                <Input id="ticket-equipment" maxLength={200} value={form.equipmentModel} onChange={event => setForm({ ...form, equipmentModel: event.target.value })} /></div>
              <div><Label htmlFor="ticket-serial">{t("support.serial_number", { defaultValue: "Serial number (optional)" })}</Label>
                <Input id="ticket-serial" maxLength={200} value={form.serialNumber} onChange={event => setForm({ ...form, serialNumber: event.target.value })} /></div>
            </div>
            <div>
              <Label htmlFor="ticket-files">{t("support.attachments", { defaultValue: "Attachments" })}</Label>
              <Input id="ticket-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={encoding || isPending} onChange={event => {
                const selected = Array.from(event.target.files ?? []);
                if (selected.length > 3 || selected.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) {
                  event.target.value = ""; setFiles([]);
                  toast({ title: t("common.error"), description: t("support.attachments_invalid", { defaultValue: "Choose up to 3 PDF or image files, up to 10 MiB total" }), variant: "destructive" });
                } else setFiles(selected);
              }} />
              <p className="text-xs text-muted-foreground mt-1">{t("support.attachments_limit", { defaultValue: "Up to 3 PDF or image files, 10 MiB total" })}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("support.priority_label")}</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("support.priority_low")}</SelectItem>
                    <SelectItem value="medium">{t("support.priority_medium")}</SelectItem>
                    <SelectItem value="high">{t("support.priority_high")}</SelectItem>
                    <SelectItem value="urgent">{t("support.priority_urgent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("support.category_label")}</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">{t("support.category_general")}</SelectItem>
                    <SelectItem value="billing">{t("support.category_billing")}</SelectItem>
                    <SelectItem value="technical">{t("support.category_technical")}</SelectItem>
                    <SelectItem value="feature_request">{t("support.category_feature")}</SelectItem>
                    <SelectItem value="bug_report">{t("support.category_bug")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={encoding || isPending} onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => void submitTicket()}
              disabled={!form.title.trim() || !form.description.trim() || isPending || encoding}
            >
              {t("support.submit_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
