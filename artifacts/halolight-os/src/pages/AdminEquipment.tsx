import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useGetAdminEquipment, useGetAdminConsumables } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Wrench, AlertTriangle, ShieldX, ShieldAlert, ShieldCheck,
  CheckCircle2, Search, BarChart3,
  TrendingDown, ChevronRight, Clock,
} from "lucide-react";
import { PageHeader, Section, StatGrid } from "@/components/page";
import { cn } from "@/lib/utils";

type AdminEquipmentItem = {
  id: string; userId: string; productModel: string; serialNumber: string;
  purchaseDate: string | null; warrantyExpiration: string | null; status: string;
  maintenanceNotes: string | null; lastMaintenanceDate: string | null; nextMaintenanceDate: string | null;
  purchasePrice: string | null; vendorName: string | null; ownerName: string; ownerEmail: string;
  ownerCompany: string; warrantyExpired: boolean; warrantyExpiringSoon: boolean;
  maintenanceOverdue: boolean; maintenanceDueSoon: boolean;
};

type AdminConsumableItem = {
  id: string; userId: string; name: string; sku: string; category: string; unitType: string;
  unitPrice: string; reorderThreshold: number; currentQuantity: number; daysRemaining: number | null;
  ownerName: string; ownerEmail: string; ownerCompany: string; isLow: boolean; isCritical: boolean;
  reorderRecommended: boolean;
};

const STATUS_DOT: Record<string, string> = {
  active:     "bg-success",
  inactive:   "bg-muted-foreground/50",
  in_service: "bg-info",
  retired:    "bg-destructive",
};

/** Libellé sobre : point de couleur + texte. */
function DotLabel({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="gap-1.5 text-xs font-normal text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </Badge>
  );
}

const TH = "px-4 py-2.5 text-[13px] font-normal text-muted-foreground";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminEquipment() {
  const { t } = useTranslation();
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

  const criticalConsumables = consumables.filter(c => c.isCritical);
  const lowConsumables = consumables.filter(c => c.isLow && !c.isCritical);

  const alertCounts = {
    warrantyExpired:    equipment.filter(e => e.warrantyExpired).length,
    warrantySoon:       equipment.filter(e => e.warrantyExpiringSoon).length,
    maintenanceOverdue: equipment.filter(e => e.maintenanceOverdue).length,
    maintenanceDue:     equipment.filter(e => e.maintenanceDueSoon).length,
  };

  const statusLabels: Record<string, string> = {
    active:     t("admin_equipment.status_active"),
    inactive:   t("admin_equipment.status_inactive"),
    in_service: t("admin_equipment.status_in_service"),
    retired:    t("admin_equipment.status_retired"),
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("admin_equipment.title")}
        description={t("admin_equipment.subtitle")}
        actions={
          <Link href="/admin/analytics">
            <Button variant="outline" size="sm" className="gap-2">
              <BarChart3 className="w-4 h-4 stroke-[1.75]" />
              {t("admin_equipment.analytics_btn")}
            </Button>
          </Link>
        }
      />

      <div className="flex gap-1 border-b border-border">
        {([
          { key: "equipment",   labelKey: "admin_equipment.tab_equipment",   count: equipment.length,   alert: false },
          { key: "consumables", labelKey: "admin_equipment.tab_consumables", count: criticalConsumables.length + lowConsumables.length, alert: criticalConsumables.length + lowConsumables.length > 0 },
        ] as { key: "equipment" | "consumables"; labelKey: string; count: number; alert: boolean }[]).map(tabItem => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`-mb-px px-3 py-2 text-sm transition-colors flex items-center gap-1.5 border-b-2 ${tab === tabItem.key ? "border-foreground text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t(tabItem.labelKey as Parameters<typeof t>[0])}
            {tabItem.alert ? (
              <span className="flex items-center gap-1 text-xs tabular-nums text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />{tabItem.count}</span>
            ) : (
              <span className="text-xs tabular-nums text-muted-foreground">({tabItem.count})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "equipment" && (
        <>
          <StatGrid className="md:grid-cols-4">
            {[
              { label: t("admin_equipment.alert_warranty_expired"),   value: alertCounts.warrantyExpired,    dot: "bg-destructive", filter: "warranty_expired" },
              { label: t("admin_equipment.alert_warranty_soon"),      value: alertCounts.warrantySoon,       dot: "bg-warning",     filter: "warranty_soon" },
              { label: t("admin_equipment.alert_maintenance_overdue"),value: alertCounts.maintenanceOverdue, dot: "bg-destructive", filter: "maintenance_overdue" },
              { label: t("admin_equipment.alert_service_due"),        value: alertCounts.maintenanceDue,     dot: "bg-warning",     filter: "maintenance_due" },
            ].map(s => (
              <button
                key={s.label}
                onClick={() => setAlertFilter(alertFilter === s.filter ? "all" : s.filter)}
                className={cn(
                  "relative flex flex-col justify-between gap-4 p-5 min-h-[116px] text-left shadow-[1px_1px_0_0_hsl(var(--border))] transition-colors hover:bg-muted/50",
                  alertFilter === s.filter && "bg-muted/60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("text-[13px] leading-snug", alertFilter === s.filter ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                  {s.value > 0 && <span className={cn("h-1.5 w-1.5 rounded-full mt-1.5 shrink-0", s.dot)} />}
                </div>
                <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", s.value > 0 ? "text-foreground" : "text-muted-foreground")}>{s.value}</p>
              </button>
            ))}
          </StatGrid>

          <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48 max-w-72">
              <Search className="w-4 h-4 stroke-[1.75] absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin_equipment.search_placeholder")}
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
              <option value="all">{t("admin_equipment.all_models")}</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              className="h-9 px-3 rounded-md border border-border text-sm bg-card text-foreground"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">{t("admin_equipment.all_statuses")}</option>
              <option value="active">{t("admin_equipment.status_active")}</option>
              <option value="in_service">{t("admin_equipment.status_in_service")}</option>
              <option value="inactive">{t("admin_equipment.status_inactive")}</option>
              <option value="retired">{t("admin_equipment.status_retired")}</option>
            </select>
            {(search || modelFilter !== "all" || statusFilter !== "all" || alertFilter !== "all") && (
              <Button variant="ghost" size="sm" className="text-xs h-9" onClick={() => { setSearch(""); setModelFilter("all"); setStatusFilter("all"); setAlertFilter("all"); }}>
                {t("admin_equipment.clear_filters")}
              </Button>
            )}
            <span className="text-[13px] tabular-nums text-muted-foreground ml-auto">{t("admin_equipment.units_count", { filtered: filtered.length, total: equipment.length })}</span>
          </div>

          {equipLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={`text-left ${TH}`}>{t("admin_equipment.col_unit")}</th>
                        <th className={`text-left ${TH} hidden md:table-cell`}>{t("admin_equipment.col_client")}</th>
                        <th className={`text-center ${TH}`}>{t("admin_equipment.col_status")}</th>
                        <th className={`text-left ${TH} hidden lg:table-cell`}>{t("admin_equipment.col_warranty")}</th>
                        <th className={`text-left ${TH} hidden lg:table-cell`}>{t("admin_equipment.col_next_service")}</th>
                        <th className={`text-center ${TH}`}>{t("admin_equipment.col_alerts")}</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(item => {
                        const statusDot = STATUS_DOT[item.status] ?? STATUS_DOT.active!;
                        const hasAlert = item.warrantyExpired || item.warrantyExpiringSoon || item.maintenanceOverdue || item.maintenanceDueSoon;
                        return (
                          <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{item.productModel}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{t("admin_equipment.serial_prefix")} {item.serialNumber}</p>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <p className="text-sm text-foreground">{item.ownerName}</p>
                              <p className="text-xs text-muted-foreground">{item.ownerCompany || item.ownerEmail}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <DotLabel dot={statusDot}>
                                {statusLabels[item.status] ?? item.status}
                              </DotLabel>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {item.warrantyExpired ? (
                                <span className="text-xs text-destructive flex items-center gap-1"><ShieldX className="w-3 h-3 stroke-[1.75]" />{t("admin_equipment.warranty_expired_label")}</span>
                              ) : item.warrantyExpiringSoon ? (
                                <span className="text-xs text-warning flex items-center gap-1 tabular-nums"><ShieldAlert className="w-3 h-3 stroke-[1.75]" />{fmtDate(item.warrantyExpiration)}</span>
                              ) : item.warrantyExpiration ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 tabular-nums"><ShieldCheck className="w-3 h-3 stroke-[1.75] text-success" />{fmtDate(item.warrantyExpiration)}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              {item.maintenanceOverdue ? (
                                <span className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3 stroke-[1.75]" />{t("admin_equipment.maintenance_overdue_label")}</span>
                              ) : item.maintenanceDueSoon ? (
                                <span className="text-xs text-warning flex items-center gap-1 tabular-nums"><Clock className="w-3 h-3 stroke-[1.75]" />{fmtDate(item.nextMaintenanceDate)}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(item.nextMaintenanceDate)}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {hasAlert ? (
                                <div className="flex justify-center gap-1.5">
                                  {(item.warrantyExpired || item.warrantyExpiringSoon) && (
                                    <span className="inline-flex" title={t("admin_equipment.warranty_alert_title")}>
                                      <ShieldAlert className="w-4 h-4 stroke-[1.75] text-warning" />
                                    </span>
                                  )}
                                  {(item.maintenanceOverdue || item.maintenanceDueSoon) && (
                                    <span className="inline-flex" title={t("admin_equipment.maintenance_alert_title")}>
                                      <Wrench className="w-4 h-4 stroke-[1.75] text-warning" />
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <CheckCircle2 className="w-4 h-4 stroke-[1.75] text-success mx-auto" />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground/60" />
                            </td>
                          </tr>
                        );
                      })}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-muted-foreground text-sm">{t("admin_equipment.no_match")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
            </div>
          )}
          </div>
        </>
      )}

      {tab === "consumables" && (
        <>
          {(criticalConsumables.length > 0 || lowConsumables.length > 0) && (
            <ul className="rounded-xl border border-border bg-card divide-y divide-border">
              {criticalConsumables.map(c => (
                <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 stroke-[1.75] text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t("admin_equipment.out_of_stock", { name: c.name })}</p>
                    <p className="text-[13px] text-muted-foreground">{c.ownerName} ({c.ownerCompany}) — 0 {c.unitType} remaining</p>
                  </div>
                  <DotLabel dot="bg-destructive">{t("admin_equipment.critical_badge")}</DotLabel>
                </li>
              ))}
              {lowConsumables.map(c => (
                <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <TrendingDown className="w-4 h-4 stroke-[1.75] text-warning shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t("admin_equipment.low_stock", { name: c.name })}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {c.ownerName} ({c.ownerCompany}) — {c.currentQuantity} {c.unitType} left
                      {c.daysRemaining !== null ? ` (~${c.daysRemaining} days)` : ""}
                    </p>
                  </div>
                  <DotLabel dot="bg-warning">{t("admin_equipment.status_low")}</DotLabel>
                </li>
              ))}
            </ul>
          )}

          <Section title={t("admin_equipment.consumable_stock_title")}>
              {consumLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}</div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={`text-left ${TH}`}>{t("admin_equipment.col_item")}</th>
                        <th className={`text-left ${TH} hidden md:table-cell`}>{t("admin_equipment.col_client")}</th>
                        <th className={`text-center ${TH}`}>{t("admin_equipment.col_stock")}</th>
                        <th className={`text-center ${TH} hidden sm:table-cell`}>{t("admin_equipment.col_days")}</th>
                        <th className={`text-center ${TH}`}>{t("admin_equipment.col_status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {consumables.map(c => (
                        <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.sku}</p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <p className="text-sm text-foreground">{c.ownerName}</p>
                            <p className="text-xs text-muted-foreground">{c.ownerCompany}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-medium tabular-nums ${c.isCritical ? "text-destructive" : c.isLow ? "text-warning" : "text-foreground"}`}>
                              {c.currentQuantity}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">{c.unitType}</span>
                          </td>
                          <td className="px-4 py-3 text-center hidden sm:table-cell text-xs tabular-nums text-muted-foreground">
                            {c.daysRemaining !== null ? `~${c.daysRemaining}d` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.isCritical ? (
                              <DotLabel dot="bg-destructive">{t("admin_equipment.status_critical")}</DotLabel>
                            ) : c.isLow ? (
                              <DotLabel dot="bg-warning">{t("admin_equipment.status_low")}</DotLabel>
                            ) : (
                              <DotLabel dot="bg-success">{t("admin_equipment.status_ok")}</DotLabel>
                            )}
                          </td>
                        </tr>
                      ))}
                      {consumables.length === 0 && (
                        <tr><td colSpan={5} className="py-10 text-center text-muted-foreground text-sm">{t("admin_equipment.no_consumables")}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
          </Section>
        </>
      )}
    </div>
  );
}
