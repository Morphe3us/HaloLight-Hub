import {
  db, usersTable,
  equipment, serviceHistory,
  consumableCatalog, consumableStock, consumableOrders,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const PRODUCT_MODELS = [
  "HaloLight Pro 2",
  "HaloLight Elite",
  "HaloLight Open Air",
  "HaloLight Studio 360",
];

const SERIAL_PREFIXES = ["HL2-", "HLE-", "HLOA-", "HLS360-"];

function monthsAgo(n: number, day = 15): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(day);
  return d;
}

function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}

export async function seedPhase6() {
  console.log("\nSeeding Phase 6 — Equipment & Consumables...");

  // ─── Consumable Catalog ────────────────────────────────────────────────────
  const existingCatalog = await db.select({ id: consumableCatalog.id }).from(consumableCatalog).limit(1);
  if (existingCatalog.length === 0) {
    await db.insert(consumableCatalog).values([
      {
        name: "4×6 Glossy Photo Paper",
        sku: "PAPER-4x6-GLO-400",
        category: "paper",
        description: "400-sheet pack of premium 4×6 glossy photo paper. Suitable for all HaloLight printers.",
        unitType: "packs",
        unitPrice: "49.99",
        reorderThreshold: 3,
        compatibleModels: "HaloLight Pro 2, HaloLight Elite, HaloLight Open Air",
      },
      {
        name: "4×6 Matte Photo Paper",
        sku: "PAPER-4x6-MAT-400",
        category: "paper",
        description: "400-sheet pack of premium 4×6 matte photo paper for a sophisticated finish.",
        unitType: "packs",
        unitPrice: "52.99",
        reorderThreshold: 3,
        compatibleModels: "HaloLight Pro 2, HaloLight Elite, HaloLight Open Air",
      },
      {
        name: "2×6 Strip Glossy Paper",
        sku: "PAPER-2x6-GLO-800",
        category: "paper",
        description: "800-strip pack of 2×6 glossy strip paper. Perfect for classic booth experiences.",
        unitType: "packs",
        unitPrice: "44.99",
        reorderThreshold: 4,
        compatibleModels: "HaloLight Pro 2, HaloLight Open Air",
      },
      {
        name: "DNP DS40 Ribbon (YMCO)",
        sku: "RIBBON-DNP-DS40-YMCO",
        category: "ribbon",
        description: "DNP DS40 YMCO ribbon cartridge. Yields ~400 4×6 prints per roll.",
        unitType: "rolls",
        unitPrice: "34.99",
        reorderThreshold: 2,
        compatibleModels: "HaloLight Pro 2, HaloLight Elite",
      },
      {
        name: "DNP DS620 Ribbon (YMCO)",
        sku: "RIBBON-DNP-DS620-YMCO",
        category: "ribbon",
        description: "DNP DS620 YMCO ribbon. Yields ~650 4×6 prints per roll.",
        unitType: "rolls",
        unitPrice: "41.99",
        reorderThreshold: 2,
        compatibleModels: "HaloLight Studio 360",
      },
      {
        name: "Printer Cleaning Kit",
        sku: "CLEAN-KIT-UNI",
        category: "cleaning",
        description: "Universal printer cleaning kit with cleaning cards, swabs, and solution.",
        unitType: "kits",
        unitPrice: "19.99",
        reorderThreshold: 1,
        compatibleModels: "All models",
      },
      {
        name: "Props Box — Standard",
        sku: "PROP-BOX-STD",
        category: "accessory",
        description: "80-piece standard props assortment. Hats, glasses, signs, and novelty items.",
        unitType: "boxes",
        unitPrice: "39.99",
        reorderThreshold: 1,
        compatibleModels: "All models",
      },
    ]);
    console.log("  ✓ Consumable catalog seeded (7 items)");
  } else {
    console.log("  - Skipped: consumable catalog already seeded");
  }

  // Get catalog items for references
  const catalog = await db.select().from(consumableCatalog);
  const paper4x6Glossy = catalog.find(c => c.sku === "PAPER-4x6-GLO-400");
  const paper4x6Matte  = catalog.find(c => c.sku === "PAPER-4x6-MAT-400");
  const paper2x6Strip  = catalog.find(c => c.sku === "PAPER-2x6-GLO-800");
  const ribbonDS40     = catalog.find(c => c.sku === "RIBBON-DNP-DS40-YMCO");
  const ribbonDS620    = catalog.find(c => c.sku === "RIBBON-DNP-DS620-YMCO");
  const cleaningKit    = catalog.find(c => c.sku === "CLEAN-KIT-UNI");
  const propsBox       = catalog.find(c => c.sku === "PROP-BOX-STD");

  // ─── Get Demo Clients ──────────────────────────────────────────────────────
  const clients = await db.select({ id: usersTable.id, email: usersTable.email, fullName: usersTable.fullName })
    .from(usersTable).where(eq(usersTable.role, "client"));

  if (clients.length === 0) {
    console.log("  - No clients found, skipping equipment seed");
    return;
  }

  const [sarah, marcus, aisha, tom, priya] = clients;

  // ─── Equipment ─────────────────────────────────────────────────────────────
  const existingEquipment = await db.select({ id: equipment.id }).from(equipment).limit(1);
  if (existingEquipment.length > 0) {
    console.log("  - Skipped: equipment already seeded");
  } else {
    const equipmentData: Array<typeof equipment.$inferInsert> = [];

    if (sarah) {
      equipmentData.push(
        {
          userId: sarah.id,
          productModel: "HaloLight Elite",
          serialNumber: "HLE-2024-001",
          purchaseDate: monthsAgo(18),
          warrantyExpiration: monthsFromNow(6),
          status: "active",
          lastMaintenanceDate: monthsAgo(2),
          nextMaintenanceDate: monthsFromNow(4),
          purchasePrice: "8499.00",
          vendorName: "HaloLight Direct",
          maintenanceNotes: "Printer head cleaned. All sensors calibrated. Operating at peak performance.",
        },
        {
          userId: sarah.id,
          productModel: "HaloLight Open Air",
          serialNumber: "HLOA-2024-002",
          purchaseDate: monthsAgo(10),
          warrantyExpiration: monthsFromNow(14),
          status: "active",
          lastMaintenanceDate: monthsAgo(1),
          nextMaintenanceDate: monthsFromNow(5),
          purchasePrice: "5299.00",
          vendorName: "HaloLight Direct",
          maintenanceNotes: "Ring light replaced. Backdrop mechanism serviced.",
        },
      );
    }

    if (marcus) {
      equipmentData.push({
        userId: marcus.id,
        productModel: "HaloLight Pro 2",
        serialNumber: "HL2-2023-101",
        purchaseDate: monthsAgo(24),
        warrantyExpiration: monthsAgo(0, 1),  // expiring soon (this month)
        status: "active",
        lastMaintenanceDate: monthsAgo(5),
        nextMaintenanceDate: monthsAgo(1),    // overdue maintenance
        purchasePrice: "6999.00",
        vendorName: "HaloLight Reseller",
        maintenanceNotes: "Minor scuff on exterior. Printer operational. Due for full service check.",
      });
    }

    if (aisha) {
      equipmentData.push({
        userId: aisha.id,
        productModel: "HaloLight Pro 2",
        serialNumber: "HL2-2024-205",
        purchaseDate: monthsAgo(14),
        warrantyExpiration: monthsFromNow(10),
        status: "in_service",
        lastMaintenanceDate: monthsAgo(3),
        nextMaintenanceDate: monthsFromNow(1),
        purchasePrice: "6999.00",
        vendorName: "HaloLight Direct",
        maintenanceNotes: "Currently in for printer calibration. Expected return in 5 days.",
      });
    }

    if (tom) {
      equipmentData.push({
        userId: tom.id,
        productModel: "HaloLight Open Air",
        serialNumber: "HLOA-2022-088",
        purchaseDate: monthsAgo(36),
        warrantyExpiration: monthsAgo(12),   // warranty expired
        status: "active",
        lastMaintenanceDate: monthsAgo(11),
        nextMaintenanceDate: monthsAgo(5),   // overdue
        purchasePrice: "4999.00",
        vendorName: "HaloLight Reseller",
        maintenanceNotes: "Warranty expired. Recommend discussing extended service plan or upgrade path.",
      });
    }

    if (priya) {
      equipmentData.push(
        {
          userId: priya.id,
          productModel: "HaloLight Studio 360",
          serialNumber: "HLS360-2024-301",
          purchaseDate: monthsAgo(8),
          warrantyExpiration: monthsFromNow(16),
          status: "active",
          lastMaintenanceDate: monthsAgo(1),
          nextMaintenanceDate: monthsFromNow(5),
          purchasePrice: "9999.00",
          vendorName: "HaloLight Direct",
          maintenanceNotes: "New install. All systems nominal. Full 360 rotation tested.",
        },
        {
          userId: priya.id,
          productModel: "HaloLight Pro 2",
          serialNumber: "HL2-2024-302",
          purchaseDate: monthsAgo(6),
          warrantyExpiration: monthsFromNow(18),
          status: "inactive",
          lastMaintenanceDate: null,
          nextMaintenanceDate: null,
          purchasePrice: "6999.00",
          vendorName: "HaloLight Direct",
          maintenanceNotes: "Backup unit. Not yet deployed.",
        },
      );
    }

    const insertedEquipment = await db.insert(equipment).values(equipmentData).returning({ id: equipment.id, serial: equipment.serialNumber, userId: equipment.userId });
    console.log(`  ✓ Seeded ${insertedEquipment.length} equipment records`);

    // ─── Service History ─────────────────────────────────────────────────────
    for (const eq_ of insertedEquipment) {
      const histories: Array<typeof serviceHistory.$inferInsert> = [];

      if (eq_.serial === "HLE-2024-001") {
        histories.push(
          { equipmentId: eq_.id, serviceDate: monthsAgo(14), serviceType: "inspection", description: "Initial setup and calibration. All systems verified.", technicianName: "Alex R.", cost: "0.00", nextServiceDate: monthsAgo(8) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(8), serviceType: "routine_maintenance", description: "6-month service: printer head clean, belt tension checked, exterior polished.", technicianName: "Alex R.", cost: "149.00", nextServiceDate: monthsAgo(2) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(2), serviceType: "routine_maintenance", description: "6-month service complete. Replaced feed rollers, updated firmware to v4.2.1.", technicianName: "Jamie K.", cost: "179.00", nextServiceDate: monthsFromNow(4) },
        );
      }

      if (eq_.serial === "HLOA-2024-002") {
        histories.push(
          { equipmentId: eq_.id, serviceDate: monthsAgo(9), serviceType: "inspection", description: "Initial setup inspection. Ring light positioned. Backdrop rail installed.", technicianName: "Sam T.", cost: "0.00", nextServiceDate: monthsAgo(3) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(3), serviceType: "repair", description: "Ring light LED strip replaced after partial failure at event. Tested thoroughly.", technicianName: "Sam T.", cost: "89.00", nextServiceDate: monthsFromNow(3) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(1), serviceType: "routine_maintenance", description: "Annual maintenance: all lighting tested, iPad holder re-secured, print station aligned.", technicianName: "Jamie K.", cost: "129.00", nextServiceDate: monthsFromNow(5) },
        );
      }

      if (eq_.serial === "HL2-2023-101") {
        histories.push(
          { equipmentId: eq_.id, serviceDate: monthsAgo(22), serviceType: "inspection", description: "Initial inspection on delivery. Minor transit scuff noted on base plate.", technicianName: "Alex R.", cost: "0.00", nextServiceDate: monthsAgo(16) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(16), serviceType: "routine_maintenance", description: "6-month service. Print head cleaned, firmware v3.9.0 installed.", technicianName: "Alex R.", cost: "149.00", nextServiceDate: monthsAgo(10) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(10), serviceType: "routine_maintenance", description: "12-month full service. Replaced cutter blade, cleaned all rollers. Warranty check completed.", technicianName: "Jamie K.", cost: "229.00", nextServiceDate: monthsAgo(4) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(5), serviceType: "repair", description: "Jam sensor malfunction at event. Sensor replaced. Unit returned same day.", technicianName: "Emergency Tech", cost: "199.00", nextServiceDate: monthsAgo(1) },
        );
      }

      if (eq_.serial === "HL2-2024-205") {
        histories.push(
          { equipmentId: eq_.id, serviceDate: monthsAgo(12), serviceType: "inspection", description: "Initial setup. Everything operational.", technicianName: "Sam T.", cost: "0.00", nextServiceDate: monthsAgo(6) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(6), serviceType: "routine_maintenance", description: "6-month service completed. Print head, rollers, and sensors all passed.", technicianName: "Sam T.", cost: "149.00", nextServiceDate: monthsAgo(0) },
          { equipmentId: eq_.id, serviceDate: new Date(), serviceType: "repair", description: "In for printer calibration. Colour drift detected at last event. Estimated 5 days.", technicianName: "Jamie K.", cost: "95.00", nextServiceDate: monthsFromNow(1) },
        );
      }

      if (eq_.serial === "HLOA-2022-088") {
        histories.push(
          { equipmentId: eq_.id, serviceDate: monthsAgo(34), serviceType: "inspection", description: "Initial setup.", technicianName: "Alex R.", cost: "0.00", nextServiceDate: monthsAgo(28) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(28), serviceType: "routine_maintenance", description: "6-month service.", technicianName: "Alex R.", cost: "149.00", nextServiceDate: monthsAgo(22) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(22), serviceType: "routine_maintenance", description: "12-month service. Updated firmware, replaced paper rollers.", technicianName: "Jamie K.", cost: "229.00", nextServiceDate: monthsAgo(16) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(16), serviceType: "routine_maintenance", description: "18-month service.", technicianName: "Sam T.", cost: "149.00", nextServiceDate: monthsAgo(10) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(11), serviceType: "warranty_claim", description: "Touch screen replaced under warranty before expiry.", technicianName: "Alex R.", cost: "0.00", nextServiceDate: monthsAgo(5) },
        );
      }

      if (eq_.serial === "HLS360-2024-301") {
        histories.push(
          { equipmentId: eq_.id, serviceDate: monthsAgo(7), serviceType: "inspection", description: "Full 360 platform commissioned. Motor, rotation tracking, and printer all calibrated.", technicianName: "Jamie K.", cost: "0.00", nextServiceDate: monthsAgo(1) },
          { equipmentId: eq_.id, serviceDate: monthsAgo(1), serviceType: "routine_maintenance", description: "6-month service. Rotation motor lubricated, firmware v2.1.0 installed. All clear.", technicianName: "Jamie K.", cost: "199.00", nextServiceDate: monthsFromNow(5) },
        );
      }

      if (histories.length > 0) {
        await db.insert(serviceHistory).values(histories);
      }
    }
    console.log("  ✓ Service history seeded");
  }

  // ─── Consumable Stock ──────────────────────────────────────────────────────
  const existingStock = await db.select({ id: consumableStock.id }).from(consumableStock).limit(1);
  if (existingStock.length > 0) {
    console.log("  - Skipped: consumable stock already seeded");
  } else {
    const stockData: Array<typeof consumableStock.$inferInsert> = [];

    const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

    if (sarah && paper4x6Glossy && ribbonDS40 && cleaningKit && propsBox) {
      stockData.push(
        { userId: sarah.id, catalogItemId: paper4x6Glossy.id, currentQuantity: 8, estimatedDailyUsage: "0.6", lastRestockedAt: daysAgo(14), lowStockAlertEnabled: true },
        { userId: sarah.id, catalogItemId: paper4x6Matte!.id, currentQuantity: 5, estimatedDailyUsage: "0.3", lastRestockedAt: daysAgo(21), lowStockAlertEnabled: true },
        { userId: sarah.id, catalogItemId: ribbonDS40.id, currentQuantity: 6, estimatedDailyUsage: "0.5", lastRestockedAt: daysAgo(10), lowStockAlertEnabled: true },
        { userId: sarah.id, catalogItemId: cleaningKit.id, currentQuantity: 3, estimatedDailyUsage: "0.1", lastRestockedAt: daysAgo(60), lowStockAlertEnabled: true },
        { userId: sarah.id, catalogItemId: propsBox.id, currentQuantity: 2, estimatedDailyUsage: "0.05", lastRestockedAt: daysAgo(90), lowStockAlertEnabled: false },
      );
    }

    if (marcus && paper4x6Glossy && ribbonDS40) {
      stockData.push(
        { userId: marcus.id, catalogItemId: paper4x6Glossy.id, currentQuantity: 2, estimatedDailyUsage: "0.7", lastRestockedAt: daysAgo(30), lowStockAlertEnabled: true },  // LOW
        { userId: marcus.id, catalogItemId: paper2x6Strip!.id, currentQuantity: 3, estimatedDailyUsage: "0.5", lastRestockedAt: daysAgo(25), lowStockAlertEnabled: true },
        { userId: marcus.id, catalogItemId: ribbonDS40.id, currentQuantity: 1, estimatedDailyUsage: "0.6", lastRestockedAt: daysAgo(35), lowStockAlertEnabled: true },        // LOW
        { userId: marcus.id, catalogItemId: cleaningKit!.id, currentQuantity: 0, estimatedDailyUsage: "0.1", lastRestockedAt: daysAgo(90), lowStockAlertEnabled: true },       // CRITICAL
      );
    }

    if (aisha && paper4x6Glossy && ribbonDS40) {
      stockData.push(
        { userId: aisha.id, catalogItemId: paper4x6Glossy.id, currentQuantity: 4, estimatedDailyUsage: "0.4", lastRestockedAt: daysAgo(20), lowStockAlertEnabled: true },
        { userId: aisha.id, catalogItemId: ribbonDS40.id, currentQuantity: 2, estimatedDailyUsage: "0.4", lastRestockedAt: daysAgo(28), lowStockAlertEnabled: true },
      );
    }

    if (tom && paper4x6Glossy && ribbonDS40) {
      stockData.push(
        { userId: tom.id, catalogItemId: paper4x6Glossy.id, currentQuantity: 1, estimatedDailyUsage: "0.3", lastRestockedAt: daysAgo(60), lowStockAlertEnabled: true },        // LOW
        { userId: tom.id, catalogItemId: paper2x6Strip!.id, currentQuantity: 2, estimatedDailyUsage: "0.3", lastRestockedAt: daysAgo(45), lowStockAlertEnabled: true },
        { userId: tom.id, catalogItemId: ribbonDS40.id, currentQuantity: 2, estimatedDailyUsage: "0.3", lastRestockedAt: daysAgo(55), lowStockAlertEnabled: true },
      );
    }

    if (priya && paper4x6Glossy && ribbonDS620 && cleaningKit) {
      stockData.push(
        { userId: priya.id, catalogItemId: paper4x6Glossy.id, currentQuantity: 10, estimatedDailyUsage: "0.8", lastRestockedAt: daysAgo(7), lowStockAlertEnabled: true },
        { userId: priya.id, catalogItemId: ribbonDS620.id, currentQuantity: 5, estimatedDailyUsage: "0.7", lastRestockedAt: daysAgo(12), lowStockAlertEnabled: true },
        { userId: priya.id, catalogItemId: cleaningKit.id, currentQuantity: 2, estimatedDailyUsage: "0.1", lastRestockedAt: daysAgo(30), lowStockAlertEnabled: true },
        { userId: priya.id, catalogItemId: propsBox!.id, currentQuantity: 3, estimatedDailyUsage: "0.05", lastRestockedAt: daysAgo(45), lowStockAlertEnabled: false },
      );
    }

    await db.insert(consumableStock).values(stockData);
    console.log(`  ✓ Consumable stock seeded (${stockData.length} records)`);

    // ─── Order History ─────────────────────────────────────────────────────
    const orderData: Array<typeof consumableOrders.$inferInsert> = [];
    const dDate = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

    if (sarah && paper4x6Glossy && ribbonDS40) {
      orderData.push(
        { userId: sarah.id, catalogItemId: paper4x6Glossy.id, quantity: 12, unitPrice: "49.99", total: "599.88", status: "delivered", orderedAt: dDate(60), deliveredAt: dDate(55) },
        { userId: sarah.id, catalogItemId: ribbonDS40.id, quantity: 10, unitPrice: "34.99", total: "349.90", status: "delivered", orderedAt: dDate(45), deliveredAt: dDate(41) },
        { userId: sarah.id, catalogItemId: paper4x6Glossy.id, quantity: 6, unitPrice: "49.99", total: "299.94", status: "delivered", orderedAt: dDate(14), deliveredAt: dDate(11) },
      );
    }

    if (marcus && paper4x6Glossy && ribbonDS40) {
      orderData.push(
        { userId: marcus.id, catalogItemId: paper4x6Glossy.id, quantity: 6, unitPrice: "49.99", total: "299.94", status: "delivered", orderedAt: dDate(90), deliveredAt: dDate(85) },
        { userId: marcus.id, catalogItemId: ribbonDS40.id, quantity: 5, unitPrice: "34.99", total: "174.95", status: "delivered", orderedAt: dDate(65), deliveredAt: dDate(61) },
        { userId: marcus.id, catalogItemId: paper4x6Glossy.id, quantity: 4, unitPrice: "49.99", total: "199.96", status: "shipped", orderedAt: dDate(3), deliveredAt: null, notes: "Rush order — running critically low" },
      );
    }

    if (priya && ribbonDS620) {
      orderData.push(
        { userId: priya.id, catalogItemId: ribbonDS620.id, quantity: 8, unitPrice: "41.99", total: "335.92", status: "delivered", orderedAt: dDate(45), deliveredAt: dDate(40) },
        { userId: priya.id, catalogItemId: paper4x6Glossy!.id, quantity: 10, unitPrice: "49.99", total: "499.90", status: "delivered", orderedAt: dDate(10), deliveredAt: dDate(7) },
      );
    }

    if (orderData.length > 0) {
      await db.insert(consumableOrders).values(orderData);
      console.log(`  ✓ Order history seeded (${orderData.length} orders)`);
    }
  }

  console.log("  ✅ Phase 6 seed complete");
}
