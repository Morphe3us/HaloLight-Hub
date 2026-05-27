import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "wouter";
import { useGetSupportTicket, useCreateTicketReply, useUpdateTicketStatus, useGetCurrentUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Shield, User, Clock, CheckCircle2, AlertCircle, Tag } from "lucide-react";

const statusColors: Record<string, string> = {
  open:              "bg-info/15 text-info",
  in_progress:       "bg-muted text-foreground",
  waiting_on_client: "bg-warning/15 text-yellow-700",
  resolved:          "bg-success/15 text-success",
  closed:            "bg-muted text-muted-foreground",
};

const priorityColors: Record<string, string> = {
  low:    "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high:   "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TicketDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [statusUpdate, setStatusUpdate] = useState("");

  const { data: ticket, isLoading } = useGetSupportTicket(id!);
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const priorityLabels: Record<string, string> = {
    low:    t("ticket_detail.priority_low"),
    medium: t("ticket_detail.priority_medium"),
    high:   t("ticket_detail.priority_high"),
    urgent: t("ticket_detail.priority_urgent"),
  };

  const { mutate: addReply, isPending: isReplying } = useCreateTicketReply({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/support/tickets/${id}`] });
        setReply("");
        toast({ title: t("ticket_detail.toast_reply_sent") });
      },
    },
  });

  const { mutate: updateStatus } = useUpdateTicketStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/support/tickets/${id}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
        toast({ title: t("ticket_detail.toast_status_updated") });
        setStatusUpdate("");
      },
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-border rounded animate-pulse" />
        <div className="h-40 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-muted-foreground">{t("ticket_detail.not_found")}</p>
        <Link href="/support">
          <Button variant="outline" className="mt-4">{t("ticket_detail.back_btn")}</Button>
        </Link>
      </div>
    );
  }

  const replies = (ticket as unknown as { replies?: Array<{ id: string; content: string; isStaff: number; userId: string; userName?: string; createdAt: string }> }).replies ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/support">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("ticket_detail.back")}
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground font-mono">{ticket.ticketNumber}</span>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-xl font-semibold">{ticket.title}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge className={`text-xs ${statusColors[ticket.status ?? "open"] ?? ""}`}>
                  {t(`ticket_detail.status_${ticket.status ?? "open"}`, { defaultValue: (ticket.status ?? "open").replace(/_/g, " ") })}
                </Badge>
                <Badge className={`text-xs ${priorityColors[ticket.priority ?? "medium"] ?? ""}`}>
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {t("ticket_detail.priority_suffix", { level: priorityLabels[ticket.priority ?? "medium"] ?? (ticket.priority ?? "medium") })}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <Tag className="w-3 h-3 mr-1" />
                  {t(`support.category_${ticket.category ?? "general"}`, { defaultValue: (ticket.category ?? "general").replace(/_/g, " ") })}
                </Badge>
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Select value={statusUpdate} onValueChange={(v) => {
                  setStatusUpdate(v);
                  updateStatus({ id: id!, data: { status: v as "open" } });
                }}>
                  <SelectTrigger className="w-48 h-8 text-xs">
                    <SelectValue placeholder={t("ticket_detail.change_status")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">{t("ticket_detail.status_open")}</SelectItem>
                    <SelectItem value="in_progress">{t("ticket_detail.status_in_progress")}</SelectItem>
                    <SelectItem value="waiting_on_client">{t("ticket_detail.status_waiting")}</SelectItem>
                    <SelectItem value="resolved">{t("ticket_detail.status_resolved")}</SelectItem>
                    <SelectItem value="closed">{t("ticket_detail.status_closed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Clock className="w-3.5 h-3.5" />
            {t("ticket_detail.opened", { date: formatDate(ticket.createdAt) })}
          </div>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-foreground whitespace-pre-wrap">{ticket.description}</p>
          </div>
        </CardContent>
      </Card>

      {replies.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-foreground">{t("ticket_detail.conversation", { count: replies.length })}</h3>
          {replies.map((r) => (
            <div key={r.id} className={`flex gap-3 ${r.isStaff ? "flex-row-reverse" : ""}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${r.isStaff ? "bg-primary text-white" : "bg-border text-muted-foreground"}`}>
                {r.isStaff ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className={`flex-1 max-w-[80%] ${r.isStaff ? "items-end" : ""}`}>
                <div className={`rounded-xl px-4 py-3 ${r.isStaff ? "bg-primary text-white rounded-tr-none" : "bg-card border rounded-tl-none"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${r.isStaff ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {r.isStaff ? t("ticket_detail.support_team") : (r.userName ?? t("ticket_detail.you"))}
                    </span>
                    {r.isStaff && <Badge className="text-xs bg-card/20 text-white px-1 py-0">{t("ticket_detail.staff_badge")}</Badge>}
                  </div>
                  <p className={`text-sm whitespace-pre-wrap ${r.isStaff ? "text-white" : "text-foreground"}`}>{r.content}</p>
                </div>
                <p className={`text-xs text-muted-foreground mt-1 ${r.isStaff ? "text-right" : ""}`}>{formatDate(r.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {ticket.status !== "closed" && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium text-foreground mb-3">
              {isAdmin ? t("ticket_detail.reply_as_staff") : t("ticket_detail.add_reply")}
            </h3>
            <Textarea
              placeholder={t("ticket_detail.reply_placeholder")}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              className="mb-3"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => addReply({ id: id!, data: { content: reply, isStaff: isAdmin ? 1 : 0 } })}
                disabled={!reply.trim() || isReplying}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                {t("ticket_detail.send_reply")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {ticket.status === "closed" && (
        <div className="flex items-center justify-center gap-2 py-6 text-success">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">{t("ticket_detail.ticket_closed")}</span>
        </div>
      )}
    </div>
  );
}
