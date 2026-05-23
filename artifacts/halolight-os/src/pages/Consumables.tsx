import { useState } from "react";
import {
  useGetConsumables, useGetConsumableOrders,
  useCreateConsumableStock, useRestockConsumable,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Package, AlertTriangle, ShoppingCart, Clock,
  Layers, Printer, Brush, TrendingDown, RotateCcw,
  ChevronDown, ChevronUp, Plus, Loader2, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StockItem = {
  id: string;
  catalogItemId: string;
  name: string;
  sku: string;
  category: string;
  unitType: string;
  unitPrice: string;
  reorderThreshold: number;
  description: string | null;
  compatibleModels: string | null;
  currentQuantity: number;
  estimatedDailyUsage: string | null;
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

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<{className?: string}>; color: string }> = {
  paper:     { label: "Paper",      icon: Layers,   color: "text-info" },
  ribbon:    { label: "Ribbon",     icon: Printer,  color: "text-muted-foreground" },
  accessory: { label: "Accessory",  icon: Package,  color: "text-warning" },
  cleaning:  { label: "Cleaning",   icon: Brush,    color: "text-teal-600" },
};

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending:    { label: "Pending",    color: "bg-warning/15 text-yellow-700" },
  processing: { label: "Processing", color: "bg-info/15 text-info" },
  shipped:    { label: "Shipped",    color: "bg-info/15 text-info" },
  delivered:  { label: "Delivered",  color: "bg-success/15 text-success" },
  cancelled:  { label: "Cancelled",  color: "bg-muted text-muted-foreground" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
          title: "Purchase recorded",
          description: `Added ${totalPrints} ${selectedItem?.unitType ?? "units"} to ${selectedItem?.name ?? "stock"}. New total: ${newQty}.`,
        });
        setForm({ ...EMPTY_RESTOCK, stockItemId: preSelectedId ?? "" });
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to record purchase";
        toast({ title: "Restock failed", description: msg, variant: "destructive" });
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
            Record a Purchase
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Consumable selector */}
          <div className="space-y-1.5">
            <Label>Consumable <span className="text-destructive">*</span></Label>
            <Select
              value={form.stockItemId}
              onValueChange={set("stockItemId")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a consumable…" />
              </SelectTrigger>
              <SelectContent>
                {stock.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    <span className="ml-1.5 text-muted-foreground text-xs">({s.currentQuantity} {s.unitType} in stock)</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rollsPurchased">Rolls Purchased <span className="text-destructive">*</span></Label>
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
              <Label htmlFor="printsPerRoll">Prints per Roll <span className="text-destructive">*</span></Label>
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

          {/* Live calculation */}
          {totalPrints > 0 && (
            <div className="bg-success/8 border border-success/25 rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span className="text-sm text-success font-medium">Total prints added</span>
              <span className="text-lg font-bold text-success">
                +{totalPrints.toLocaleString()}
                <span className="text-xs font-normal text-success/70 ml-1">
                  {selectedItem?.unitType ?? "units"}
                </span>
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="purchaseDate">Purchase Date <span className="text-destructive">*</span></Label>
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
              <Label htmlFor="supplierName">Supplier</Label>
              <Input
                id="supplierName"
                placeholder="e.g. HaloLight Direct"
                value={form.supplierName}
                onChange={(e) => set("supplierName")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitPricePerRoll">Price per Roll ($)</Label>
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
            <Label htmlFor="restockNotes">Notes</Label>
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.stockItemId || rolls < 1 || prints < 1 || !form.purchaseDate}
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Recording…</>
                : "Record Purchase"}
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
  estimatedDailyUsage: "",
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
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_SUPPLY);

  const { mutate: create, isPending } = useCreateConsumableStock({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/consumables"] });
        toast({ title: "Supply added", description: `${form.name} has been added to your inventory.` });
        setForm(EMPTY_SUPPLY);
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to add supply item";
        toast({ title: "Failed to add supply", description: msg, variant: "destructive" });
      },
    },
  });

  const set = (k: keyof typeof EMPTY_SUPPLY) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(form.currentQuantity, 10);
    if (!form.name.trim() || !form.category || isNaN(qty) || qty < 0) return;
    create({
      data: {
        name: form.name.trim(),
        category: form.category,
        sku: form.sku.trim() || null,
        unitType: form.unitType.trim() || "units",
        currentQuantity: qty,
        reorderThreshold: parseInt(form.reorderThreshold, 10) || 5,
        estimatedDailyUsage: form.estimatedDailyUsage.trim() || null,
        unitPrice: form.unitPrice.trim() || "0",
        compatibleModels: form.compatibleModels.trim() || null,
        description: form.description.trim() || null,
        lowStockAlertEnabled: true,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Supply Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="supplyName">Item Name <span className="text-destructive">*</span></Label>
              <Input
                id="supplyName"
                placeholder="e.g. 4x6 Glossy Photo Paper"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Select value={form.category} onValueChange={set("category")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">Paper</SelectItem>
                  <SelectItem value="ribbon">Ribbon</SelectItem>
                  <SelectItem value="accessory">Accessory</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitType">Unit Type</Label>
              <Input
                id="unitType"
                placeholder="e.g. sheets, rolls, packs"
                value={form.unitType}
                onChange={(e) => set("unitType")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currentQty">Current Quantity <span className="text-destructive">*</span></Label>
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
              <Label htmlFor="reorderThreshold">Reorder Threshold</Label>
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
              <Label htmlFor="dailyUsage">Est. Daily Usage</Label>
              <Input
                id="dailyUsage"
                type="number"
                min="0"
                step="0.1"
                placeholder="e.g. 10"
                value={form.estimatedDailyUsage}
                onChange={(e) => set("estimatedDailyUsage")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitPrice">Unit Price ($)</Label>
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
              <Label htmlFor="compatibleModels">Compatible Models</Label>
              <Input
                id="compatibleModels"
                placeholder="e.g. HaloLight Pro X1, X2"
                value={form.compatibleModels}
                onChange={(e) => set("compatibleModels")(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="description">Description</Label>
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !form.name.trim() || !form.currentQuantity}
            >
              {isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Adding…</> : "Add Supply"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Consumables() {
  const [showOrders, setShowOrders] = useState(false);
  const [addSupplyOpen, setAddSupplyOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockPreSelected, setRestockPreSelected] = useState<string | undefined>();

  const { data: stockData = [], isLoading: stockLoading } = useGetConsumables();
  const { data: ordersData = [], isLoading: ordersLoading } = useGetConsumableOrders();

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
      {[1,2,3].map(i => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <AddSupplyModal open={addSupplyOpen} onClose={() => setAddSupplyOpen(false)} />
      <RestockModal
        open={restockOpen}
        onClose={() => { setRestockOpen(false); setRestockPreSelected(undefined); }}
        stock={stock}
        preSelectedId={restockPreSelected}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Consumables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Paper stock, ribbons, and accessories</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowOrders(!showOrders)}>
            <ShoppingCart className="w-4 h-4" />
            Purchase History
            {showOrders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          {stock.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openRestock()}>
              <RefreshCw className="w-4 h-4" />
              Restock
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setAddSupplyOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Supply
          </Button>
        </div>
      </div>

      {/* Alert Banners */}
      {criticalItems.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">Critical: Out of stock</p>
            <p className="text-xs text-destructive mt-0.5">{criticalItems.map(i => i.name).join(", ")} — reorder immediately</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/8"
            onClick={() => openRestock(criticalItems[0]?.id)}>
            <RefreshCw className="w-3.5 h-3.5" />
            Restock
          </Button>
        </div>
      )}
      {lowItems.length > 0 && (
        <div className="bg-warning/8 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
          <TrendingDown className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-warning">Low stock — reorder recommended</p>
            <p className="text-xs text-warning mt-0.5">{lowItems.map(i => `${i.name} (${i.currentQuantity} ${i.unitType})`).join(", ")}</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-warning/30 text-warning hover:bg-warning/8"
            onClick={() => openRestock(lowItems[0]?.id)}>
            <RefreshCw className="w-3.5 h-3.5" />
            Restock
          </Button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Items",   value: stock.length,                        color: "text-foreground" },
          { label: "Well Stocked",  value: stock.filter(s => !s.isLow).length,  color: "text-success" },
          { label: "Low Stock",     value: lowItems.length,                     color: "text-warning" },
          { label: "Out of Stock",  value: criticalItems.length,                color: "text-destructive" },
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
              Purchase History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No purchase history yet</div>
            ) : (
              <div className="space-y-1">
                {orders.map(order => {
                  const statusCfg = ORDER_STATUS[order.status] ?? ORDER_STATUS.pending!;
                  const isRestock = order.status === "delivered" && order.notes?.includes("prints/roll");
                  return (
                    <div key={order.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{order.name}</p>
                          {isRestock && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              <RefreshCw className="w-2.5 h-2.5" />
                              Restock
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
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${statusCfg.color}`}>
                        {statusCfg.label}
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
            <p className="text-muted-foreground font-medium">No consumables tracked yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Your paper, ribbon, and accessory stock will appear here</p>
            <Button size="sm" className="gap-1.5" onClick={() => setAddSupplyOpen(true)}>
              <Plus className="w-4 h-4" />
              Add your first supply
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => {
          const catCfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.accessory!;
          const CatIcon = catCfg.icon;
          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CatIcon className={`w-4 h-4 ${catCfg.color}`} />
                  {catCfg.label}
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
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">Out of Stock</span>
                            )}
                            {item.isLow && !item.isCritical && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">Low Stock</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{item.sku}</p>
                          {item.compatibleModels && (
                            <p className="text-xs text-muted-foreground">Compatible: {item.compatibleModels}</p>
                          )}
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          <div className="text-right">
                            <p className={`text-lg font-bold ${item.isCritical ? "text-destructive" : item.isLow ? "text-warning" : "text-foreground"}`}>
                              {item.currentQuantity.toLocaleString()}
                              <span className="text-xs font-normal text-muted-foreground ml-1">{item.unitType}</span>
                            </p>
                            {item.daysRemaining !== null && item.daysRemaining >= 0 && (
                              <p className="text-xs text-muted-foreground">~{item.daysRemaining}d remaining</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/8"
                            title="Record a purchase"
                            onClick={() => openRestock(item.id)}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <StockBar qty={item.currentQuantity} threshold={item.reorderThreshold} isCritical={item.isCritical} isLow={item.isLow} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Reorder threshold: {item.reorderThreshold} {item.unitType}</span>
                        <span>Last restocked: {fmtDate(item.lastRestockedAt)}</span>
                      </div>
                      {item.reorderRecommended && (
                        <div className="bg-warning/8 border border-warning/30 rounded-lg p-2.5 flex items-center justify-between">
                          <p className="text-xs text-warning font-medium flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reorder recommended — {item.currentQuantity <= item.reorderThreshold ? "at or below" : "approaching"} minimum level
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => openRestock(item.id)}
                          >
                            <RefreshCw className="w-3 h-3" />
                            Restock
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
