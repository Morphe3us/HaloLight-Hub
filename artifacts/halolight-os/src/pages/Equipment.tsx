import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useGetEquipment, useCreateEquipment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Monitor, AlertTriangle,
  ChevronRight, ShieldCheck, ShieldAlert,
  ShieldX, Plus, Loader2,
} from "lucide-react";
import { EmptyState, Notice, PageHeader, Stat, StatGrid } from "@/components/page";

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

const STATUS_CONFIG: Record<string, { dot: string }> = {
  active:     { dot: "bg-success" },
  inactive:   { dot: "bg-muted-foreground/50" },
  in_service: { dot: "bg-info" },
  retired:    { dot: "bg-destructive" },
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
                placeholder={t("equipment.placeholder_model")}
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
                placeholder={t("equipment.placeholder_vendor")}
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
                placeholder={t("equipment.placeholder_notes")}
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
      <div className="max-w-4xl space-y-4">
        <div className="h-8 w-56 bg-muted rounded-md animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />

      {/* Header */}
      <PageHeader
        title={t("equipment.my_equipment")}
        description={t("equipment.track_subtitle")}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setRegisterOpen(true)}>
            <Plus className="w-4 h-4" />
            {t("equipment.register_equipment", { defaultValue: "Register Equipment" })}
          </Button>
        }
      />

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <Notice tone="warning" icon={AlertTriangle} title={t("equipment.alert_banner", { count: alerts.length })}>
          {alerts.map(a => a.productModel).join(", ")} — {t("equipment.check_status")}
        </Notice>
      )}

      {/* Summary Cards */}
      {items.length > 0 && (
        <StatGrid className="grid-cols-2 md:grid-cols-4">
          <Stat label={t("equipment.total_units")} value={items.length} />
          <Stat label={t("equipment.status_active")} value={items.filter(e => e.status === "active").length} tone="success" />
          <Stat label={t("equipment.status_in_service")} value={items.filter(e => e.status === "in_service").length} />
          <Stat label={t("equipment.alerts")} value={alerts.length} tone={alerts.length > 0 ? "warning" : undefined} />
        </StatGrid>
      )}

      {/* Equipment List */}
      {items.length === 0 ? (
        <EmptyState icon={Monitor} text={t("equipment.no_equipment_empty")}>
          <p className="text-[13px] text-muted-foreground -mt-2 mb-4">{t("equipment.no_equipment_desc")}</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRegisterOpen(true)}>
            <Plus className="w-4 h-4" />
            {t("equipment.register_first_unit")}
          </Button>
        </EmptyState>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {items.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.active!;
            const w = warrantyStatus(item.warrantyExpiration ?? null, t);
            const m = maintenanceStatus(item.nextMaintenanceDate ?? null, t);

            return (
              <li key={item.id}>
                <Link href={`/equipment/${item.id}`} className="group flex items-start gap-4 p-5 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                      <h3 className="text-[15px] font-medium text-foreground">{item.productModel}</h3>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                        {t(`equipment.status_${item.status}`, item.status.replace('_', ' '))}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("equipment.sn_prefix")} {item.serialNumber}</p>

                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("equipment.purchased")}</dt>
                        <dd className="text-[13px] text-foreground tabular-nums mt-0.5">{fmtDate(item.purchaseDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("equipment.warranty_label")}</dt>
                        <dd className={`text-[13px] tabular-nums mt-0.5 ${w.color === "text-success" ? "text-foreground" : w.color}`}>
                          {w.label}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("equipment.last_service_label")}</dt>
                        <dd className="text-[13px] text-foreground tabular-nums mt-0.5">{fmtDate(item.lastMaintenanceDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("equipment.next_service_label")}</dt>
                        <dd className={`text-[13px] tabular-nums mt-0.5 ${m.urgent ? "text-warning" : "text-foreground"}`}>
                          {m.label}
                        </dd>
                      </div>
                    </dl>

                    {item.maintenanceNotes && (
                      <p className="mt-3 text-xs text-muted-foreground line-clamp-2 border-l-2 border-border pl-3">{item.maintenanceNotes}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 stroke-[1.75] text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0 mt-1" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
