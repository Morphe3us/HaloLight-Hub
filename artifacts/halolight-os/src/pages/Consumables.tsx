import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetConsumables, useGetConsumableOrders,
  useCreateConsumableStock, useRestockConsumable, useGetConsumableForecast,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Package, AlertTriangle, ShoppingCart, Clock,
  Layers, Printer, Brush, TrendingDown, RotateCcw,
  ChevronDown, ChevronUp, Plus, Loader2, RefreshCw,
  Calendar, Zap, CheckCircle2, Pencil,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StockItem = {
  id: string;
  catalogItemId: string;
  name: string;
  sku: string;
  category: string;
  unitType: string;
  quantityUnit?: string | null;
  unitPrice: string;
  reorderThreshold: number;
  description: string | null;
  compatibleModels: string | null;
  currentQuantity: number;
  estimatedDailyUsage: string | null;
  averagePrintsPerEvent: number | null;
  averageEventsPerMonth: string | null;
  monthlyConsumption: number | null;
  eventsRemaining: number | null;
  monthsRemaining: number | null;
  lastRestockedAt: string | null;
  lowStockAlertEnabled: boolean;
  isLow: boolean;
  isCritical: boolean;
  daysRemaining: number | null;
  reorderRecommended: boolean;
};

type Order = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  unitPrice: string;
  total: string;
  status: string;
  orderedAt: string;
  deliveredAt: string | null;
  notes: string | null;
  unitType: string;
};

// ─── Config (icons and colors only — labels translated inline) ────────────────

const CATEGORY_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  paper:     { icon: Layers,   color: "text-info" },
  ribbon:    { icon: Printer,  color: "text-muted-foreground" },
  accessory: { icon: Package,  color: "text-warning" },
  cleaning:  { icon: Brush,    color: "text-teal-600" },
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending:    "bg-warning/15 text-yellow-700",
  processing: "bg-info/15 text-info",
  shipped:    "bg-info/15 text-info",
  delivered:  "bg-success/15 text-success",
  cancelled:  "bg-muted text-muted-foreground",
};

const ORDER_STATUS_KEYS: Record<string, string> = {
  pending:    "consumables.order_status_pending",
  processing: "consumables.order_status_processing",
  shipped:    "consumables.order_status_shipped",
  delivered:  "consumables.order_status_delivered",
  cancelled:  "consumables.order_status_cancelled",
};

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  paper:     "consumables.category_paper",
  ribbon:    "consumables.category_ribbon",
  accessory: "consumables.category_accessory",
  cleaning:  "consumables.category_cleaning",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function todayStr() {
  return new Date().toISOString().split("T")[0]!;
}

function StockBar({ qty, threshold, isCritical, isLow }: { qty: number; threshold: number; isCritical: boolean; isLow: boolean }) {
  const max = Math.max(qty, threshold * 3, 10);
  const pct = Math.min((qty / max) * 100, 100);
  const barColor = isCritical ? "bg-destructive" : isLow ? "bg-warning" : "bg-success";
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Restock Modal ────────────────────────────────────────────────────────────

const EMPTY_RESTOCK = {
  stockItemId: "",
  rollsPurchased: "",
  printsPerRoll: "",
  purchaseDate: todayStr(),
  supplierName: "",
  unitPricePerRoll: "",
  notes: "",
};

function RestockModal({
  open,
  onClose,
  stock,
  preSelectedId,
}: {
  open: boolean;
  onClose: () => void;
  stock: StockItem[];
  preSelectedId?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_RESTOCK, stockItemId: preSelectedId ?? "" });

  const rolls = parseInt(form.rollsPurchased, 10) || 0;
  const prints = parseInt(form.printsPerRoll, 10) || 0;
  const totalPrints = rolls > 0 && prints > 0 ? rolls * prints : 0;

  const selectedItem = stock.find(s => s.id === form.stockItemId);

  const { mutate: restock, isPending } = useRestockConsumable({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ["/api/consumables"] });
        qc.invalidateQueries({ queryKey: ["/api/consumables/orders"] });
        const newQty = (data as { currentQuantity?: number }).currentQuantity ?? totalPrints;
        toast({
          title: t("consumables.purchase_recorded"),
          description: `+${totalPrints} ${selectedItem?.unitType ?? "units"} → ${selectedItem?.name ?? ""}. ${t("consumables.in_stock")}: ${newQty}.`,
        });
        setForm({ ...EMPTY_RESTOCK, stockItemId: preSelectedId ?? "" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? t("consumables.restock_failed");
        toast({ title: t("consumables.restock_failed"), description: msg, variant: "destructive" });
      },
    },
  });

  const set = (k: keyof typeof EMPTY_RESTOCK) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.stockItemId || rolls < 1 || prints < 1 || !form.purchaseDate) return;
    restock({
      data: {
        stockItemId: form.stockItemId,
        rollsPurchased: rolls,
        printsPerRoll: prints,
        purchaseDate: form.purchaseDate,
        supplierName: form.supplierName.trim() || null,
        unitPricePerRoll: form.unitPricePerRoll.trim() || null,
        notes: form.notes.trim() || null,
      },
    });
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setForm({ ...EMPTY_RESTOCK, stockItemId: preSelectedId ?? "" });
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            {t("consumables.record_purchase_title")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>{t("consumables.title")} <span className="text-destructive">*</span></Label>
            <Select value={form.stockItemId} onValueChange={set("stockItemId")}>
              <SelectTrigger>
                <SelectValue placeholder={t("consumables.consumable_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {stock.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    <span className="ml-1.5 text-muted-foreground text-xs">({s.currentQuantity} {s.unitType} {t("consumables.in_stock")})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rollsPurchased">{t("consumables.rolls_purchased")} <span className="text-destructive">*</span></Label>
              <Input
                id="rollsPurchased"
                type="number"
                min="1"
                placeholder="e.g. 5"
                value={form.rollsPurchased}
                onChange={(e) => set("rollsPurchased")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="printsPerRoll">{t("consumables.prints_per_roll")} <span className="text-destructive">*</span></Label>
              <Input
                id="printsPerRoll"
                type="number"
                min="1"
                placeholder="e.g. 200"
                value={form.printsPerRoll}
                onChange={(e) => set("printsPerRoll")(e.target.value)}
                required
              />
            </div>
          </div>

          {totalPrints > 0 && (
            <div className="bg-success/8 border border-success/25 rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span className="text-sm text-success font-medium">{t("consumables.total_prints_added")}</span>
              <span className="text-lg font-bold text-success">
                +{totalPrints.toLocaleString()}
                <span className="text-xs font-normal text-success/70 ml-1">
                  {selectedItem?.unitType ?? "units"}
                </span>
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="purchaseDate">{t("consumables.purchase_date_label")} <span className="text-destructive">*</span></Label>
            <Input
              id="purchaseDate"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => set("purchaseDate")(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplierName">{t("consumables.supplier_label")}</Label>
              <Input
                id="supplierName"
                placeholder="e.g. HaloLight Direct"
                value={form.supplierName}
                onChange={(e) => set("supplierName")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitPricePerRoll">{t("consumables.price_per_roll")}</Label>
              <Input
                id="unitPricePerRoll"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.unitPricePerRoll}
                onChange={(e) => set("unitPricePerRoll")(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restockNotes">{t("common.actions", { defaultValue: "Notes" })}</Label>
            <Textarea
              id="restockNotes"
              placeholder="Any additional notes about this purchase…"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.stockItemId || rolls < 1 || prints < 1 || !form.purchaseDate}
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t("consumables.recording")}</>
                : t("consumables.record_purchase_btn")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Supply Modal ─────────────────────────────────────────────────────────

const EMPTY_SUPPLY = {
  name: "",
  category: "paper",
  sku: "",
  unitType: "units",
  currentQuantity: "",
  reorderThreshold: "5",
  averagePrintsPerEvent: "",
  averageEventsPerMonth: "",
  unitPrice: "0",
  compatibleModels: "",
  description: "",
};

function AddSupplyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_SUPPLY);

  const { mutate: create, isPending } = useCreateConsumableStock({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/consumables"] });
        toast({ title: t("consumables.supply_added"), description: t("consumables.supply_added_desc", { name: form.name }) });
        setForm(EMPTY_SUPPLY);
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? t("consumables.supply_add_failed");
        toast({ title: t("consumables.supply_add_failed"), description: msg, variant: "destructive" });
      },
    },
  });

  const set = (k: keyof typeof EMPTY_SUPPLY) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(form.currentQuantity);
    if (!form.name.trim() || !form.category || !Number.isInteger(qty) || qty < 0) return;
    create({
      data: {
        name: form.name.trim(),
        category: form.category,
        sku: form.sku.trim() || null,
        unitType: form.category === "paper" ? "prints" : form.unitType.trim() || "units",
        currentQuantity: qty,
        reorderThreshold: form.reorderThreshold === "" ? 5 : Number(form.reorderThreshold),
        averagePrintsPerEvent: (form.category !== "paper" && form.unitType !== "prints") || form.averagePrintsPerEvent === "" ? null : Number(form.averagePrintsPerEvent),
        averageEventsPerMonth: (form.category !== "paper" && form.unitType !== "prints") || form.averageEventsPerMonth === "" ? null : Number(form.averageEventsPerMonth),
        unitPrice: form.unitPrice.trim() || "0",
        compatibleModels: form.compatibleModels.trim() || null,
        description: form.description.trim() || null,
        lowStockAlertEnabled: true,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("consumables.add_supply_title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="supplyName">{t("consumables.item_name_label")} <span className="text-destructive">*</span></Label>
              <Input
                id="supplyName"
                placeholder="e.g. 4x6 Glossy Photo Paper"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("consumables.category_label")} <span className="text-destructive">*</span></Label>
              <Select value={form.category} onValueChange={set("category")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">{t("consumables.category_paper")}</SelectItem>
                  <SelectItem value="ribbon">{t("consumables.category_ribbon")}</SelectItem>
                  <SelectItem value="accessory">{t("consumables.category_accessory")}</SelectItem>
                  <SelectItem value="cleaning">{t("consumables.category_cleaning")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitType">{t("consumables.unit_type_label")}</Label>
              <Input
                id="unitType"
                placeholder="e.g. sheets, rolls, packs"
                value={form.category === "paper" ? "prints" : form.unitType}
                readOnly={form.category === "paper"}
                onChange={(e) => set("unitType")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currentQty">{form.category === "paper" || form.unitType === "prints" ? t("consumables.stock_prints", { defaultValue: "Current stock (prints)" }) : t("consumables.current_qty_label")} <span className="text-destructive">*</span></Label>
              <Input
                id="currentQty"
                type="number"
                min="0"
                placeholder="0"
                value={form.currentQuantity}
                onChange={(e) => set("currentQuantity")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reorderThreshold">{t("consumables.reorder_threshold_label")}</Label>
              <Input
                id="reorderThreshold"
                type="number"
                min="0"
                placeholder="5"
                value={form.reorderThreshold}
                onChange={(e) => set("reorderThreshold")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eventUsage">{t("consumables.average_prints_event", { defaultValue: "Average prints per event" })}</Label>
              <Input
                id="eventUsage"
                disabled={form.category !== "paper" && form.unitType !== "prints"}
                type="number"
                min="0"
                step="1"
                max="1000000"
                placeholder="250"
                value={form.averagePrintsPerEvent}
                onChange={(e) => set("averagePrintsPerEvent")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monthlyEvents">{t("consumables.average_events_month", { defaultValue: "Average events per month (optional)" })}</Label>
              <Input id="monthlyEvents" type="number" min="0" max="999999.99" step="0.01" placeholder="8" disabled={form.category !== "paper" && form.unitType !== "prints"} value={form.averageEventsPerMonth} onChange={e => set("averageEventsPerMonth")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitPrice">{t("consumables.unit_price_label")}</Label>
              <Input
                id="unitPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.unitPrice}
                onChange={(e) => set("unitPrice")(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="compatibleModels">{t("consumables.compatible_models_label")}</Label>
              <Input
                id="compatibleModels"
                placeholder="e.g. HaloLight Pro X1, X2"
                value={form.compatibleModels}
                onChange={(e) => set("compatibleModels")(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="description">{t("consumables.description_label")}</Label>
              <Textarea
                id="description"
                placeholder="Optional notes about this item…"
                rows={2}
                value={form.description}
                onChange={(e) => set("description")(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.name.trim() || !form.currentQuantity}
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t("consumables.adding")}</>
                : t("consumables.add_supply_btn")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function UsageModal({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [prints, setPrints] = useState(item.averagePrintsPerEvent?.toString() ?? "");
  const [events, setEvents] = useState(item.averageEventsPerMonth ?? "");
  const [saving, setSaving] = useState(false);
  const needsConversion = item.unitType !== "prints";
  const [verifiedQuantity, setVerifiedQuantity] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const validConversion = !needsConversion || (confirmed && verifiedQuantity !== "" && Number.isInteger(Number(verifiedQuantity)) && Number(verifiedQuantity) >= 0 && Number(verifiedQuantity) <= 2000000000);
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{t("consumables.edit_usage", { defaultValue: "Edit event usage" })}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (!validConversion) return;
        setSaving(true);
        try {
          await customFetch(`/api/consumables/stock/${item.id}/usage`, { method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ averagePrintsPerEvent: prints === "" ? null : Number(prints), averageEventsPerMonth: events === "" ? null : Number(events),
              ...(needsConversion ? { currentQuantityPrints: Number(verifiedQuantity) } : {}) }) });
          await qc.invalidateQueries({ queryKey: ["/api/consumables"] });
          await qc.invalidateQueries({ queryKey: ["/api/consumables/forecast"] }); onClose();
        } catch { toast({ title: t("common.error"), description: t("consumables.usage_save_failed", { defaultValue: "Unable to save event usage" }), variant: "destructive" }); }
        finally { setSaving(false); }
      }}>
        <p className="text-sm break-words">{item.name}</p>
        {needsConversion && <div className="space-y-3 border-y py-3">
          <p className="text-sm">{item.currentQuantity.toLocaleString()} {item.unitType}</p>
          <div className="space-y-1.5"><Label htmlFor="verified-print-quantity">{t("consumables.verified_print_quantity", { defaultValue: "Verified remaining prints" })}</Label>
            <Input id="verified-print-quantity" type="number" required min="0" max="2000000000" step="1" value={verifiedQuantity} onChange={event => { setVerifiedQuantity(event.target.value); setConfirmed(false); }} /></div>
          <div className="flex items-start gap-2"><Checkbox id="confirm-print-unit" checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} />
            <Label htmlFor="confirm-print-unit" className="text-sm leading-relaxed">{t("consumables.confirm_print_conversion", { defaultValue: "I confirm this is the total remaining print capacity. Replace only my stock quantity and unit; do not change the shared catalog." })}</Label></div>
        </div>}
        <div className="space-y-1.5"><Label htmlFor="edit-event-prints">{t("consumables.average_prints_event", { defaultValue: "Average prints per event" })}</Label>
          <Input id="edit-event-prints" type="number" min="0" max="1000000" step="1" value={prints} onChange={event => setPrints(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="edit-month-events">{t("consumables.average_events_month", { defaultValue: "Average events per month (optional)" })}</Label>
          <Input id="edit-month-events" type="number" min="0" max="999999.99" step="0.01" value={events} onChange={event => setEvents(event.target.value)} /></div>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={saving || !validConversion}>{t("common.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function Consumables() {
  const { t } = useTranslation();
  const [showOrders, setShowOrders] = useState(false);
  const [addSupplyOpen, setAddSupplyOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockPreSelected, setRestockPreSelected] = useState<string | undefined>();
  const [editingUsage, setEditingUsage] = useState<StockItem | null>(null);

  const { data: stockData = [], isLoading: stockLoading, isError: stockError, refetch: retryStock } = useGetConsumables();
  const { data: ordersData = [], isLoading: ordersLoading } = useGetConsumableOrders();
  const { data: forecastData } = useGetConsumableForecast({
    query: {
      queryKey: ["/api/consumables/forecast"],
      staleTime: 5 * 60 * 1000,
    },
  });
  const forecastEvents = forecastData?.events ?? [];
  const forecastShortage = forecastData?.shortage ?? 0;
  const forecastTotalRequired = forecastData?.totalRequired ?? 0;
  const forecastTotalAvailable = forecastData?.totalAvailable ?? 0;

  const stock = stockData as StockItem[];
  const orders = ordersData as Order[];

  const criticalItems = stock.filter(s => s.isCritical);
  const lowItems = stock.filter(s => s.isLow && !s.isCritical);

  const grouped = stock.reduce<Record<string, StockItem[]>>((acc, item) => {
    const key = item.category;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(item);
    return acc;
  }, {});

  const openRestock = (id?: string) => {
    setRestockPreSelected(id);
    setRestockOpen(true);
  };

  if (stockLoading) return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="h-8 w-48 bg-border rounded animate-pulse" />
      {[1, 2, 3].map(i => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
    </div>
  );
  if (stockError) return <div role="alert" className="max-w-4xl mx-auto flex items-center gap-3"><p>{t("common.error")}</p><Button variant="outline" onClick={() => void retryStock()}>{t("common.retry", { defaultValue: "Retry" })}</Button></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <AddSupplyModal open={addSupplyOpen} onClose={() => setAddSupplyOpen(false)} />
      {editingUsage && <UsageModal key={editingUsage.id} item={editingUsage} onClose={() => setEditingUsage(null)} />}
      <RestockModal
        open={restockOpen}
        onClose={() => { setRestockOpen(false); setRestockPreSelected(undefined); }}
        stock={stock.filter(item => item.unitType === "prints")}
        preSelectedId={restockPreSelected}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("consumables.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("consumables.subtitle_short")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowOrders(!showOrders)}>
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">{t("consumables.purchase_history")}</span>
            <span className="sm:hidden">{t("consumables.orders", { defaultValue: "Orders" })}</span>
            {showOrders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          {stock.some(item => item.unitType === "prints") && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openRestock()}>
              <RefreshCw className="w-4 h-4" />
              {t("consumables.reorder")}
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setAddSupplyOpen(true)}>
            <Plus className="w-4 h-4" />
            {t("consumables.add_supply")}
          </Button>
        </div>
      </div>

      {/* Alert Banners */}
      {criticalItems.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">{t("consumables.critical_title")}</p>
            <p className="text-xs text-destructive mt-0.5">{criticalItems.map(i => i.name).join(", ")} — {t("consumables.critical_desc")}</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/8"
            disabled={!criticalItems.some(item => item.unitType === "prints")}
            onClick={() => openRestock(criticalItems.find(item => item.unitType === "prints")?.id)}>
            <RefreshCw className="w-3.5 h-3.5" />
            {t("consumables.reorder")}
          </Button>
        </div>
      )}
      {lowItems.length > 0 && (
        <div className="bg-warning/8 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
          <TrendingDown className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warning">{t("consumables.low_stock_title")}</p>
            <p className="text-xs text-warning mt-0.5">{lowItems.map(i => `${i.name} (${i.currentQuantity} ${i.unitType})`).join(", ")}</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-warning/30 text-warning hover:bg-warning/8"
            disabled={!lowItems.some(item => item.unitType === "prints")}
            onClick={() => openRestock(lowItems.find(item => item.unitType === "prints")?.id)}>
            <RefreshCw className="w-3.5 h-3.5" />
            {t("consumables.reorder")}
          </Button>
        </div>
      )}

      {/* Forecast Card */}
      {forecastEvents.length > 0 && (
        <Card className={forecastShortage > 0 ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className={`w-4 h-4 ${forecastShortage > 0 ? "text-destructive" : "text-success"}`} />
              {t("consumables.forecast_title", { defaultValue: "Print Forecast — Upcoming Events" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{forecastTotalRequired.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{t("consumables.forecast_required", { defaultValue: "Prints Required" })}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{forecastTotalAvailable.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{t("consumables.forecast_available", { defaultValue: "Prints Available" })}</p>
              </div>
              <div className="text-center">
                {forecastShortage > 0 ? (
                  <>
                    <p className="text-lg font-bold text-destructive">-{forecastShortage.toLocaleString()}</p>
                    <p className="text-xs text-destructive">{t("consumables.forecast_shortage", { defaultValue: "Shortage" })}</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-success flex items-center justify-center gap-1"><CheckCircle2 className="w-4 h-4" />{t("consumables.forecast_ok", { defaultValue: "OK" })}</p>
                    <p className="text-xs text-success">{t("consumables.forecast_sufficient", { defaultValue: "Stock Sufficient" })}</p>
                  </>
                )}
              </div>
            </div>
            {forecastShortage > 0 && (
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-destructive shrink-0" />
                <p className="text-xs text-destructive font-medium">
                  {t("consumables.forecast_reorder_hint", { defaultValue: "Reorder paper before your next event to avoid running short." })}
                </p>
                <Button size="sm" variant="outline" className="shrink-0 ml-auto gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/8 text-xs h-7"
                  onClick={() => openRestock()}>
                  <RefreshCw className="w-3 h-3" /> {t("consumables.reorder")}
                </Button>
              </div>
            )}
            <div className="space-y-1.5 pt-1 border-t">
              {forecastEvents.slice(0, 5).map(ev => (
                <div key={ev.id} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate max-w-[60%]">{ev.title}{ev.clientName ? ` — ${ev.clientName}` : ""}</span>
                  <span className="shrink-0 ml-2">{ev.eventDate ? new Date(ev.eventDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"} · {ev.includedPrints} {t("consumables.forecast_prints_label", { defaultValue: "prints" })}</span>
                </div>
              ))}
              {forecastEvents.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">+{forecastEvents.length - 5} {t("consumables.forecast_more_events", { defaultValue: "more events" })}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("consumables.kpi_total"),        value: stock.length,                       color: "text-foreground" },
          { label: t("consumables.kpi_well_stocked"), value: stock.filter(s => !s.isLow).length, color: "text-success" },
          { label: t("consumables.low_stock"),        value: lowItems.length,                    color: "text-warning" },
          { label: t("consumables.out_of_stock"),     value: criticalItems.length,               color: "text-destructive" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Purchase History (collapsible) */}
      {showOrders && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              {t("consumables.orders_section")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">{t("consumables.no_orders")}</div>
            ) : (
              <div className="space-y-1">
                {orders.map(order => {
                  const statusColor = ORDER_STATUS_COLORS[order.status] ?? ORDER_STATUS_COLORS.pending!;
                  const statusLabel = t(ORDER_STATUS_KEYS[order.status] ?? "consumables.order_status_pending");
                  const isRestock = order.status === "delivered" && order.notes?.includes("prints/roll");
                  return (
                    <div key={order.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{order.name}</p>
                          {isRestock && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              <RefreshCw className="w-2.5 h-2.5" />
                              {t("consumables.reorder")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          +{order.quantity.toLocaleString()} {order.unitType}
                          {Number(order.total) > 0 && ` · $${Number(order.total).toFixed(2)}`}
                          {` · ${fmtDate(order.orderedAt)}`}
                        </p>
                        {order.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{order.notes}</p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stock by Category */}
      {stock.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">{t("consumables.no_stock_empty")}</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">{t("consumables.first_supply_desc")}</p>
            <Button size="sm" className="gap-1.5" onClick={() => setAddSupplyOpen(true)}>
              <Plus className="w-4 h-4" />
              {t("consumables.add_first_supply")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => {
          const catCfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.accessory!;
          const CatIcon = catCfg.icon;
          const catLabel = t(CATEGORY_LABEL_KEYS[category] ?? "consumables.category_accessory");
          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CatIcon className={`w-4 h-4 ${catCfg.color}`} />
                  {catLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  {items.map(item => (
                    <div key={item.id} className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">{item.name}</p>
                            {item.isCritical && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">
                                {t("consumables.out_of_stock")}
                              </span>
                            )}
                            {item.isLow && !item.isCritical && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
                                {t("consumables.low_stock")}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{item.sku}</p>
                          {item.compatibleModels && (
                            <p className="text-xs text-muted-foreground">{t("consumables.compatible")}: {item.compatibleModels}</p>
                          )}
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          <div className="text-right">
                            <p className={`text-lg font-bold ${item.isCritical ? "text-destructive" : item.isLow ? "text-warning" : "text-foreground"}`}>
                              {item.currentQuantity.toLocaleString()}
                              <span className="text-xs font-normal text-muted-foreground ml-1">{item.unitType === "prints" ? t("consumables.forecast_prints_label", { defaultValue: "prints" }) : item.unitType}</span>
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/8"
                            title={t("consumables.record_purchase_title")}
                            disabled={item.unitType !== "prints"}
                            onClick={() => openRestock(item.id)}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" title={t("consumables.edit_usage", { defaultValue: "Edit event usage" })} aria-label={t("consumables.edit_usage", { defaultValue: "Edit event usage" })} onClick={() => setEditingUsage(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                      <StockBar qty={item.currentQuantity} threshold={item.reorderThreshold} isCritical={item.isCritical} isLow={item.isLow} />
                      {item.unitType !== "prints" ? <p className="text-xs text-muted-foreground">{t("consumables.print_units_required", { defaultValue: "Estimates and print restocking are unavailable for this unit. Existing quantities are unchanged." })}</p> : <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        {[
                          [t("consumables.average_prints_event", { defaultValue: "Average prints per event" }), item.averagePrintsPerEvent],
                          [t("consumables.average_events_month", { defaultValue: "Average events per month (optional)" }), item.averageEventsPerMonth == null ? null : Number(item.averageEventsPerMonth)],
                          [t("consumables.monthly_consumption", { defaultValue: "Estimated prints per month" }), item.monthlyConsumption],
                          [t("consumables.events_remaining", { defaultValue: "Events remaining" }), item.eventsRemaining],
                          [t("consumables.months_remaining", { defaultValue: "Months remaining" }), item.monthsRemaining],
                        ].map(([label, value]) => <div key={String(label)}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium mt-1">{value == null ? t("consumables.usage_unknown", { defaultValue: "Not estimated" }) : typeof value === "number" ? value.toLocaleString() : value}</dd></div>)}
                      </dl>}
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("consumables.reorder_threshold", { threshold: item.reorderThreshold, unit: item.unitType })}</span>
                        <span>{t("consumables.last_restocked", { date: fmtDate(item.lastRestockedAt) })}</span>
                      </div>
                      {item.reorderRecommended && item.unitType === "prints" && (
                        <div className="bg-warning/8 border border-warning/30 rounded-lg p-2.5 flex items-center justify-between">
                          <p className="text-xs text-warning font-medium flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" />
                            {t("consumables.reorder_recommended_msg")}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => openRestock(item.id)}
                          >
                            <RefreshCw className="w-3 h-3" />
                            {t("consumables.reorder")}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
