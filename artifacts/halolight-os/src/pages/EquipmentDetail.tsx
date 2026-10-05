import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetEquipmentById, useListEvents } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, ShieldCheck, ShieldAlert, ShieldX, MapPin,
} from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/page";

type ServiceRecord = {
  id: string; serviceDate: string; serviceType: string; description: string;
  technicianName: string | null; cost: string | null; nextServiceDate: string | null;
};

type EquipmentDetailData = {
  id: string; productModel: string; serialNumber: string; purchaseDate: string | null;
  warrantyExpiration: string | null; status: string; maintenanceNotes: string | null;
  lastMaintenanceDate: string | null; nextMaintenanceDate: string | null;
  purchasePrice: string | null; vendorName: string | null; serviceHistory: ServiceRecord[];
};

const STATUS_DOT: Record<string, string> = {
  active:     "bg-success",
  inactive:   "bg-muted-foreground/50",
  in_service: "bg-info",
  retired:    "bg-destructive",
};

const SERVICE_TYPE_STYLES: Record<string, { dot: string }> = {
  routine_maintenance: { dot: "bg-info" },
  repair:              { dot: "bg-warning" },
  upgrade:             { dot: "bg-foreground/60" },
  inspection:          { dot: "bg-success" },
  warranty_claim:      { dot: "bg-destructive" },
};

const EVENT_STATUS_DOT: Record<string, string> = {
  upcoming:  "bg-info",
  active:    "bg-success",
  completed: "bg-muted-foreground/50",
  cancelled: "bg-destructive",
};

function fmtDate(d: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, opts ?? { month: "long", day: "numeric", year: "numeric" });
}

export default function EquipmentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useGetEquipmentById(id);
  const item = data as EquipmentDetailData | undefined;

  const { data: eventsData } = useListEvents({ limit: 100 });
  const linkedEvents = (eventsData?.items ?? []).filter((ev) => {
    const equipIds = (ev as any).equipmentIds;
    if (!equipIds || !Array.isArray(equipIds)) return false;
    return equipIds.includes(id);
  }).filter((ev) => ev.status === "upcoming" || ev.status === "active");

  function warrantyInfo(expiry: string | null) {
    if (!expiry) return { label: t("equipment_detail.warranty_none"), color: "text-muted-foreground", Icon: ShieldX, alert: false };
    const daysLeft = Math.round((new Date(expiry).getTime() - Date.now()) / 86400000);
    if (daysLeft < 0) return {
      label: t("equipment_detail.warranty_expired", { months: Math.abs(Math.floor(daysLeft / 30)) }),
      color: "text-destructive", Icon: ShieldX, alert: true,
    };
    if (daysLeft <= 60) return {
      label: t("equipment_detail.warranty_expiring", { days: daysLeft, date: fmtDate(expiry, { month: "short", day: "numeric", year: "numeric" }) }),
      color: "text-warning", Icon: ShieldAlert, alert: true,
    };
    return {
      label: t("equipment_detail.warranty_valid", { date: fmtDate(expiry, { month: "long", year: "numeric" }) }),
      color: "text-success", Icon: ShieldCheck, alert: false,
    };
  }

  function maintenanceInfo(next: string | null) {
    if (!next) return { label: t("equipment_detail.maint_not_scheduled"), urgent: false };
    const daysLeft = Math.round((new Date(next).getTime() - Date.now()) / 86400000);
    if (daysLeft < 0) return { label: t("equipment_detail.maint_overdue", { days: Math.abs(daysLeft) }), urgent: true };
    if (daysLeft <= 14) return { label: t("equipment_detail.maint_due_in", { days: daysLeft }), urgent: true };
    return { label: t("equipment_detail.maint_due", { date: fmtDate(next, { month: "short", day: "numeric", year: "numeric" }) }), urgent: false };
  }

  function serviceLabel(type: string): string {
    const key = `equipment_detail.service_${type}` as Parameters<typeof t>[0];
    const result = t(key);
    return result === key ? type : result;
  }

  function statusLabel(status: string): string {
    const key = `equipment_detail.status_${status}` as Parameters<typeof t>[0];
    const result = t(key);
    return result === key ? status : result;
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-48 bg-muted rounded-md animate-pulse" />
        <div className="h-48 bg-muted rounded-xl animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!item) return (
    <div className="max-w-3xl">
      <EmptyState text={t("equipment_detail.not_found")} />
    </div>
  );

  const statusDot = STATUS_DOT[item.status] ?? STATUS_DOT.active!;
  const warranty = warrantyInfo(item.warrantyExpiration ?? null);
  const maintenance = maintenanceInfo(item.nextMaintenanceDate ?? null);

  return (
    <div className="max-w-3xl space-y-10">
      <div className="space-y-4">
        <Link href="/equipment">
          <button className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4 stroke-[1.75]" /> {t("equipment_detail.back")}
          </button>
        </Link>

        <PageHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              {item.productModel}
              <span className="inline-flex items-center gap-1.5 text-xs font-normal tracking-normal text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                {statusLabel(item.status)}
              </span>
            </span>
          }
          description={<span className="font-mono text-[13px]">{t("equipment_detail.serial")} {item.serialNumber}</span>}
        />
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-5 shadow-[1px_1px_0_0_hsl(var(--border))]">
          <dt className="text-[13px] text-muted-foreground">{t("equipment_detail.purchased")}</dt>
          <dd className="text-sm font-medium text-foreground tabular-nums mt-1">{fmtDate(item.purchaseDate)}</dd>
        </div>
        {item.purchasePrice && (
          <div className="p-5 shadow-[1px_1px_0_0_hsl(var(--border))]">
            <dt className="text-[13px] text-muted-foreground">{t("equipment_detail.purchase_price")}</dt>
            <dd className="text-sm font-medium text-foreground tabular-nums mt-1">${Number(item.purchasePrice).toLocaleString()}</dd>
          </div>
        )}
        {item.vendorName && (
          <div className="p-5 shadow-[1px_1px_0_0_hsl(var(--border))]">
            <dt className="text-[13px] text-muted-foreground">{t("equipment_detail.vendor")}</dt>
            <dd className="text-sm font-medium text-foreground mt-1">{item.vendorName}</dd>
          </div>
        )}
      </dl>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[13px] text-muted-foreground">{t("equipment_detail.warranty_title")}</p>
              {warranty.alert && <span className={`h-1.5 w-1.5 rounded-full ${warranty.color === "text-destructive" ? "bg-destructive" : "bg-warning"}`} />}
            </div>
            <p className={`text-sm font-medium ${warranty.alert ? warranty.color : "text-foreground"}`}>{warranty.label}</p>
            {item.warrantyExpiration && (
              <p className="text-xs text-muted-foreground tabular-nums mt-1">
                {t("equipment_detail.expiry")} {fmtDate(item.warrantyExpiration)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[13px] text-muted-foreground">{t("equipment_detail.maintenance_title")}</p>
              {maintenance.urgent && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
            </div>
            <p className={`text-sm font-medium ${maintenance.urgent ? "text-warning" : "text-foreground"}`}>
              {maintenance.label}
            </p>
            {item.lastMaintenanceDate && (
              <p className="text-xs text-muted-foreground tabular-nums mt-1">
                {t("equipment_detail.last")} {fmtDate(item.lastMaintenanceDate, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {item.maintenanceNotes && (
        <Section title={t("equipment_detail.notes_title")}>
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground leading-relaxed">{item.maintenanceNotes}</p>
        </Section>
      )}

      <Section
        title={t("equipment_detail.upcoming_events_title", { defaultValue: "Upcoming Assignments" })}
        actions={
          <span className="text-xs text-muted-foreground tabular-nums">
            {linkedEvents.length} {t("equipment_detail.events_count", { defaultValue: "event(s)" })}
          </span>
        }
      >
        {linkedEvents.length === 0 ? (
          <EmptyState text={t("equipment_detail.no_upcoming_events", { defaultValue: "No upcoming events assigned to this equipment." })} className="py-8" />
        ) : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {linkedEvents.map((ev) => {
              const evAny = ev as any;
              const dot = EVENT_STATUS_DOT[ev.status] ?? EVENT_STATUS_DOT.upcoming!;
              return (
                <li key={ev.id} className="px-4 py-3">
                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{ev.title}</p>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{ev.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="tabular-nums">
                      {fmtDate(ev.eventDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      {evAny.eventStartTime ? ` · ${evAny.eventStartTime}` : ""}
                    </span>
                    {ev.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 stroke-[1.75]" /> {ev.location}
                      </span>
                    )}
                    {evAny.clientName && <span>{evAny.clientName}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title={t("equipment_detail.history_title")}
        actions={
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("equipment_detail.history_records", { count: item.serviceHistory?.length ?? 0 })}
          </span>
        }
      >
        {(!item.serviceHistory || item.serviceHistory.length === 0) ? (
          <EmptyState text={t("equipment_detail.no_history")} className="py-8" />
        ) : (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="relative">
              <div className="absolute left-[3px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-5">
                {item.serviceHistory.map((record) => {
                  const style = SERVICE_TYPE_STYLES[record.serviceType] ?? SERVICE_TYPE_STYLES.inspection!;
                  return (
                    <div key={record.id} className="flex gap-4">
                      <div className={`w-[7px] h-[7px] rounded-full ${style.dot} mt-1.5 shrink-0 ring-4 ring-card z-10`} />
                      <div className="flex-1 min-w-0 pb-5 border-b border-border last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {serviceLabel(record.serviceType)}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                              {fmtDate(record.serviceDate, { month: "short", day: "numeric", year: "numeric" })}
                              {record.technicianName && ` · ${record.technicianName}`}
                            </p>
                          </div>
                          {record.cost && Number(record.cost) > 0 && (
                            <span className="text-xs text-muted-foreground tabular-nums">${Number(record.cost).toFixed(2)}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{record.description}</p>
                        {record.nextServiceDate && (
                          <p className="text-xs text-muted-foreground tabular-nums mt-1">
                            {t("equipment_detail.next_scheduled")} {fmtDate(record.nextServiceDate, { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
