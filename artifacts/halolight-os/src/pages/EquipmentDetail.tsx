import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetEquipmentById } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Monitor, Wrench, ArrowLeft, ShieldCheck, ShieldAlert, ShieldX,
  Clock, Hash, Info,
} from "lucide-react";

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

const STATUS_COLORS: Record<string, string> = {
  active:     "bg-success/15 text-success",
  inactive:   "bg-muted text-muted-foreground",
  in_service: "bg-info/15 text-info",
  retired:    "bg-destructive/15 text-destructive",
};

const SERVICE_TYPE_STYLES: Record<string, { color: string; dot: string }> = {
  routine_maintenance: { color: "bg-info/10 text-info border-info/30",                  dot: "bg-info" },
  repair:              { color: "bg-warning/8 text-warning border-warning/20",            dot: "bg-warning" },
  upgrade:             { color: "bg-muted text-foreground border-border",                 dot: "bg-accent" },
  inspection:          { color: "bg-success/10 text-success border-success/30",           dot: "bg-success" },
  warranty_claim:      { color: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive" },
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
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-border rounded animate-pulse" />
        <div className="h-48 bg-muted rounded-xl animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!item) return (
    <div className="max-w-3xl mx-auto text-center py-20 text-muted-foreground">
      {t("equipment_detail.not_found")}
    </div>
  );

  const statusColor = STATUS_COLORS[item.status] ?? STATUS_COLORS.active!;
  const warranty = warrantyInfo(item.warrantyExpiration ?? null);
  const WarrantyIcon = warranty.Icon;
  const maintenance = maintenanceInfo(item.nextMaintenanceDate ?? null);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/equipment">
          <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground -ml-1 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t("equipment_detail.back")}
          </button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{item.productModel}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" /> {t("equipment_detail.serial")} {item.serialNumber}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{t("equipment_detail.purchased")}</p>
                  <p className="text-sm font-medium text-foreground">{fmtDate(item.purchaseDate)}</p>
                </div>
                {item.purchasePrice && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">{t("equipment_detail.purchase_price")}</p>
                    <p className="text-sm font-medium text-foreground">${Number(item.purchasePrice).toLocaleString()}</p>
                  </div>
                )}
                {item.vendorName && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">{t("equipment_detail.vendor")}</p>
                    <p className="text-sm font-medium text-foreground">{item.vendorName}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className={warranty.alert ? "border-warning/20 bg-warning/5" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <WarrantyIcon className={`w-4 h-4 ${warranty.color}`} />
              <p className="text-sm font-semibold text-foreground">{t("equipment_detail.warranty_title")}</p>
            </div>
            <p className={`text-sm font-medium ${warranty.color}`}>{warranty.label}</p>
            {item.warrantyExpiration && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("equipment_detail.expiry")} {fmtDate(item.warrantyExpiration)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className={maintenance.urgent ? "border-warning/20 bg-warning/5" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className={`w-4 h-4 ${maintenance.urgent ? "text-warning" : "text-muted-foreground"}`} />
              <p className="text-sm font-semibold text-foreground">{t("equipment_detail.maintenance_title")}</p>
            </div>
            <p className={`text-sm font-medium ${maintenance.urgent ? "text-warning" : "text-foreground"}`}>
              {maintenance.label}
            </p>
            {item.lastMaintenanceDate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("equipment_detail.last")} {fmtDate(item.lastMaintenanceDate, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {item.maintenanceNotes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" /> {t("equipment_detail.notes_title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.maintenanceNotes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> {t("equipment_detail.history_title")}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {t("equipment_detail.history_records", { count: item.serviceHistory?.length ?? 0 })}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {(!item.serviceHistory || item.serviceHistory.length === 0) ? (
            <div className="py-8 text-center text-muted-foreground text-sm">{t("equipment_detail.no_history")}</div>
          ) : (
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-muted" />
              <div className="space-y-5">
                {item.serviceHistory.map((record) => {
                  const style = SERVICE_TYPE_STYLES[record.serviceType] ?? SERVICE_TYPE_STYLES.inspection!;
                  return (
                    <div key={record.id} className="flex gap-4">
                      <div className={`w-3.5 h-3.5 rounded-full ${style.dot} mt-1.5 shrink-0 ring-2 ring-white z-10`} />
                      <div className="flex-1 min-w-0 pb-4 border-b border-border last:border-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${style.color}`}>
                              {serviceLabel(record.serviceType)}
                            </span>
                            <p className="text-xs text-muted-foreground mt-1">
                              {fmtDate(record.serviceDate, { month: "short", day: "numeric", year: "numeric" })}
                              {record.technicianName && ` · ${record.technicianName}`}
                            </p>
                          </div>
                          {record.cost && Number(record.cost) > 0 && (
                            <span className="text-xs font-semibold text-muted-foreground">${Number(record.cost).toFixed(2)}</span>
                          )}
                        </div>
                        <p className="text-sm text-foreground mt-1.5 leading-relaxed">{record.description}</p>
                        {record.nextServiceDate && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("equipment_detail.next_scheduled")} {fmtDate(record.nextServiceDate, { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
