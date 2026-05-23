import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useGetAdminEquipment, useGetAdminConsumables } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Monitor, Wrench, AlertTriangle, ShieldX, ShieldAlert, ShieldCheck,
  Package, CheckCircle2, Search, Filter, BarChart3, Users,
  TrendingDown, RotateCcw, ChevronRight, Clock, Layers,
} from "lucide-react";

type AdminEquipmentItem = {
  id: string;
  userId: string;
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
  ownerName: string;
  ownerEmail: string;
  ownerCompany: string;
  warrantyExpired: boolean;
  warrantyExpiringSoon: boolean;
  maintenanceOverdue: boolean;
  maintenanceDueSoon: boolean;
};

type AdminConsumableItem = {
  id: string;
  userId: string;
  name: string;
  sku: string;
  category: string;
  unitType: string;
  unitPrice: string;
  reorderThreshold: number;
  currentQuantity: number;
  daysRemaining: number | null;
  ownerName: string;
  ownerEmail: string;
  ownerCompany: string;
  isLow: boolean;
  isCritical: boolean;
  reorderRecommended: boolean;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:     { label: "Active",     color: "bg-success/15 text-success" },
  inactive:   { label: "Inactive",   color: "bg-muted text-muted-foreground" },
  in_service: { label: "In Service", color: "bg-info/15 text-info" },
  retired:    { label: "Retired",    color: "bg-destructive/15 text-destructive" },
};

const MODEL_COLORS: Record<string, string> = {
  "HaloLight Pro 2":       "bg-info/15 text-info",
  "HaloLight Elite":       "bg-muted text-foreground",
  "HaloLight Open Air":    "bg-success/15 text-success",
  "HaloLight Studio 360":  "bg-warning/15 text-warning",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminEquipment() {
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [alertFilter, setAlertFilter] = useState<string>("all");
  const [tab, setTab] = useState<"equipment" | "consumables">("equipment");

  const { data: equipData = [], isLoading: equipLoading } = useGetAdminEquipment();
  const { data: consumData = [], isLoading: consumLoading } = useGetAdminConsumables();

  const equipment = equipData as AdminEquipmentItem[];
  const consumables = consumData as AdminConsumableItem[];

  const models = useMemo(() => Array.from(new Set(equipment.map(e => e.productModel))).sort(), [equipment]);

  const filtered = useMemo(() => {
    return equipment.filter(e => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.ownerName.toLowerCase().includes(q) && !e.ownerCompany.toLowerCase().includes(q) &&
            !e.productModel.toLowerCase().includes(q) && !e.serialNumber.toLowerCase().includes(q)) return false;
      }
      if (modelFilter !== "all" && e.productModel !== modelFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (alertFilter === "warranty_expired" && !e.warrantyExpired) return false;
      if (alertFilter === "warranty_soon" && !e.warrantyExpiringSoon) return false;
      if (alertFilter === "maintenance_overdue" && !e.maintenanceOverdue) return false;
      if (alertFilter === "maintenance_due" && !e.maintenanceDueSoon) return false;
      if (alertFilter === "any_alert" && !e.warrantyExpired && !e.warrantyExpiringSoon && !e.maintenanceOverdue && !e.maintenanceDueSoon) return false;
      return true;
    });
  }, [equipment, search, modelFilter, statusFilter, alertFilter]);

  // Consumable alerts
  const criticalConsumables = consumables.filter(c => c.isCritical);
  const lowConsumables = consumables.filter(c => c.isLow && !c.isCritical);

  // Equipment alert counts
  const alertCounts = {
    warrantyExpired:   equipment.filter(e => e.warrantyExpired).length,
    warrantySoon:      equipment.filter(e => e.warrantyExpiringSoon).length,
    maintenanceOverdue:equipment.filter(e => e.maintenanceOverdue).length,
    maintenanceDue:    equipment.filter(e => e.maintenanceDueSoon).length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipment Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All client photobooths, warranties, and consumable stock</p>
        </div>
        <Link href="/admin/analytics">
          <Button variant="outline" size="sm" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </Button>
        </Link>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {([
          { key: "equipment",   label: "Equipment",   count: equipment.length,   alert: false },
          { key: "consumables", label: "Consumables", count: criticalConsumables.length + lowConsumables.length, alert: criticalConsumables.length + lowConsumables.length > 0 },
        ] as { key: "equipment" | "consumables"; label: string; count: number; alert: boolean }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${tab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            {t.alert ? (
              <span className="w-4 h-4 bg-warning text-foreground rounded-full text-xs flex items-center justify-center">{t.count}</span>
            ) : (
              <span className="text-xs text-muted-foreground">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "equipment" && (
        <>
          {/* Alert Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Warranty Expired",   value: alertCounts.warrantyExpired,    color: "text-destructive",   bg: "bg-destructive/10 border-destructive/30",    filter: "warranty_expired" },
              { label: "Warranty Expiring",  value: alertCounts.warrantySoon,       color: "text-warning", bg: "bg-warning/8 border-warning/30", filter: "warranty_soon" },
              { label: "Maintenance Overdue",value: alertCounts.maintenanceOverdue, color: "text-destructive",   bg: "bg-destructive/10 border-destructive/30",    filter: "maintenance_overdue" },
              { label: "Service Due Soon",   value: alertCounts.maintenanceDue,     color: "text-warning", bg: "bg-warning/8 border-warning/30", filter: "maintenance_due" },
            ].map(s => (
              <button
                key={s.label}
                onClick={() => setAlertFilter(alertFilter === s.filter ? "all" : s.filter)}
                className={`rounded-xl border p-4 text-left transition-all ${s.value > 0 ? s.bg : "bg-card border-border opacity-50"} ${alertFilter === s.filter ? "ring-2 ring-primary/40" : ""}`}
              >
                <p className={`text-2xl font-bold ${s.value > 0 ? s.color : "text-muted-foreground"}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48 max-w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search clients, model, serial..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <select
              className="h-9 px-3 rounded-md border border-border text-sm bg-card text-foreground"
              value={modelFilter}
              onChange={e => setModelFilter(e.target.value)}
            >
              <option value="all">All Models</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              className="h-9 px-3 rounded-md border border-border text-sm bg-card text-foreground"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="in_service">In Service</option>
              <option value="inactive">Inactive</option>
              <option value="retired">Retired</option>
            </select>
            {(search || modelFilter !== "all" || statusFilter !== "all" || alertFilter !== "all") && (
              <Button variant="ghost" size="sm" className="text-xs h-9" onClick={() => { setSearch(""); setModelFilter("all"); setStatusFilter("all"); setAlertFilter("all"); }}>
                Clear filters
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {equipment.length} units</span>
          </div>

          {/* Equipment Table */}
          {equipLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Client</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Warranty</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Next Service</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Alerts</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map(item => {
                        const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.active!;
                        const modelColor = MODEL_COLORS[item.productModel] ?? "bg-muted text-foreground";
                        const hasAlert = item.warrantyExpired || item.warrantyExpiringSoon || item.maintenanceOverdue || item.maintenanceDueSoon;
                        return (
                          <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <Monitor className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${modelColor}`}>{item.productModel}</span>
                                  <p className="text-xs text-muted-foreground mt-0.5">S/N: {item.serialNumber}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <p className="font-medium text-foreground text-sm">{item.ownerName}</p>
                              <p className="text-xs text-muted-foreground">{item.ownerCompany || item.ownerEmail}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {item.warrantyExpired ? (
                                <span className="text-xs text-destructive flex items-center gap-1"><ShieldX className="w-3 h-3" />Expired</span>
                              ) : item.warrantyExpiringSoon ? (
                                <span className="text-xs text-warning flex items-center gap-1"><ShieldAlert className="w-3 h-3" />{fmtDate(item.warrantyExpiration)}</span>
                              ) : item.warrantyExpiration ? (
                                <span className="text-xs text-success flex items-center gap-1"><ShieldCheck className="w-3 h-3" />{fmtDate(item.warrantyExpiration)}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {item.maintenanceOverdue ? (
                                <span className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Overdue</span>
                              ) : item.maintenanceDueSoon ? (
                                <span className="text-xs text-warning flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(item.nextMaintenanceDate)}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">{fmtDate(item.nextMaintenanceDate)}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {hasAlert ? (
                                <div className="flex justify-center gap-1">
                                  {(item.warrantyExpired || item.warrantyExpiringSoon) && (
                                    <div className="w-5 h-5 bg-warning/15 rounded-full flex items-center justify-center" title="Warranty alert">
                                      <ShieldAlert className="w-3 h-3 text-warning" />
                                    </div>
                                  )}
                                  {(item.maintenanceOverdue || item.maintenanceDueSoon) && (
                                    <div className="w-5 h-5 bg-warning/15 rounded-full flex items-center justify-center" title="Maintenance alert">
                                      <Wrench className="w-3 h-3 text-warning" />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-success mx-auto" />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </td>
                          </tr>
                        );
                      })}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-muted-foreground text-sm">No equipment matches your filters</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab === "consumables" && (
        <>
          {/* Consumable Alert Cards */}
          {(criticalConsumables.length > 0 || lowConsumables.length > 0) && (
            <div className="space-y-3">
              {criticalConsumables.map(c => (
                <div key={c.id} className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-destructive">Out of stock: {c.name}</p>
                    <p className="text-xs text-destructive">{c.ownerName} ({c.ownerCompany}) — 0 {c.unitType} remaining</p>
                  </div>
                  <span className="text-xs bg-destructive/15 text-destructive px-2 py-0.5 rounded-full font-medium">Critical</span>
                </div>
              ))}
              {lowConsumables.map(c => (
                <div key={c.id} className="bg-warning/8 border border-warning/30 rounded-xl p-4 flex items-center gap-3">
                  <TrendingDown className="w-5 h-5 text-warning shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-warning">Low stock: {c.name}</p>
                    <p className="text-xs text-warning">
                      {c.ownerName} ({c.ownerCompany}) — {c.currentQuantity} {c.unitType} left
                      {c.daysRemaining !== null ? ` (~${c.daysRemaining} days)` : ""}
                    </p>
                  </div>
                  <span className="text-xs bg-warning/15 text-warning px-2 py-0.5 rounded-full font-medium">Low</span>
                </div>
              ))}
            </div>
          )}

          {/* Consumables Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                All Client Consumable Stock
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {consumLoading ? (
                <div className="p-6 space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Client</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stock</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Days Left</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {consumables.map(c => (
                        <tr key={c.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.sku}</p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <p className="text-sm text-foreground">{c.ownerName}</p>
                            <p className="text-xs text-muted-foreground">{c.ownerCompany}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-bold ${c.isCritical ? "text-destructive" : c.isLow ? "text-warning" : "text-foreground"}`}>
                              {c.currentQuantity}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">{c.unitType}</span>
                          </td>
                          <td className="px-4 py-3 text-center hidden sm:table-cell text-xs text-muted-foreground">
                            {c.daysRemaining !== null ? `~${c.daysRemaining}d` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.isCritical ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">Out of Stock</span>
                            ) : c.isLow ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning font-medium">Low</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success font-medium">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {consumables.length === 0 && (
                        <tr><td colSpan={5} className="py-10 text-center text-muted-foreground text-sm">No consumable stock data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
