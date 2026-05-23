import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, lte, sql } from "drizzle-orm";
import { db, usersTable, consumableCatalog, consumableStock, consumableOrders } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /consumables/catalog — all catalog items
router.get("/consumables/catalog", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const items = await db.select().from(consumableCatalog).orderBy(consumableCatalog.category, consumableCatalog.name);
  res.json(items);
});

// GET /consumables — client's stock with low-stock alerts
router.get("/consumables", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const stockItems = await db.select({
    id: consumableStock.id,
    catalogItemId: consumableStock.catalogItemId,
    currentQuantity: consumableStock.currentQuantity,
    estimatedDailyUsage: consumableStock.estimatedDailyUsage,
    lastRestockedAt: consumableStock.lastRestockedAt,
    lowStockAlertEnabled: consumableStock.lowStockAlertEnabled,
    updatedAt: consumableStock.updatedAt,
    name: consumableCatalog.name,
    sku: consumableCatalog.sku,
    category: consumableCatalog.category,
    unitType: consumableCatalog.unitType,
    unitPrice: consumableCatalog.unitPrice,
    reorderThreshold: consumableCatalog.reorderThreshold,
    description: consumableCatalog.description,
    compatibleModels: consumableCatalog.compatibleModels,
  })
    .from(consumableStock)
    .innerJoin(consumableCatalog, eq(consumableStock.catalogItemId, consumableCatalog.id))
    .where(eq(consumableStock.userId, user.id))
    .orderBy(consumableCatalog.category, consumableCatalog.name);

  const enriched = stockItems.map((item) => {
    const isLow = item.currentQuantity <= item.reorderThreshold;
    const isCritical = item.currentQuantity === 0;
    const dailyUsage = Number(item.estimatedDailyUsage ?? 0);
    const daysRemaining = dailyUsage > 0 ? Math.floor(item.currentQuantity / dailyUsage) : null;

    return {
      ...item,
      isLow,
      isCritical,
      daysRemaining,
      reorderRecommended: isLow && item.lowStockAlertEnabled,
    };
  });

  res.json(enriched);
});

// GET /consumables/orders — client's order history
router.get("/consumables/orders", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const orders = await db.select({
    id: consumableOrders.id,
    quantity: consumableOrders.quantity,
    unitPrice: consumableOrders.unitPrice,
    total: consumableOrders.total,
    status: consumableOrders.status,
    orderedAt: consumableOrders.orderedAt,
    deliveredAt: consumableOrders.deliveredAt,
    notes: consumableOrders.notes,
    name: consumableCatalog.name,
    sku: consumableCatalog.sku,
    category: consumableCatalog.category,
    unitType: consumableCatalog.unitType,
  })
    .from(consumableOrders)
    .innerJoin(consumableCatalog, eq(consumableOrders.catalogItemId, consumableCatalog.id))
    .where(eq(consumableOrders.userId, user.id))
    .orderBy(desc(consumableOrders.orderedAt));

  res.json(orders);
});

// POST /consumables/stock — add a new supply item (creates catalog entry + stock row atomically)
router.post("/consumables/stock", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    name, category, sku, unitType, unitPrice,
    reorderThreshold, compatibleModels, description,
    currentQuantity, estimatedDailyUsage, lowStockAlertEnabled,
  } = req.body as {
    name?: string; category?: string; sku?: string; unitType?: string;
    unitPrice?: string; reorderThreshold?: number; compatibleModels?: string;
    description?: string; currentQuantity?: number; estimatedDailyUsage?: string;
    lowStockAlertEnabled?: boolean;
  };

  if (!name?.trim() || !category?.trim()) {
    res.status(400).json({ error: "name and category are required" });
    return;
  }
  if (typeof currentQuantity !== "number" || currentQuantity < 0) {
    res.status(400).json({ error: "currentQuantity must be a non-negative number" });
    return;
  }

  const generatedSku = sku?.trim() || `USR-${user.id.slice(-6).toUpperCase()}-${Date.now()}`;

  const [catalogItem] = await db.insert(consumableCatalog).values({
    name: name.trim(),
    sku: generatedSku,
    category: category as typeof consumableCatalog.$inferInsert["category"],
    unitType: unitType?.trim() || "units",
    unitPrice: unitPrice || "0",
    reorderThreshold: reorderThreshold ?? 5,
    compatibleModels: compatibleModels?.trim() || null,
    description: description?.trim() || null,
  }).returning();

  const [stockItem] = await db.insert(consumableStock).values({
    userId: user.id,
    catalogItemId: catalogItem!.id,
    currentQuantity,
    estimatedDailyUsage: estimatedDailyUsage || null,
    lastRestockedAt: currentQuantity > 0 ? new Date() : null,
    lowStockAlertEnabled: lowStockAlertEnabled ?? true,
  }).returning();

  const result = {
    ...stockItem,
    name: catalogItem!.name,
    sku: catalogItem!.sku,
    category: catalogItem!.category,
    unitType: catalogItem!.unitType,
    unitPrice: catalogItem!.unitPrice,
    reorderThreshold: catalogItem!.reorderThreshold,
    description: catalogItem!.description,
    compatibleModels: catalogItem!.compatibleModels,
    isLow: currentQuantity <= (reorderThreshold ?? 5),
    isCritical: currentQuantity === 0,
    daysRemaining: null,
    reorderRecommended: currentQuantity <= (reorderThreshold ?? 5) && (lowStockAlertEnabled ?? true),
  };

  res.status(201).json(result);
});

// POST /consumables/order — place a reorder
router.post("/consumables/order", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { catalogItemId, quantity, notes } = req.body as { catalogItemId: string; quantity: number; notes?: string };
  if (!catalogItemId || !quantity || quantity < 1) {
    res.status(400).json({ error: "catalogItemId and quantity are required" });
    return;
  }

  const [catalogItem] = await db.select().from(consumableCatalog).where(eq(consumableCatalog.id, catalogItemId));
  if (!catalogItem) { res.status(404).json({ error: "Catalog item not found" }); return; }

  const unitPrice = Number(catalogItem.unitPrice);
  const total = unitPrice * quantity;

  const [order] = await db.insert(consumableOrders).values({
    userId: user.id,
    catalogItemId,
    quantity,
    unitPrice: String(unitPrice),
    total: String(total),
    status: "pending",
    notes: notes ?? null,
  }).returning();

  res.status(201).json(order);
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// GET /admin/consumables — all client stock with alerts
router.get("/admin/consumables", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const stockItems = await db.select({
    id: consumableStock.id,
    userId: consumableStock.userId,
    catalogItemId: consumableStock.catalogItemId,
    currentQuantity: consumableStock.currentQuantity,
    estimatedDailyUsage: consumableStock.estimatedDailyUsage,
    lastRestockedAt: consumableStock.lastRestockedAt,
    lowStockAlertEnabled: consumableStock.lowStockAlertEnabled,
    name: consumableCatalog.name,
    sku: consumableCatalog.sku,
    category: consumableCatalog.category,
    unitType: consumableCatalog.unitType,
    unitPrice: consumableCatalog.unitPrice,
    reorderThreshold: consumableCatalog.reorderThreshold,
  })
    .from(consumableStock)
    .innerJoin(consumableCatalog, eq(consumableStock.catalogItemId, consumableCatalog.id))
    .orderBy(consumableStock.currentQuantity);

  const enriched = await Promise.all(stockItems.map(async (item) => {
    const [owner] = await db.select({
      fullName: usersTable.fullName,
      email: usersTable.email,
      companyName: usersTable.companyName,
    }).from(usersTable).where(eq(usersTable.id, item.userId));

    const isLow = item.currentQuantity <= item.reorderThreshold;
    const isCritical = item.currentQuantity === 0;
    const dailyUsage = Number(item.estimatedDailyUsage ?? 0);
    const daysRemaining = dailyUsage > 0 ? Math.floor(item.currentQuantity / dailyUsage) : null;

    return {
      ...item,
      ownerName: owner?.fullName ?? owner?.email ?? "Unknown",
      ownerEmail: owner?.email ?? "",
      ownerCompany: owner?.companyName ?? "",
      isLow,
      isCritical,
      daysRemaining,
      reorderRecommended: isLow && item.lowStockAlertEnabled,
    };
  }));

  res.json(enriched);
});

export default router;
