import { useState } from "react";
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
  open: "bg-info/15 text-info",
  in_progress: "bg-muted text-foreground",
  waiting_on_client: "bg-warning/15 text-yellow-700",
  resolved: "bg-success/15 text-success",
  closed: "bg-muted text-muted-foreground",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-destructive/15 text-destructive",
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [statusUpdate, setStatusUpdate] = useState("");

  const { data: ticket, isLoading } = useGetSupportTicket(id!);
  const { data: currentUser } = useGetCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const { mutate: addReply, isPending: isReplying } = useCreateTicketReply({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/support/tickets/${id}`] });
        setReply("");
        toast({ title: "Reply sent" });
      },
    },
  });

  const { mutate: updateStatus } = useUpdateTicketStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/support/tickets/${id}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
        toast({ title: "Status updated" });
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
        <p className="text-muted-foreground">Ticket not found.</p>
        <Link href="/support">
          <Button variant="outline" className="mt-4">Back to Support</Button>
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
            Support
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
                  {(ticket.status ?? "open").replace(/_/g, " ")}
                </Badge>
                <Badge className={`text-xs ${priorityColors[ticket.priority ?? "medium"] ?? ""}`}>
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {ticket.priority ?? "medium"} priority
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <Tag className="w-3 h-3 mr-1" />
                  {(ticket.category ?? "general").replace(/_/g, " ")}
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
                    <SelectValue placeholder="Change status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="waiting_on_client">Waiting on Client</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Clock className="w-3.5 h-3.5" />
            Opened {formatDate(ticket.createdAt)}
          </div>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-foreground whitespace-pre-wrap">{ticket.description}</p>
          </div>
        </CardContent>
      </Card>

      {replies.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-foreground">Conversation ({replies.length})</h3>
          {replies.map((r) => (
            <div key={r.id} className={`flex gap-3 ${r.isStaff ? "flex-row-reverse" : ""}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${r.isStaff ? "bg-primary text-white" : "bg-border text-muted-foreground"}`}>
                {r.isStaff ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className={`flex-1 max-w-[80%] ${r.isStaff ? "items-end" : ""}`}>
                <div className={`rounded-xl px-4 py-3 ${r.isStaff ? "bg-primary text-white rounded-tr-none" : "bg-card border rounded-tl-none"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${r.isStaff ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {r.isStaff ? "Support Team" : (r.userName ?? "You")}
                    </span>
                    {r.isStaff && <Badge className="text-xs bg-card/20 text-white px-1 py-0">Staff</Badge>}
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
              {isAdmin ? "Reply as Support Staff" : "Add a Reply"}
            </h3>
            <Textarea
              placeholder="Type your message..."
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
                Send Reply
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {ticket.status === "closed" && (
        <div className="flex items-center justify-center gap-2 py-6 text-success">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">This ticket is closed</span>
        </div>
      )}
    </div>
  );
}
