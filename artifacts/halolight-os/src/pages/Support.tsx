import { useState } from "react";
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
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-destructive/15 text-destructive",
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_on_client: "Waiting on Client",
  resolved: "Resolved",
  closed: "Closed",
};

const priorityIcons: Record<string, React.ReactNode> = {
  low: <Clock className="w-3 h-3" />,
  medium: <Clock className="w-3 h-3" />,
  high: <AlertCircle className="w-3 h-3" />,
  urgent: <AlertCircle className="w-3 h-3" />,
};

export default function Support() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", category: "general" });

  const { data, isLoading } = useListSupportTickets({ status: statusFilter || undefined });
  const { mutate: createTicket, isPending } = useCreateSupportTicket({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
        setShowCreate(false);
        setForm({ title: "", description: "", priority: "medium", category: "general" });
        toast({ title: "Ticket created", description: "Your support ticket has been submitted." });
      },
    },
  });

  const tickets = data?.items ?? [];
  const filtered = tickets.filter((t) =>
    !search || t.title?.toLowerCase().includes(search.toLowerCase()) || t.ticketNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    open: tickets.filter((t) => t.status === "open").length,
    inProgress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Support Center</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Submit and track your support requests</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Ticket
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Open", value: stats.open, color: "text-info", bg: "bg-info/10" },
          { label: "In Progress", value: stats.inProgress, color: "text-muted-foreground", bg: "bg-muted" },
          { label: "Resolved", value: stats.resolved, color: "text-success", bg: "bg-success/10" },
        ].map((s) => (
          <Card key={s.label} className={`${s.bg} border-0`}>
            <CardContent className="p-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting_on_client">Waiting on Client</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
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
            <p className="text-muted-foreground font-medium">No tickets found</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first support ticket to get help</p>
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
                          {statusLabels[ticket.status ?? "open"]}
                        </Badge>
                        <Badge className={`text-xs px-2 py-0 gap-1 ${priorityColors[ticket.priority ?? "medium"] ?? ""}`}>
                          {priorityIcons[ticket.priority ?? "medium"]}
                          {ticket.priority ?? "medium"}
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
            <DialogTitle>New Support Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                placeholder="Brief description of your issue"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                placeholder="Please describe your issue in detail..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="feature_request">Feature Request</SelectItem>
                    <SelectItem value="bug_report">Bug Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createTicket({ data: { title: form.title, description: form.description, priority: form.priority as "medium", category: form.category as "general" } })}
              disabled={!form.title || !form.description || isPending}
            >
              Submit Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
