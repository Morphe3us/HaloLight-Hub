import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useGetEquipment, useCreateEquipment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Monitor, Wrench, AlertTriangle, CheckCircle2, Clock,
  ChevronRight, Package, ShieldCheck, ShieldAlert,
  ShieldX, Plus, Info, Loader2,
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

type TFn = (key: string, opts?: Record<string, unknown>) => string;

const STATUS_CONFIG: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  active:     { color: "bg-success/15 text-success",          icon: CheckCircle2 },
  inactive:   { color: "bg-muted text-muted-foreground",      icon: Package },
  in_service: { color: "bg-info/15 text-info",               icon: Wrench },
  retired:    { color: "bg-destructive/15 text-destructive",  icon: AlertTriangle },
};

function warrantyStatus(expiry: string | null, t: TFn): { label: string; color: string; icon: React.ComponentType<{ className?: string }> } {
  if (!expiry) return { label: t("equipment.no_warranty_label"), color: "text-muted-foreground", icon: ShieldX };
  const now = new Date();
  const exp = new Date(expiry);
  const daysLeft = Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: t("equipment.expired_label"), color: "text-destructive", icon: ShieldX };
  if (daysLeft <= 60) return { label: t("equipment.expires_in", { days: daysLeft }), color: "text-warning", icon: ShieldAlert };
  return { label: t("equipment.months_left", { months: Math.floor(daysLeft / 30) }), color: "text-success", icon: ShieldCheck };
}

function maintenanceStatus(next: string | null, t: TFn): { label: string; urgent: boolean } {
  if (!next) return { label: t("equipment.not_scheduled"), urgent: false };
  const now = new Date();
  const d = new Date(next);
  const daysLeft = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: t("equipment.overdue_days", { days: Math.abs(daysLeft) }), urgent: true };
  if (daysLeft <= 30) return { label: t("equipment.due_in_days", { days: daysLeft }), urgent: true };
  return { label: t("equipment.due_date", { date: d.toLocaleDateString() }), urgent: false };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const EMPTY_FORM = {
  productModel: "",
  serialNumber: "",
  purchaseDate: "",
  warrantyExpiration: "",
  vendorName: "",
  purchasePrice: "",
  maintenanceNotes: "",
  status: "active",
};

function RegisterModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);

  const { mutate: create, isPending } = useCreateEquipment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/equipment"] });
        toast({ title: t("equipment.registered_success"), description: t("equipment.registered_success_desc", { model: form.productModel }) });
        setForm(EMPTY_FORM);
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? t("equipment.register_failed");
        toast({ title: t("equipment.register_failed"), description: msg, variant: "destructive" });
      },
    },
  });

  const set = (k: keyof typeof EMPTY_FORM) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productModel.trim() || !form.serialNumber.trim()) return;
    create({
      data: {
        productModel: form.productModel.trim(),
        serialNumber: form.serialNumber.trim(),
        purchaseDate: form.purchaseDate || null,
        warrantyExpiration: form.warrantyExpiration || null,
        vendorName: form.vendorName.trim() || null,
        purchasePrice: form.purchasePrice.trim() || null,
        maintenanceNotes: form.maintenanceNotes.trim() || null,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("equipment.register_equipment", { defaultValue: "Register Equipment" })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="productModel">{t("equipment.model_label")} <span className="text-destructive">*</span></Label>
              <Input
                id="productModel"
                placeholder="e.g. HaloLight Pro X1"
                value={form.productModel}
                onChange={(e) => set("productModel")(e.target.value)}
                required
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="serialNumber">{t("equipment.serial_label")} <span className="text-destructive">*</span></Label>
              <Input
                id="serialNumber"
                placeholder="e.g. SN-20240001"
                value={form.serialNumber}
                onChange={(e) => set("serialNumber")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchaseDate">{t("equipment.purchase_date_label")}</Label>
              <Input
                id="purchaseDate"
                type="date"
                value={form.purchaseDate}
                onChange={(e) => set("purchaseDate")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="warrantyExpiration">{t("equipment.warranty_expiry_label")}</Label>
              <Input
                id="warrantyExpiration"
                type="date"
                value={form.warrantyExpiration}
                onChange={(e) => set("warrantyExpiration")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendorName">{t("equipment.vendor_label")}</Label>
              <Input
                id="vendorName"
                placeholder="e.g. HaloLight Direct"
                value={form.vendorName}
                onChange={(e) => set("vendorName")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchasePrice">{t("equipment.price_label")}</Label>
              <Input
                id="purchasePrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.purchasePrice}
                onChange={(e) => set("purchasePrice")(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="maintenanceNotes">{t("equipment.maintenance_notes_label")}</Label>
              <Textarea
                id="maintenanceNotes"
                placeholder="Any notes about this unit…"
                rows={2}
                value={form.maintenanceNotes}
                onChange={(e) => set("maintenanceNotes")(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.productModel.trim() || !form.serialNumber.trim()}
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t("equipment.registering")}</>
                : t("equipment.register_equipment", { defaultValue: "Register Equipment" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Equipment() {
  const { t } = useTranslation();
  const { data = [], isLoading } = useGetEquipment();
  const items = data as EquipmentItem[];
  const [registerOpen, setRegisterOpen] = useState(false);

  const alerts = items.filter(eq => {
    const w = warrantyStatus(eq.warrantyExpiration ?? null, t);
    const m = maintenanceStatus(eq.nextMaintenanceDate ?? null, t);
    return w.label === t("equipment.expired_label") || w.color === "text-warning" || m.urgent;
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-56 bg-border rounded animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("equipment.my_equipment")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("equipment.track_subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRegisterOpen(true)}>
          <Plus className="w-4 h-4" />
          {t("equipment.register_equipment", { defaultValue: "Register Equipment" })}
        </Button>
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="bg-warning/8 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning">
              {t("equipment.alert_banner", { count: alerts.length })}
            </p>
            <p className="text-xs text-warning mt-0.5">
              {alerts.map(a => a.productModel).join(", ")} — {t("equipment.check_status")}
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t("equipment.total_units"),      value: items.length,                                         color: "text-foreground" },
            { label: t("equipment.status_active"),    value: items.filter(e => e.status === "active").length,      color: "text-success" },
            { label: t("equipment.status_in_service"), value: items.filter(e => e.status === "in_service").length, color: "text-info" },
            { label: t("equipment.alerts"),           value: alerts.length,                                         color: "text-warning" },
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
            <p className="text-muted-foreground font-medium">{t("equipment.no_equipment_empty")}</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">{t("equipment.no_equipment_desc")}</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRegisterOpen(true)}>
              <Plus className="w-4 h-4" />
              {t("equipment.register_first_unit")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.active!;
            const StatusIcon = statusCfg.icon;
            const w = warrantyStatus(item.warrantyExpiration ?? null, t);
            const WarrantyIcon = w.icon;
            const m = maintenanceStatus(item.nextMaintenanceDate ?? null, t);

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
                            {t(`equipment.status_${item.status}`, item.status.replace('_', ' '))}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("equipment.sn_prefix")} {item.serialNumber}</p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                          <div>
                            <p className="text-xs text-muted-foreground">{t("equipment.purchased")}</p>
                            <p className="text-xs font-medium text-foreground">{fmtDate(item.purchaseDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t("equipment.warranty_label")}</p>
                            <p className={`text-xs font-medium flex items-center gap-1 ${w.color}`}>
                              <WarrantyIcon className="w-3 h-3" />
                              {w.label}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t("equipment.last_service_label")}</p>
                            <p className="text-xs font-medium text-foreground">{fmtDate(item.lastMaintenanceDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t("equipment.next_service_label")}</p>
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
