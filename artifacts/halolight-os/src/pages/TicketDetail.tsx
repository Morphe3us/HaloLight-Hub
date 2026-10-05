import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "wouter";
import { customFetch, useGetSupportTicket, useCreateTicketReply, useUpdateTicketStatus, useGetCurrentUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Shield, User, CheckCircle2, Download, RotateCw } from "lucide-react";
import { EmptyState } from "@/components/page";
import { downloadSupportAttachment } from "./supportAttachmentFiles";

const statusDot: Record<string, string> = {
  open:              "bg-info",
  in_progress:       "bg-foreground/60",
  waiting_on_client: "bg-warning",
  resolved:          "bg-success",
  closed:            "bg-muted-foreground/50",
};

const priorityText: Record<string, string> = {
  low:    "text-muted-foreground",
  medium: "text-muted-foreground",
  high:   "text-warning",
  urgent: "text-destructive",
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
  const [downloading, setDownloading] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const { data: ticket, isLoading, isError, refetch } = useGetSupportTicket(id!);
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const deliveryLabels: Record<string, string> = {
    pending: "Email queued", sending: "Sending email", sent: "Accepted by email provider", failed: "Email delivery failed",
    unknown: "Delivery needs verification", disabled: "Email delivery is not configured",
  };

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
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-48 bg-muted rounded-md animate-pulse" />
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!ticket || isError) {
    return (
      <div className="max-w-3xl">
        <EmptyState text={t(isError ? "common.error" : "ticket_detail.not_found")}>
          <div className="flex flex-wrap justify-center gap-2">
            {isError && <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("common.retry", { defaultValue: "Retry" })}</Button>}
            <Link href="/support">
              <Button variant="outline" size="sm">{t("ticket_detail.back_btn")}</Button>
            </Link>
          </div>
        </EmptyState>
      </div>
    );
  }

  const replies = (ticket as unknown as { replies?: Array<{ id: string; content: string; isStaff: number; userId: string; userName?: string; createdAt: string }> }).replies ?? [];

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center gap-2">
        <Link href="/support">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 stroke-[1.75]" />
            {t("ticket_detail.back")}
          </Button>
        </Link>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-[13px] text-muted-foreground font-mono">{ticket.ticketNumber}</span>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="p-5 border-b border-border">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground break-words [overflow-wrap:anywhere]">{ticket.title}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${statusDot[ticket.status ?? "open"] ?? "bg-muted-foreground/50"}`} />
                  {t(`ticket_detail.status_${ticket.status ?? "open"}`, { defaultValue: (ticket.status ?? "open").replace(/_/g, " ") })}
                </span>
                <span className={priorityText[ticket.priority ?? "medium"] ?? ""}>
                  {t("ticket_detail.priority_suffix", { level: priorityLabels[ticket.priority ?? "medium"] ?? (ticket.priority ?? "medium") })}
                </span>
                <Badge variant="outline" className="text-xs font-normal">
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
        </div>
        <div className="p-5">
          <p className="text-xs text-muted-foreground mb-4 tabular-nums">
            {t("ticket_detail.opened", { date: formatDate(ticket.createdAt) })}
          </p>
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{ticket.description}</p>
          {(ticket.equipmentModel || ticket.serialNumber) && <dl className="mt-5 text-sm space-y-2">
            {ticket.equipmentModel && <div><dt className="text-[13px] text-muted-foreground">{t("support.equipment_model", { defaultValue: "Equipment/model (optional)" })}</dt><dd className="break-words">{ticket.equipmentModel}</dd></div>}
            {ticket.serialNumber && <div><dt className="text-[13px] text-muted-foreground">{t("support.serial_number", { defaultValue: "Serial number (optional)" })}</dt><dd className="break-words">{ticket.serialNumber}</dd></div>}
          </dl>}
          {(ticket.attachments ?? []).map(file => <div key={file.id} className="flex items-center justify-between gap-3 border-t border-border py-3 mt-3">
            <span className="text-sm min-w-0 break-all">{file.fileName}</span>
            <Button variant="outline" size="icon" disabled={downloading !== null} title={file.fileName} aria-label={file.fileName} onClick={async () => {
              setDownloading(file.id);
              try { await downloadSupportAttachment(id!, file.id, file.fileName); }
              catch { toast({ title: t("common.error"), description: t("ticket_detail.download_failed", { defaultValue: "Attachment download failed" }), variant: "destructive" }); }
              finally { setDownloading(null); }
            }}><Download className="h-4 w-4 stroke-[1.75]" /></Button>
          </div>)}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">{t("ticket_detail.email_history", { defaultValue: "Email delivery history" })}</h2>
        <p className="text-[13px] text-muted-foreground">{ticket.emailDelivery ? t(`ticket_detail.email_${ticket.emailDelivery.status}`, { defaultValue: deliveryLabels[ticket.emailDelivery.status] ?? "Delivery needs verification" }) : t("ticket_detail.email_none", { defaultValue: "No email delivery record" })}</p>
        {(ticket.deliveryHistory ?? []).map(event => <div key={event.id} className="text-sm flex flex-wrap justify-between gap-2">
          <span>{t(`ticket_detail.email_${event.status}`, { defaultValue: deliveryLabels[event.status] ?? "Delivery needs verification" })}</span>
          <time className="text-muted-foreground tabular-nums">{formatDate(event.createdAt)}</time>
        </div>)}
        {isAdmin && ticket.emailDelivery && !["sent", "sending"].includes(ticket.emailDelivery.status) && <Button variant="outline" size="sm" disabled={retrying} onClick={async () => {
          setRetrying(true);
          try { await customFetch(`/api/support/tickets/${id}/email/retry`, { method: "POST" }); await refetch(); }
          catch { toast({ title: t("common.error"), description: t("ticket_detail.email_retry_failed", { defaultValue: "Email retry failed" }), variant: "destructive" }); }
          finally { setRetrying(false); }
        }}><RotateCw className="h-4 w-4 mr-2 stroke-[1.75]" />{t("ticket_detail.email_retry", { defaultValue: "Retry email" })}</Button>}
      </section>

      {replies.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{t("ticket_detail.conversation", { count: replies.length })}</h3>
          {replies.map((r) => (
            <div key={r.id} className={`flex gap-3 ${r.isStaff ? "flex-row-reverse" : ""}`}>
              <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                {r.isStaff ? <Shield className="w-4 h-4 stroke-[1.75]" /> : <User className="w-4 h-4 stroke-[1.75]" />}
              </div>
              <div className={`flex-1 max-w-[80%] ${r.isStaff ? "items-end" : ""}`}>
                <div className={`rounded-2xl px-4 py-3 ${r.isStaff ? "bg-foreground text-background rounded-tr-md" : "bg-muted text-foreground rounded-tl-md"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${r.isStaff ? "text-background/70" : "text-muted-foreground"}`}>
                      {r.isStaff ? t("ticket_detail.support_team") : (r.userName ?? t("ticket_detail.you"))}
                    </span>
                    {r.isStaff && <span className="text-[11px] text-background/60">· {t("ticket_detail.staff_badge")}</span>}
                  </div>
                  <p className={`text-sm whitespace-pre-wrap ${r.isStaff ? "text-background" : "text-foreground"}`}>{r.content}</p>
                </div>
                <p className={`text-xs text-muted-foreground tabular-nums mt-1 ${r.isStaff ? "text-right" : ""}`}>{formatDate(r.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {ticket.status !== "closed" && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-medium text-foreground mb-3">
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
                <Send className="w-4 h-4 stroke-[1.75]" />
                {t("ticket_detail.send_reply")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {ticket.status === "closed" && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-4 text-sm text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 stroke-[1.75] text-success" />
          <span>{t("ticket_detail.ticket_closed")}</span>
        </div>
      )}
    </div>
  );
}
