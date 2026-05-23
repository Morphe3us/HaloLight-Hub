import { useState } from "react";
import { Link } from "wouter";
import { useGetEquipment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Monitor, Wrench, AlertTriangle, CheckCircle2, Clock,
  ChevronRight, Package, CalendarClock, ShieldCheck, ShieldAlert,
  ShieldX, Plus, Info,
} from "lucide-react";

type EquipmentItem = {
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
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{className?: string}> }> = {
  active:     { label: "Active",      color: "bg-success/15 text-success",  icon: CheckCircle2 },
  inactive:   { label: "Inactive",    color: "bg-muted text-muted-foreground",    icon: Package },
  in_service: { label: "In Service",  color: "bg-info/15 text-info",    icon: Wrench },
  retired:    { label: "Retired",     color: "bg-destructive/15 text-destructive",      icon: AlertTriangle },
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  routine_maintenance: "Routine Maintenance",
  repair: "Repair",
  upgrade: "Upgrade",
  inspection: "Inspection",
  warranty_claim: "Warranty Claim",
};

function warrantyStatus(expiry: string | null): { label: string; color: string; icon: React.ComponentType<{className?: string}> } {
  if (!expiry) return { label: "No Warranty", color: "text-muted-foreground", icon: ShieldX };
  const now = new Date();
  const exp = new Date(expiry);
  const daysLeft = Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: "Expired", color: "text-destructive", icon: ShieldX };
  if (daysLeft <= 60) return { label: `Expires in ${daysLeft}d`, color: "text-warning", icon: ShieldAlert };
  return { label: `${Math.floor(daysLeft / 30)}mo left`, color: "text-success", icon: ShieldCheck };
}

function maintenanceStatus(next: string | null): { label: string; urgent: boolean } {
  if (!next) return { label: "Not scheduled", urgent: false };
  const now = new Date();
  const d = new Date(next);
  const daysLeft = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: `Overdue ${Math.abs(daysLeft)}d`, urgent: true };
  if (daysLeft <= 30) return { label: `Due in ${daysLeft}d`, urgent: true };
  return { label: `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, urgent: false };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Equipment() {
  const { data = [], isLoading } = useGetEquipment();
  const items = data as EquipmentItem[];

  const alerts = items.filter(eq => {
    const w = warrantyStatus(eq.warrantyExpiration ?? null);
    const m = maintenanceStatus(eq.nextMaintenanceDate ?? null);
    return w.label === "Expired" || w.color === "text-warning" || m.urgent;
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-56 bg-border rounded animate-pulse" />
        {[1,2,3].map(i => <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Equipment</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your photobooth units, warranties, and service history</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" disabled>
          <Plus className="w-4 h-4" />
          Register Equipment
        </Button>
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="bg-warning/8 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning">{alerts.length} item{alerts.length > 1 ? "s" : ""} need{alerts.length === 1 ? "s" : ""} attention</p>
            <p className="text-xs text-warning mt-0.5">
              {alerts.map(a => a.productModel).join(", ")} — check warranty or maintenance status below
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Units", value: items.length, color: "text-foreground" },
            { label: "Active", value: items.filter(e => e.status === "active").length, color: "text-success" },
            { label: "In Service", value: items.filter(e => e.status === "in_service").length, color: "text-info" },
            { label: "Alerts", value: alerts.length, color: "text-warning" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Equipment List */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Monitor className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No equipment registered yet</p>
            <p className="text-sm text-muted-foreground mt-1">Your photobooth units will appear here once registered</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.active!;
            const StatusIcon = statusCfg.icon;
            const w = warrantyStatus(item.warrantyExpiration ?? null);
            const WarrantyIcon = w.icon;
            const m = maintenanceStatus(item.nextMaintenanceDate ?? null);

            return (
              <Link key={item.id} href={`/equipment/${item.id}`}>
                <Card className="hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Monitor className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground text-base">{item.productModel}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusCfg.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusCfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">S/N: {item.serialNumber}</p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Purchased</p>
                            <p className="text-xs font-medium text-foreground">{fmtDate(item.purchaseDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Warranty</p>
                            <p className={`text-xs font-medium flex items-center gap-1 ${w.color}`}>
                              <WarrantyIcon className="w-3 h-3" />
                              {w.label}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Last Service</p>
                            <p className="text-xs font-medium text-foreground">{fmtDate(item.lastMaintenanceDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Next Service</p>
                            <p className={`text-xs font-medium flex items-center gap-1 ${m.urgent ? "text-warning" : "text-foreground"}`}>
                              {m.urgent && <AlertTriangle className="w-3 h-3" />}
                              {m.label}
                            </p>
                          </div>
                        </div>

                        {item.maintenanceNotes && (
                          <div className="mt-3 bg-muted rounded-lg px-3 py-2 flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground line-clamp-2">{item.maintenanceNotes}</p>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
