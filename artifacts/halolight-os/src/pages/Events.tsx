import { useState } from "react";
import { Link } from "wouter";
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
  XCircle,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  User,
  Package,
  Printer,
  Wrench,
  FileText,
  ReceiptText,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EventStatus = "upcoming" | "active" | "completed" | "cancelled";

const STATUS_STYLES: Record<EventStatus, string> = {
  upcoming: "bg-info/15 text-info border-info/30",
  active: "bg-success/15 text-success border-success/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const PAYMENT_STYLES: Record<string, string> = {
  paid: "bg-success/10 text-success border-success/30",
  unpaid: "bg-warning/10 text-warning border-warning/30",
  deposit: "bg-info/10 text-info border-info/30",
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
  const [prepOpenId, setPrepOpenId] = useState<string | null>(null);

  const { data: eventsData, isLoading, refetch } = useListEvents({
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    limit: 50,
  });
  const { mutate: createEvent, isPending: isCreating } = useCreateEvent();
  const { mutate: updateEvent, isPending: isUpdating } = useUpdateEvent();
  const { mutate: deleteEvent, isPending: isDeleting } = useDeleteEvent();

  const now = new Date();
  const events = [...(eventsData?.items ?? [])].sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  );

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
            toast({ title: t("events.toast_updated") });
            setIsDialogOpen(false);
            refetch();
          },
          onError: () => toast({ title: t("events.toast_error"), variant: "destructive" }),
        }
      );
    } else {
      createEvent(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: t("events.toast_created") });
            setIsDialogOpen(false);
            refetch();
          },
          onError: () => toast({ title: t("events.toast_error"), variant: "destructive" }),
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
          toast({ title: t("events.toast_deleted") });
          setDeleteId(null);
          refetch();
        },
        onError: () => toast({ title: t("events.toast_error"), variant: "destructive" }),
      }
    );
  };

  const handleCancel = (id: string) => {
    updateEvent(
      { id, data: { status: "cancelled" } },
      {
        onSuccess: () => { toast({ title: t("events.toast_cancelled") }); refetch(); },
        onError: () => toast({ title: t("events.toast_error"), variant: "destructive" }),
      }
    );
  };

  const ev_any = (ev: (typeof events)[number]) => ev as any;

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
          {events.map((ev) => {
            const eany = ev_any(ev);
            const isPast = new Date(ev.eventDate) < now && ev.status === "upcoming";
            const isPrepOpen = prepOpenId === ev.id;
            const paymentStatus = eany.paymentStatus as string | null;
            const hasClientInfo = !!(eany.clientName || eany.clientPhone || eany.clientEmail);
            const hasServiceInfo = !!(eany.packageName || eany.includedPrints || eany.rentalDuration);
            const hasDocLinks = !!(eany.quoteId || eany.contractId || eany.invoiceId);

            return (
              <Card key={ev.id} className={cn("border border-border shadow-sm hover:shadow-md transition-all", isPast && "opacity-60")}>
                <CardContent className="p-5">
                  {isPast && (
                    <div className="text-xs text-warning font-medium mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t("events.past_event_notice")}
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4 flex-1 min-w-0">
                      {/* Date box */}
                      <div className={cn("flex-shrink-0 h-14 w-14 rounded-xl flex flex-col items-center justify-center", isPast ? "bg-muted" : "bg-primary/10")}>
                        <span className={cn("text-xs font-medium uppercase", isPast ? "text-muted-foreground" : "text-primary")}>
                          {format(parseISO(ev.eventDate), "MMM")}
                        </span>
                        <span className={cn("text-2xl font-bold leading-none", isPast ? "text-muted-foreground" : "text-primary")}>
                          {format(parseISO(ev.eventDate), "d")}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Title + badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-foreground truncate">{ev.title}</h3>
                          <Badge variant="outline" className={cn("text-xs shrink-0", STATUS_STYLES[ev.status as EventStatus])}>
                            {t(`events.status_${ev.status}`)}
                          </Badge>
                          {paymentStatus && PAYMENT_STYLES[paymentStatus] && (
                            <Badge variant="outline" className={cn("text-xs shrink-0", PAYMENT_STYLES[paymentStatus])}>
                              {paymentStatus === "paid" ? (
                                <><CheckCircle2 className="w-3 h-3 mr-1" />{t("events.payment_status_paid")}</>
                              ) : (
                                <><AlertCircle className="w-3 h-3 mr-1" />{t("events.payment_status_unpaid")}</>
                              )}
                            </Badge>
                          )}
                        </div>

                        {/* Date / location / type */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {format(parseISO(ev.eventDate), "PPP")}
                            {(eany.eventStartTime || eany.eventEndTime) && (
                              <span className="text-xs ml-1">
                                {eany.eventStartTime}{eany.eventStartTime && eany.eventEndTime ? "–" : ""}{eany.eventEndTime}
                              </span>
                            )}
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

                        {/* Compact service preview */}
                        {hasServiceInfo && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                            {eany.packageName && (
                              <span className="flex items-center gap-1"><Package className="w-3 h-3" />{eany.packageName}</span>
                            )}
                            {eany.includedPrints && (
                              <span className="flex items-center gap-1"><Printer className="w-3 h-3" />{eany.includedPrints} {t("events.prints_required")}</span>
                            )}
                            {eany.rentalDuration && (
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{eany.rentalDuration}</span>
                            )}
                          </div>
                        )}

                        {/* Compact client preview */}
                        {hasClientInfo && !isPrepOpen && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                            {eany.clientName && (
                              <span className="flex items-center gap-1"><User className="w-3 h-3" />{eany.clientName}</span>
                            )}
                            {eany.clientPhone && (
                              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{eany.clientPhone}</span>
                            )}
                          </div>
                        )}

                        {/* Prep Sheet toggle */}
                        {(hasClientInfo || hasServiceInfo || hasDocLinks) && (
                          <button
                            onClick={() => setPrepOpenId(isPrepOpen ? null : ev.id)}
                            className="mt-2 flex items-center gap-1 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            {t("events.prep_sheet_btn")}
                            {isPrepOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(ev)}
                        title={t("common.edit")}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {ev.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-warning"
                          onClick={() => handleCancel(ev.id)}
                          title={t("events.cancel_event")}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(ev.id)}
                        title={t("events.delete_event")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Expandable Prep Sheet */}
                  {isPrepOpen && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                        {/* Client section */}
                        {hasClientInfo && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("events.client_info")}</p>
                            {eany.clientName && (
                              <div className="flex items-center gap-2 text-sm">
                                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>{eany.clientName}</span>
                              </div>
                            )}
                            {eany.clientCompany && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="w-3.5 h-3.5 shrink-0" />
                                <span>{eany.clientCompany}</span>
                              </div>
                            )}
                            {eany.clientPhone && (
                              <div className="flex items-center gap-2 text-sm">
                                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <a href={`tel:${eany.clientPhone}`} className="hover:text-primary">{eany.clientPhone}</a>
                              </div>
                            )}
                            {eany.clientEmail && (
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <a href={`mailto:${eany.clientEmail}`} className="hover:text-primary truncate">{eany.clientEmail}</a>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Service section */}
                        {hasServiceInfo && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("events.service_section")}</p>
                            {eany.packageName && (
                              <div className="flex items-center gap-2 text-sm">
                                <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>{eany.packageName}</span>
                              </div>
                            )}
                            {eany.rentalDuration && (
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>{eany.rentalDuration}</span>
                              </div>
                            )}
                            {eany.includedPrints && (
                              <div className="flex items-center gap-2 text-sm">
                                <Printer className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span>{eany.includedPrints} {t("events.prints_required")}</span>
                              </div>
                            )}
                            {eany.equipmentDescription && (
                              <div className="flex items-start gap-2 text-sm">
                                <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="text-muted-foreground">{eany.equipmentDescription}</span>
                              </div>
                            )}
                            {eany.optionsList && (
                              <div className="flex items-start gap-2 text-sm">
                                <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="text-muted-foreground">{eany.optionsList}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Documents + Payment */}
                        <div className="space-y-1.5">
                          {paymentStatus && (
                            <>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("events.payment_section")}</p>
                              <div className="flex items-center gap-2 text-sm">
                                {paymentStatus === "paid" ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                                ) : (
                                  <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
                                )}
                                <span className={paymentStatus === "paid" ? "text-success" : "text-warning"}>
                                  {paymentStatus === "paid" ? t("events.payment_status_paid") : t("events.payment_status_unpaid")}
                                </span>
                              </div>
                            </>
                          )}
                          {hasDocLinks && (
                            <>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">{t("events.documents_label")}</p>
                              <div className="flex flex-wrap gap-2">
                                {eany.quoteId && (
                                  <Link href={`/quotes/${eany.quoteId}`}>
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs font-medium hover:bg-muted/70 transition-colors cursor-pointer">
                                      <FileText className="w-3 h-3" />{t("events.view_quote")}
                                    </span>
                                  </Link>
                                )}
                                {eany.contractId && (
                                  <Link href={`/contracts/${eany.contractId}`}>
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs font-medium hover:bg-muted/70 transition-colors cursor-pointer">
                                      <ClipboardList className="w-3 h-3" />{t("events.view_contract")}
                                    </span>
                                  </Link>
                                )}
                                {eany.invoiceId && (
                                  <Link href={`/invoices/${eany.invoiceId}`}>
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs font-medium hover:bg-muted/70 transition-colors cursor-pointer">
                                      <ReceiptText className="w-3 h-3" />{t("events.view_invoice")}
                                    </span>
                                  </Link>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
                placeholder={t("events.placeholder_title")}
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
                  placeholder={t("events.placeholder_location")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("events.event_type")}</Label>
                <Input
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  placeholder={t("events.placeholder_type")}
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
                placeholder={t("events.placeholder_notes")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("events.event_notes")}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder={t("events.placeholder_private_notes")}
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
