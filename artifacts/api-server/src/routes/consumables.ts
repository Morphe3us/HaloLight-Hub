import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { eq, desc, and, lte, sql, gte, asc } from "drizzle-orm";
import { db, usersTable, consumableCatalog, consumableStock, consumableOrders, events } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { consumableUsage, parseConsumableUsage } from "../lib/consumableUsage";

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
    quantityUnit: consumableStock.quantityUnit,
    estimatedDailyUsage: consumableStock.estimatedDailyUsage,
    averagePrintsPerEvent: consumableStock.averagePrintsPerEvent,
    averageEventsPerMonth: consumableStock.averageEventsPerMonth,
    lastRestockedAt: consumableStock.lastRestockedAt,
    lowStockAlertEnabled: consumableStock.lowStockAlertEnabled,
    updatedAt: consumableStock.updatedAt,
    name: consumableCatalog.name,
    sku: consumableCatalog.sku,
    category: consumableCatalog.category,
    unitType: sql<string>`coalesce(${consumableStock.quantityUnit}, ${consumableCatalog.unitType})`,
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

    return {
      ...item,
      isLow,
      isCritical,
      daysRemaining: null,
      ...consumableUsage(item),
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
  } = (req.body ?? {}) as {
    name?: string; category?: string; sku?: string; unitType?: string;
    unitPrice?: string; reorderThreshold?: number; compatibleModels?: string;
    description?: string; currentQuantity?: number; estimatedDailyUsage?: string;
    lowStockAlertEnabled?: boolean;
  };

  if (typeof name !== "string" || !name.trim() || name.length > 200 || !["paper", "ribbon", "accessory", "cleaning"].includes(category ?? "")) {
    res.status(400).json({ error: "name and category are required" });
    return;
  }
  if (typeof currentQuantity !== "number" || !Number.isInteger(currentQuantity) || currentQuantity < 0 || currentQuantity > 2147483647) {
    res.status(400).json({ error: "currentQuantity must be a non-negative number" });
    return;
  }

  let usage: ReturnType<typeof parseConsumableUsage>;
  try { usage = parseConsumableUsage(req.body); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  if ((reorderThreshold !== undefined && (!Number.isInteger(reorderThreshold) || reorderThreshold < 0 || reorderThreshold > 2147483647)) ||
    [sku, unitType, compatibleModels, description].some(value => value != null && (typeof value !== "string" || value.length > 2000)) ||
    (unitPrice != null && (typeof unitPrice !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(unitPrice))) ||
    (estimatedDailyUsage != null && (typeof estimatedDailyUsage !== "string" || !/^\d{1,4}(\.\d{1,2})?$/.test(estimatedDailyUsage))) ||
    (lowStockAlertEnabled !== undefined && typeof lowStockAlertEnabled !== "boolean")) {
    res.status(400).json({ error: "Invalid stock fields" }); return;
  }
  const generatedSku = sku?.trim() || `USR-${randomUUID()}`;
  const stockUnit = category === "paper" ? "prints" : unitType?.trim() || "units";
  if ((category === "paper" && unitType?.trim() && unitType.trim() !== "prints") ||
    (stockUnit !== "prints" && Object.values(usage).some(value => value !== null))) {
    res.status(400).json({ error: "Event estimates require stock expressed in prints; paper quantities must be prints" }); return;
  }

  let result;
  try { result = await db.transaction(async tx => {
  const [catalogItem] = await tx.insert(consumableCatalog).values({
    name: name.trim(),
    sku: generatedSku,
    category: category as typeof consumableCatalog.$inferInsert["category"],
    unitType: stockUnit,
    unitPrice: unitPrice || "0",
    reorderThreshold: reorderThreshold ?? 5,
    compatibleModels: compatibleModels?.trim() || null,
    description: description?.trim() || null,
  }).returning();

  const [stockItem] = await tx.insert(consumableStock).values({
    userId: user.id,
    catalogItemId: catalogItem!.id,
    currentQuantity,
    quantityUnit: stockUnit,
    estimatedDailyUsage: estimatedDailyUsage || null,
    ...usage,
    lastRestockedAt: currentQuantity > 0 ? new Date() : null,
    lowStockAlertEnabled: lowStockAlertEnabled ?? true,
  }).returning();

  return {
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
    ...consumableUsage({ ...stockItem!, unitType: stockUnit }),
    reorderRecommended: currentQuantity <= (reorderThreshold ?? 5) && (lowStockAlertEnabled ?? true),
  };
  }); } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    res.status(code === "23505" ? 409 : 503).json({ error: code === "23505" ? "SKU already exists" : "Stock creation failed" }); return;
  }

  res.status(201).json(result);
});

// Usage belongs to the stock owner, including when the caller is an administrator.
router.patch("/consumables/stock/:id/usage", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.params.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { res.status(400).json({ error: "Invalid stock ID" }); return; }
  let usage: ReturnType<typeof parseConsumableUsage>;
  const currentQuantityPrints = req.body?.currentQuantityPrints;
  try {
    usage = parseConsumableUsage(req.body);
    if ((!Object.keys(usage).length && currentQuantityPrints === undefined) || Object.keys(req.body).some(key => !["averagePrintsPerEvent", "averageEventsPerMonth", "currentQuantityPrints"].includes(key))) throw new Error("Provide only event usage settings");
    if (currentQuantityPrints !== undefined && (typeof currentQuantityPrints !== "number" || !Number.isInteger(currentQuantityPrints) || currentQuantityPrints < 0 || currentQuantityPrints > 2000000000)) throw new Error("currentQuantityPrints must be a verified integer total from 0 to 2000000000");
  } catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const result = await db.transaction(async tx => {
  const [owned] = await tx.select({ unitType: sql<string>`coalesce(${consumableStock.quantityUnit}, ${consumableCatalog.unitType})` }).from(consumableStock)
    .innerJoin(consumableCatalog, eq(consumableStock.catalogItemId, consumableCatalog.id))
    .where(and(eq(consumableStock.id, id), eq(consumableStock.userId, user.id))).for("update", { of: consumableStock });
  if (!owned) return { status: 404, body: { error: "Stock item not found" } };
  if (owned.unitType !== "prints" && currentQuantityPrints === undefined) return { status: 409, body: { error: "Enter the verified remaining print quantity to convert your stock" } };
  const [updated] = await tx.update(consumableStock).set({ ...usage,
    ...(currentQuantityPrints === undefined ? {} : { currentQuantity: currentQuantityPrints, quantityUnit: "prints" }), updatedAt: new Date() })
    .where(and(eq(consumableStock.id, id), eq(consumableStock.userId, user.id))).returning();
  if (!updated) return { status: 404, body: { error: "Stock item not found" } };
  const unitType = updated.quantityUnit ?? owned.unitType;
  return { status: 200, body: { id: updated.id, currentQuantity: updated.currentQuantity, quantityUnit: updated.quantityUnit, unitType,
    averagePrintsPerEvent: updated.averagePrintsPerEvent, averageEventsPerMonth: updated.averageEventsPerMonth,
    ...consumableUsage({ ...updated, unitType }) } };
  });
  res.status(result.status).json(result.body);
});

// POST /consumables/restock — record a purchase and increase stock
router.post("/consumables/restock", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    stockItemId, rollsPurchased, printsPerRoll, purchaseDate,
    supplierName, unitPricePerRoll, notes,
  } = req.body as {
    stockItemId?: string; rollsPurchased?: number; printsPerRoll?: number;
    purchaseDate?: string; supplierName?: string; unitPricePerRoll?: string;
    notes?: string;
  };

  if (!stockItemId || !rollsPurchased || rollsPurchased < 1 || !printsPerRoll || printsPerRoll < 1 || !purchaseDate) {
    res.status(400).json({ error: "stockItemId, rollsPurchased, printsPerRoll, and purchaseDate are required" });
    return;
  }

  // Verify the stock item belongs to this user
  const [stockItem] = await db.select({
    id: consumableStock.id,
    userId: consumableStock.userId,
    catalogItemId: consumableStock.catalogItemId,
    currentQuantity: consumableStock.currentQuantity,
    quantityUnit: consumableStock.quantityUnit,
    lowStockAlertEnabled: consumableStock.lowStockAlertEnabled,
    estimatedDailyUsage: consumableStock.estimatedDailyUsage,
    averagePrintsPerEvent: consumableStock.averagePrintsPerEvent,
    averageEventsPerMonth: consumableStock.averageEventsPerMonth,
  }).from(consumableStock).where(and(eq(consumableStock.id, stockItemId), eq(consumableStock.userId, user.id)));

  if (!stockItem) { res.status(404).json({ error: "Stock item not found" }); return; }

  const [catalogItem] = await db.select().from(consumableCatalog).where(eq(consumableCatalog.id, stockItem.catalogItemId));
  if (!catalogItem) { res.status(404).json({ error: "Catalog item not found" }); return; }
  const unitType = stockItem.quantityUnit ?? catalogItem.unitType;
  if (unitType !== "prints") { res.status(409).json({ error: "Print restocking requires stock recorded in prints; existing quantities are unchanged" }); return; }

  const totalAdded = rollsPurchased * printsPerRoll;
  const newQuantity = stockItem.currentQuantity + totalAdded;

  // Build a descriptive note for order history
  const autoNote = `${rollsPurchased} roll${rollsPurchased > 1 ? "s" : ""} × ${printsPerRoll} prints/roll${supplierName ? ` · Supplier: ${supplierName}` : ""}${notes ? ` · ${notes}` : ""}`;

  const pricePerRoll = unitPricePerRoll ? Number(unitPricePerRoll) : 0;
  const total = pricePerRoll * rollsPurchased;

  // Record in order history as a delivered purchase
  await db.insert(consumableOrders).values({
    userId: user.id,
    catalogItemId: stockItem.catalogItemId,
    quantity: totalAdded,
    unitPrice: unitPricePerRoll ?? "0",
    total: String(total),
    status: "delivered",
    orderedAt: new Date(purchaseDate),
    deliveredAt: new Date(purchaseDate),
    notes: autoNote,
  });

  // Update stock quantity and last restocked date
  await db.update(consumableStock).set({
    currentQuantity: newQuantity,
    lastRestockedAt: new Date(purchaseDate),
    updatedAt: new Date(),
  }).where(eq(consumableStock.id, stockItemId));

  const isLow = newQuantity <= catalogItem.reorderThreshold;
  const isCritical = newQuantity === 0;

  res.json({
    id: stockItem.id,
    catalogItemId: stockItem.catalogItemId,
    userId: stockItem.userId,
    currentQuantity: newQuantity,
    estimatedDailyUsage: stockItem.estimatedDailyUsage,
    averagePrintsPerEvent: stockItem.averagePrintsPerEvent,
    averageEventsPerMonth: stockItem.averageEventsPerMonth,
    lastRestockedAt: new Date(purchaseDate).toISOString(),
    lowStockAlertEnabled: stockItem.lowStockAlertEnabled,
    name: catalogItem.name,
    sku: catalogItem.sku,
    category: catalogItem.category,
    unitType,
    quantityUnit: stockItem.quantityUnit,
    unitPrice: catalogItem.unitPrice,
    reorderThreshold: catalogItem.reorderThreshold,
    description: catalogItem.description,
    compatibleModels: catalogItem.compatibleModels,
    isLow,
    isCritical,
    daysRemaining: null,
    ...consumableUsage({ ...stockItem, currentQuantity: newQuantity, unitType }),
    reorderRecommended: isLow && stockItem.lowStockAlertEnabled,
  });
});

// POST /consumables/orders — place a reorder
router.post("/consumables/orders", requireAuth, async (req: Request, res: Response): Promise<void> => {
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
    quantityUnit: consumableStock.quantityUnit,
    estimatedDailyUsage: consumableStock.estimatedDailyUsage,
    averagePrintsPerEvent: consumableStock.averagePrintsPerEvent,
    averageEventsPerMonth: consumableStock.averageEventsPerMonth,
    lastRestockedAt: consumableStock.lastRestockedAt,
    lowStockAlertEnabled: consumableStock.lowStockAlertEnabled,
    name: consumableCatalog.name,
    sku: consumableCatalog.sku,
    category: consumableCatalog.category,
    unitType: sql<string>`coalesce(${consumableStock.quantityUnit}, ${consumableCatalog.unitType})`,
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

    return {
      ...item,
      ownerName: owner?.fullName ?? owner?.email ?? "Unknown",
      ownerEmail: owner?.email ?? "",
      ownerCompany: owner?.companyName ?? "",
      isLow,
      isCritical,
      daysRemaining: null,
      ...consumableUsage(item),
      reorderRecommended: isLow && item.lowStockAlertEnabled,
    };
  }));

  res.json(enriched);
});

// GET /consumables/forecast — upcoming events vs available paper stock
router.get("/consumables/forecast", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now = new Date();

  const upcomingEvents = await db.select({
    id: events.id,
    title: events.title,
    eventDate: events.eventDate,
    includedPrints: events.includedPrints,
    clientName: events.clientName,
    location: events.location,
  })
    .from(events)
    .where(
      and(
        eq(events.userId, user.id),
        gte(events.eventDate, now),
      )
    )
    .orderBy(asc(events.eventDate))
    .limit(20);

  const eventForecasts = upcomingEvents.map((ev) => {
    const prints = (ev.includedPrints ?? "").toLowerCase();
    let count = 0;
    if (prints.includes("unlimited")) {
      count = 600;
    } else {
      const match = prints.match(/\d+/);
      if (match) count = parseInt(match[0], 10);
    }
    return { ...ev, printsCount: count };
  });

  const totalRequired = eventForecasts.reduce((s, ev) => s + ev.printsCount, 0);

  const paperStock = await db.select({
    id: consumableStock.id,
    catalogItemId: consumableStock.catalogItemId,
    currentQuantity: consumableStock.currentQuantity,
    name: consumableCatalog.name,
    category: consumableCatalog.category,
  })
    .from(consumableStock)
    .innerJoin(consumableCatalog, eq(consumableStock.catalogItemId, consumableCatalog.id))
    .where(
      and(
        eq(consumableStock.userId, user.id),
        sql`coalesce(${consumableStock.quantityUnit}, ${consumableCatalog.unitType}) = 'prints'`,
        sql`lower(${consumableCatalog.category}) LIKE '%paper%'`
      )
    );

  const totalAvailable = paperStock.reduce((s, item) => s + item.currentQuantity, 0);

  res.json({
    eventsCount: upcomingEvents.length,
    totalRequired,
    totalAvailable,
    shortage: Math.max(0, totalRequired - totalAvailable),
    events: eventForecasts,
    paperStock,
  });
});

export default router;
