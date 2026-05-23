import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, usersTable, equipment, serviceHistory } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /equipment — client's own equipment
router.get("/equipment", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const items = await db.select().from(equipment)
    .where(eq(equipment.userId, user.id))
    .orderBy(desc(equipment.createdAt));

  res.json(items);
});

// GET /equipment/:id — single equipment with service history
router.get("/equipment/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = String(req.params.id);
  const [item] = await db.select().from(equipment)
    .where(and(eq(equipment.id, id), eq(equipment.userId, user.id)));

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  const history = await db.select().from(serviceHistory)
    .where(eq(serviceHistory.equipmentId, id))
    .orderBy(desc(serviceHistory.serviceDate));

  res.json({ ...item, serviceHistory: history });
});

// POST /equipment — register new equipment
router.post("/equipment", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const {
    productModel, serialNumber, purchaseDate, warrantyExpiration,
    maintenanceNotes, purchasePrice, vendorName,
  } = req.body as Record<string, string>;

  if (!productModel || !serialNumber) {
    res.status(400).json({ error: "productModel and serialNumber are required" });
    return;
  }

  const [item] = await db.insert(equipment).values({
    userId: user.id,
    productModel,
    serialNumber,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
    warrantyExpiration: warrantyExpiration ? new Date(warrantyExpiration) : null,
    maintenanceNotes: maintenanceNotes ?? null,
    purchasePrice: purchasePrice ?? null,
    vendorName: vendorName ?? null,
    status: "active",
  }).returning();

  res.status(201).json(item);
});

// PUT /equipment/:id — update equipment
router.put("/equipment/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = String(req.params.id);
  const [existing] = await db.select({ id: equipment.id }).from(equipment)
    .where(and(eq(equipment.id, id), eq(equipment.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { status, maintenanceNotes, nextMaintenanceDate, warrantyExpiration } = req.body as Record<string, string>;

  const [updated] = await db.update(equipment).set({
    ...(status ? { status: status as typeof equipment.$inferInsert["status"] } : {}),
    ...(maintenanceNotes !== undefined ? { maintenanceNotes } : {}),
    ...(nextMaintenanceDate ? { nextMaintenanceDate: new Date(nextMaintenanceDate) } : {}),
    ...(warrantyExpiration ? { warrantyExpiration: new Date(warrantyExpiration) } : {}),
    updatedAt: new Date(),
  }).where(eq(equipment.id, id)).returning();

  res.json(updated);
});

// POST /equipment/:id/service — add service record
router.post("/equipment/:id/service", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const equipmentId = String(req.params.id);
  const [item] = await db.select({ id: equipment.id }).from(equipment)
    .where(and(eq(equipment.id, equipmentId), eq(equipment.userId, user.id)));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  const { serviceDate, serviceType, description, technicianName, cost, nextServiceDate } = req.body as Record<string, string>;

  if (!serviceDate || !serviceType || !description) {
    res.status(400).json({ error: "serviceDate, serviceType, and description are required" });
    return;
  }

  const [record] = await db.insert(serviceHistory).values({
    equipmentId,
    serviceDate: new Date(serviceDate),
    serviceType: serviceType as typeof serviceHistory.$inferInsert["serviceType"],
    description,
    technicianName: technicianName ?? null,
    cost: cost ?? null,
    nextServiceDate: nextServiceDate ? new Date(nextServiceDate) : null,
  }).returning();

  // Update lastMaintenanceDate and nextMaintenanceDate on parent
  await db.update(equipment).set({
    lastMaintenanceDate: new Date(serviceDate),
    ...(nextServiceDate ? { nextMaintenanceDate: new Date(nextServiceDate) } : {}),
    updatedAt: new Date(),
  }).where(eq(equipment.id, equipmentId));

  res.status(201).json(record);
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// GET /admin/equipment — all client equipment
router.get("/admin/equipment", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const items = await db.select({
    id: equipment.id,
    userId: equipment.userId,
    productModel: equipment.productModel,
    serialNumber: equipment.serialNumber,
    purchaseDate: equipment.purchaseDate,
    warrantyExpiration: equipment.warrantyExpiration,
    status: equipment.status,
    maintenanceNotes: equipment.maintenanceNotes,
    lastMaintenanceDate: equipment.lastMaintenanceDate,
    nextMaintenanceDate: equipment.nextMaintenanceDate,
    purchasePrice: equipment.purchasePrice,
    vendorName: equipment.vendorName,
    createdAt: equipment.createdAt,
  }).from(equipment).orderBy(desc(equipment.createdAt));

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const enriched = await Promise.all(items.map(async (item) => {
    const [owner] = await db.select({
      fullName: usersTable.fullName,
      email: usersTable.email,
      companyName: usersTable.companyName,
    }).from(usersTable).where(eq(usersTable.id, item.userId));

    const warrantyExpired = item.warrantyExpiration ? item.warrantyExpiration < now : false;
    const warrantyExpiringSoon = item.warrantyExpiration
      ? item.warrantyExpiration > now && item.warrantyExpiration < thirtyDays
      : false;
    const maintenanceOverdue = item.nextMaintenanceDate ? item.nextMaintenanceDate < now : false;
    const maintenanceDueSoon = item.nextMaintenanceDate
      ? item.nextMaintenanceDate > now && item.nextMaintenanceDate < thirtyDays
      : false;

    return {
      ...item,
      ownerName: owner?.fullName ?? owner?.email ?? "Unknown",
      ownerEmail: owner?.email ?? "",
      ownerCompany: owner?.companyName ?? "",
      warrantyExpired,
      warrantyExpiringSoon,
      maintenanceOverdue,
      maintenanceDueSoon,
    };
  }));

  res.json(enriched);
});

// GET /admin/equipment/:id — admin view of single equipment with full service history
router.get("/admin/equipment/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const id = String(req.params.id);
  const [item] = await db.select().from(equipment).where(eq(equipment.id, id));
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  const history = await db.select().from(serviceHistory)
    .where(eq(serviceHistory.equipmentId, id))
    .orderBy(desc(serviceHistory.serviceDate));

  const [owner] = await db.select({
    fullName: usersTable.fullName,
    email: usersTable.email,
    companyName: usersTable.companyName,
  }).from(usersTable).where(eq(usersTable.id, item.userId));

  res.json({ ...item, serviceHistory: history, owner });
});

export default router;
