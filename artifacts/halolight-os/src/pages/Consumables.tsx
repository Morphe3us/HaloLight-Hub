import { useState } from "react";
import { useGetConsumables, useGetConsumableOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package, AlertTriangle, CheckCircle2, ShoppingCart, Clock,
  Layers, Printer, Brush, Wrench, TrendingDown, RotateCcw,
  ChevronDown, ChevronUp,
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
  accessory: { label: "Accessory",  icon: Package,  color: "text-orange-500" },
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
  const barColor = isCritical ? "bg-red-500" : isLow ? "bg-amber-400" : "bg-green-500";
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Consumables() {
  const [tab, setTab] = useState<"stock" | "orders">("stock");
  const [showOrders, setShowOrders] = useState(false);
  const { data: stockData = [], isLoading: stockLoading } = useGetConsumables();
  const { data: ordersData = [], isLoading: ordersLoading } = useGetConsumableOrders();

  const stock = stockData as StockItem[];
  const orders = ordersData as Order[];

  const criticalItems = stock.filter(s => s.isCritical);
  const lowItems = stock.filter(s => s.isLow && !s.isCritical);
  const reorderItems = stock.filter(s => s.reorderRecommended);

  // Group stock by category
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Consumables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Paper stock, ribbons, and accessories</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowOrders(!showOrders)}>
          <ShoppingCart className="w-4 h-4" />
          Order History
          {showOrders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>

      {/* Alert Banners */}
      {criticalItems.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Critical: Out of stock</p>
            <p className="text-xs text-destructive mt-0.5">{criticalItems.map(i => i.name).join(", ")} — reorder immediately</p>
          </div>
        </div>
      )}
      {lowItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <TrendingDown className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Low stock — reorder recommended</p>
            <p className="text-xs text-amber-600 mt-0.5">{lowItems.map(i => `${i.name} (${i.currentQuantity} ${i.unitType})`).join(", ")}</p>
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Items", value: stock.length, color: "text-foreground" },
          { label: "Well Stocked", value: stock.filter(s => !s.isLow).length, color: "text-success" },
          { label: "Low Stock", value: lowItems.length, color: "text-amber-500" },
          { label: "Out of Stock", value: criticalItems.length, color: "text-red-500" },
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
                        {order.notes && <p className="text-xs text-amber-600 mt-0.5">{order.notes}</p>}
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
            <p className="text-sm text-muted-foreground mt-1">Your paper, ribbon, and accessory stock will appear here</p>
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
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">Low Stock</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{item.sku}</p>
                          {item.compatibleModels && (
                            <p className="text-xs text-muted-foreground">Compatible: {item.compatibleModels}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold ${item.isCritical ? "text-red-500" : item.isLow ? "text-amber-500" : "text-foreground"}`}>
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
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between">
                          <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
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
