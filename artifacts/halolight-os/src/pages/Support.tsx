import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useListSupportTickets, useCreateSupportTicket } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Ticket, AlertCircle, Clock, CheckCircle2, ChevronRight } from "lucide-react";

const statusColors: Record<string, string> = {
  open: "bg-info/15 text-info",
  in_progress: "bg-muted text-foreground",
  waiting_on_client: "bg-warning/15 text-yellow-700",
  resolved: "bg-success/15 text-success",
  closed: "bg-muted text-muted-foreground",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
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
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", category: "general" });

  const { data, isLoading } = useListSupportTickets({ status: statusFilter === "all" ? undefined : statusFilter });
  const { mutate: createTicket, isPending } = useCreateSupportTicket({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
        setShowCreate(false);
        setForm({ title: "", description: "", priority: "medium", category: "general" });
        toast({ title: t("support.ticket_created_msg"), description: t("support.ticket_created_desc") });
      },
    },
  });

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
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("support.center_title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("support.center_subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t("support.new_ticket")}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { labelKey: "support.stat_open", value: stats.open, color: "text-info", bg: "bg-info/10" },
          { labelKey: "support.stat_in_progress", value: stats.inProgress, color: "text-muted-foreground", bg: "bg-muted" },
          { labelKey: "support.stat_resolved", value: stats.resolved, color: "text-success", bg: "bg-success/10" },
        ].map((s) => (
          <Card key={s.labelKey} className={`${s.bg} border-0`}>
            <CardContent className="p-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{t(s.labelKey)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Ticket className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">{t("support.no_tickets_title")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("support.no_tickets_desc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => (
            <Link key={ticket.id} href={`/support/tickets/${ticket.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                        <Badge className={`text-xs px-2 py-0 ${statusColors[ticket.status ?? "open"] ?? ""}`}>
                          {t(STATUS_LABEL_KEYS[ticket.status ?? "open"] ?? "support.status_open")}
                        </Badge>
                        <Badge className={`text-xs px-2 py-0 gap-1 ${priorityColors[ticket.priority ?? "medium"] ?? ""}`}>
                          {(ticket.priority === "high" || ticket.priority === "urgent")
                            ? <AlertCircle className="w-3 h-3" />
                            : <Clock className="w-3 h-3" />}
                          {t(PRIORITY_LABEL_KEYS[ticket.priority ?? "medium"] ?? "support.priority_medium")}
                        </Badge>
                      </div>
                      <p className="font-medium text-foreground truncate">{ticket.title}</p>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{ticket.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : ""}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("support.new_ticket_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("support.title_label")}</Label>
              <Input
                placeholder={t("support.title_placeholder")}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("support.desc_label")}</Label>
              <Textarea
                placeholder={t("support.desc_placeholder")}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="mt-1"
              />
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
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => createTicket({ data: { title: form.title, description: form.description, priority: form.priority as "medium", category: form.category as "general" } })}
              disabled={!form.title || !form.description || isPending}
            >
              {t("support.submit_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
