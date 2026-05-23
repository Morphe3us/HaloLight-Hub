import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EventStatus = "upcoming" | "active" | "completed" | "cancelled";

const STATUS_STYLES: Record<EventStatus, string> = {
  upcoming: "bg-info/15 text-info border-info/30",
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

interface EventFormData {
  title: string;
  description: string;
  eventDate: string;
  location: string;
  type: string;
  status: EventStatus;
  notes: string;
}

const EMPTY_FORM: EventFormData = {
  title: "",
  description: "",
  eventDate: "",
  location: "",
  type: "",
  status: "upcoming",
  notes: "",
};

export default function Events() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormData>(EMPTY_FORM);

  const { data: eventsData, isLoading, refetch } = useListEvents({
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    limit: 50,
  });
  const { mutate: createEvent, isPending: isCreating } = useCreateEvent();
  const { mutate: updateEvent, isPending: isUpdating } = useUpdateEvent();
  const { mutate: deleteEvent, isPending: isDeleting } = useDeleteEvent();

  const events = eventsData?.items ?? [];

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const openEdit = (ev: (typeof events)[number]) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      description: ev.description ?? "",
      eventDate: ev.eventDate ? new Date(ev.eventDate).toISOString().slice(0, 16) : "",
      location: ev.location ?? "",
      type: ev.type ?? "",
      status: ev.status as EventStatus,
      notes: ev.notes ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.eventDate) return;
    const payload = {
      title: form.title,
      description: form.description || undefined,
      eventDate: new Date(form.eventDate).toISOString(),
      location: form.location || undefined,
      type: form.type || undefined,
      notes: form.notes || undefined,
    };

    if (editingId) {
      updateEvent(
        { id: editingId, data: { ...payload, status: form.status } },
        {
          onSuccess: () => {
            toast({ title: "Event updated" });
            setIsDialogOpen(false);
            refetch();
          },
          onError: () => toast({ title: "Error", variant: "destructive" }),
        }
      );
    } else {
      createEvent(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Event created" });
            setIsDialogOpen(false);
            refetch();
          },
          onError: () => toast({ title: "Error", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteEvent(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Event deleted" });
          setDeleteId(null);
          refetch();
        },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-8" data-testid="page-events">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("events.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("events.subtitle")}</p>
        </div>
        <Button onClick={openCreate} className="shrink-0 shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          {t("events.add_event")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "upcoming", "active", "completed", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:border-border"
            )}
          >
            {s === "all" ? t("events.all_statuses") : t(`events.status_${s}`)}
          </button>
        ))}
      </div>

      {/* Event List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="mb-4">{t("events.no_events")}</p>
          <Button onClick={openCreate} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            {t("events.add_event")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((ev) => (
            <Card key={ev.id} className="border border-border shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-4 flex-1 min-w-0">
                    {/* Date box */}
                    <div className="flex-shrink-0 h-14 w-14 rounded-xl bg-primary/10 flex flex-col items-center justify-center">
                      <span className="text-xs font-medium text-primary uppercase">
                        {format(parseISO(ev.eventDate), "MMM")}
                      </span>
                      <span className="text-2xl font-bold text-primary leading-none">
                        {format(parseISO(ev.eventDate), "d")}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-foreground truncate">{ev.title}</h3>
                        <Badge variant="outline" className={cn("text-xs shrink-0", STATUS_STYLES[ev.status as EventStatus])}>
                          {t(`events.status_${ev.status}`)}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {format(parseISO(ev.eventDate), "PPP 'at' p")}
                        </span>
                        {ev.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {ev.location}
                          </span>
                        )}
                        {ev.type && (
                          <span className="flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5" />
                            {ev.type}
                          </span>
                        )}
                      </div>

                      {ev.description && (
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-1">{ev.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(ev)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={() => setDeleteId(ev.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("events.edit_event") : t("events.create_event")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{t("events.event_title")} *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Wedding reception at Riverside Hotel"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("events.event_date")} *</Label>
              <Input
                type="datetime-local"
                value={form.eventDate}
                onChange={(e) => setForm((p) => ({ ...p, eventDate: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("events.event_location")}</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="City, Venue"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("events.event_type")}</Label>
                <Input
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  placeholder="Wedding, Corporate..."
                />
              </div>
            </div>
            {editingId && (
              <div className="space-y-1">
                <Label>{t("events.event_status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as EventStatus }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["upcoming", "active", "completed", "cancelled"] as EventStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{t(`events.status_${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>{t("events.event_description")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder="Optional details about the event..."
              />
            </div>
            <div className="space-y-1">
              <Label>{t("events.event_notes")}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder="Private notes for yourself..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.title || !form.eventDate || isCreating || isUpdating}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("events.delete_event")}</AlertDialogTitle>
            <AlertDialogDescription>{t("events.confirm_delete")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
