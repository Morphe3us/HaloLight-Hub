import { Link, useParams } from "wouter";
import { useGetEquipmentById } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Monitor, Wrench, AlertTriangle, CheckCircle2, Package,
  ArrowLeft, ShieldCheck, ShieldAlert, ShieldX, Clock,
  CalendarDays, DollarSign, Building2, Hash, Info, Plus,
  ChevronRight,
} from "lucide-react";

type ServiceRecord = {
  id: string;
  serviceDate: string;
  serviceType: string;
  description: string;
  technicianName: string | null;
  cost: string | null;
  nextServiceDate: string | null;
};

type EquipmentDetail = {
  id: string;
  productModel: string;
  serialNumber: string;
  purchaseDate: string | null;
  warrantyExpiration: string | null;
  status: string;
  maintenanceNotes: string | null;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null;
  purchasePrice: string | null;
  vendorName: string | null;
  serviceHistory: ServiceRecord[];
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:     { label: "Active",     color: "bg-success/15 text-success" },
  inactive:   { label: "Inactive",   color: "bg-muted text-muted-foreground" },
  in_service: { label: "In Service", color: "bg-info/15 text-info" },
  retired:    { label: "Retired",    color: "bg-destructive/15 text-destructive" },
};

const SERVICE_TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  routine_maintenance: { label: "Routine Maintenance", color: "bg-info/10 text-info border-info/30", dot: "bg-info" },
  repair:              { label: "Repair",              color: "bg-warning/8 text-warning border-warning/20", dot: "bg-warning" },
  upgrade:             { label: "Upgrade",             color: "bg-muted text-foreground border-border", dot: "bg-accent" },
  inspection:          { label: "Inspection",          color: "bg-success/10 text-success border-success/30", dot: "bg-success" },
  warranty_claim:      { label: "Warranty Claim",      color: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive" },
};

function fmtDate(d: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", opts ?? { month: "long", day: "numeric", year: "numeric" });
}

function warrantyInfo(expiry: string | null) {
  if (!expiry) return { label: "No warranty on file", color: "text-muted-foreground", Icon: ShieldX, alert: false };
  const now = new Date();
  const exp = new Date(expiry);
  const daysLeft = Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: `Expired ${Math.abs(Math.floor(daysLeft / 30))} months ago`, color: "text-destructive", Icon: ShieldX, alert: true };
  if (daysLeft <= 60) return { label: `Expiring in ${daysLeft} days (${fmtDate(expiry, { month: "short", day: "numeric", year: "numeric" })})`, color: "text-warning", Icon: ShieldAlert, alert: true };
  return { label: `Valid until ${fmtDate(expiry, { month: "long", year: "numeric" })}`, color: "text-success", Icon: ShieldCheck, alert: false };
}

function maintenanceInfo(next: string | null) {
  if (!next) return { label: "Not scheduled", urgent: false };
  const daysLeft = Math.round((new Date(next).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: `Overdue by ${Math.abs(daysLeft)} days`, urgent: true };
  if (daysLeft <= 14) return { label: `Due in ${daysLeft} days`, urgent: true };
  return { label: `Due ${fmtDate(next, { month: "short", day: "numeric", year: "numeric" })}`, urgent: false };
}

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useGetEquipmentById(id);
  const item = data as EquipmentDetail | undefined;

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
    <div className="max-w-3xl mx-auto text-center py-20 text-muted-foreground">Equipment not found</div>
  );

  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.active!;
  const warranty = warrantyInfo(item.warrantyExpiration ?? null);
  const WarrantyIcon = warranty.Icon;
  const maintenance = maintenanceInfo(item.nextMaintenanceDate ?? null);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/equipment">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
            <ArrowLeft className="w-4 h-4" />
            My Equipment
          </Button>
        </Link>
      </div>

      {/* Main Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{item.productModel}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                Serial: {item.serialNumber}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Purchased</p>
                  <p className="text-sm font-medium text-foreground">{fmtDate(item.purchaseDate)}</p>
                </div>
                {item.purchasePrice && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Purchase Price</p>
                    <p className="text-sm font-medium text-foreground">${Number(item.purchasePrice).toLocaleString()}</p>
                  </div>
                )}
                {item.vendorName && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Vendor</p>
                    <p className="text-sm font-medium text-foreground">{item.vendorName}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warranty & Maintenance Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className={warranty.alert ? "border-warning/20 bg-warning/5" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <WarrantyIcon className={`w-4 h-4 ${warranty.color}`} />
              <p className="text-sm font-semibold text-foreground">Warranty</p>
            </div>
            <p className={`text-sm font-medium ${warranty.color}`}>{warranty.label}</p>
            {item.warrantyExpiration && (
              <p className="text-xs text-muted-foreground mt-0.5">Expiry: {fmtDate(item.warrantyExpiration)}</p>
            )}
          </CardContent>
        </Card>
        <Card className={maintenance.urgent ? "border-warning/20 bg-warning/5" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wrench className={`w-4 h-4 ${maintenance.urgent ? "text-warning" : "text-muted-foreground"}`} />
              <p className="text-sm font-semibold text-foreground">Maintenance</p>
            </div>
            <p className={`text-sm font-medium ${maintenance.urgent ? "text-warning" : "text-foreground"}`}>{maintenance.label}</p>
            {item.lastMaintenanceDate && (
              <p className="text-xs text-muted-foreground mt-0.5">Last: {fmtDate(item.lastMaintenanceDate, { month: "short", day: "numeric", year: "numeric" })}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Notes */}
      {item.maintenanceNotes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              Maintenance Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.maintenanceNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Service History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Service History
            </CardTitle>
            <span className="text-xs text-muted-foreground">{item.serviceHistory?.length ?? 0} records</span>
          </div>
        </CardHeader>
        <CardContent>
          {(!item.serviceHistory || item.serviceHistory.length === 0) ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No service records yet</div>
          ) : (
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-muted" />
              <div className="space-y-5">
                {item.serviceHistory.map((record, i) => {
                  const cfg = SERVICE_TYPE_CONFIG[record.serviceType] ?? SERVICE_TYPE_CONFIG.inspection!;
                  return (
                    <div key={record.id} className="flex gap-4">
                      <div className={`w-3.5 h-3.5 rounded-full ${cfg.dot} mt-1.5 shrink-0 ring-2 ring-white z-10`} />
                      <div className="flex-1 min-w-0 pb-4 border-b border-border last:border-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                              {cfg.label}
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
                            Next scheduled: {fmtDate(record.nextServiceDate, { month: "short", day: "numeric", year: "numeric" })}
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
