import { useState } from "react";
import { useGetConsumables, useGetConsumableOrders, useCreateConsumableStock } from "@workspace/api-client-react";
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
  Package, AlertTriangle, CheckCircle2, ShoppingCart, Clock,
  Layers, Printer, Brush, Wrench, TrendingDown, RotateCcw,
  ChevronDown, ChevronUp, Plus, Loader2,
} from "lucide-react";

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

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

const EMPTY_FORM = {
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
  const [form, setForm] = useState(EMPTY_FORM);

  const { mutate: create, isPending } = useCreateConsumableStock({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/consumables"] });
        toast({ title: "Supply added", description: `${form.name} has been added to your inventory.` });
        setForm(EMPTY_FORM);
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to add supply item";
        toast({ title: "Failed to add supply", description: msg, variant: "destructive" });
      },
    },
  });

  const set = (k: keyof typeof EMPTY_FORM) => (v: string) =>
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

export default function Consumables() {
  const [showOrders, setShowOrders] = useState(false);
  const [addSupplyOpen, setAddSupplyOpen] = useState(false);
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

  if (stockLoading) return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="h-8 w-48 bg-border rounded animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <AddSupplyModal open={addSupplyOpen} onClose={() => setAddSupplyOpen(false)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Consumables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Paper stock, ribbons, and accessories</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowOrders(!showOrders)}>
            <ShoppingCart className="w-4 h-4" />
            Order History
            {showOrders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
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
          <div>
            <p className="text-sm font-semibold text-destructive">Critical: Out of stock</p>
            <p className="text-xs text-destructive mt-0.5">{criticalItems.map(i => i.name).join(", ")} — reorder immediately</p>
          </div>
        </div>
      )}
      {lowItems.length > 0 && (
        <div className="bg-warning/8 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
          <TrendingDown className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning">Low stock — reorder recommended</p>
            <p className="text-xs text-warning mt-0.5">{lowItems.map(i => `${i.name} (${i.currentQuantity} ${i.unitType})`).join(", ")}</p>
          </div>
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

      {/* Order History (collapsible) */}
      {showOrders && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Order History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No orders yet</div>
            ) : (
              <div className="space-y-2">
                {orders.map(order => {
                  const statusCfg = ORDER_STATUS[order.status] ?? ORDER_STATUS.pending!;
                  return (
                    <div key={order.id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{order.name}</p>
                        <p className="text-xs text-muted-foreground">{order.quantity} {order.unitType} · ${Number(order.total).toFixed(2)} · {fmtDate(order.orderedAt)}</p>
                        {order.notes && <p className="text-xs text-warning mt-0.5">{order.notes}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusCfg.color}`}>
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
                <div className="space-y-4">
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
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold ${item.isCritical ? "text-destructive" : item.isLow ? "text-warning" : "text-foreground"}`}>
                            {item.currentQuantity}
                            <span className="text-xs font-normal text-muted-foreground ml-1">{item.unitType}</span>
                          </p>
                          {item.daysRemaining !== null && item.daysRemaining >= 0 && (
                            <p className="text-xs text-muted-foreground">~{item.daysRemaining}d remaining</p>
                          )}
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
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled>
                            Order Now
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
