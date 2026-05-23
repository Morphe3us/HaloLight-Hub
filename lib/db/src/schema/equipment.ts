import { pgTable, text, uuid, timestamp, pgEnum, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const equipmentStatusEnum = pgEnum("equipment_status", [
  "active",
  "inactive",
  "in_service",
  "retired",
]);

export const serviceTypeEnum = pgEnum("service_type", [
  "routine_maintenance",
  "repair",
  "upgrade",
  "inspection",
  "warranty_claim",
]);

export const equipment = pgTable("equipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  productModel: text("product_model").notNull(),
  serialNumber: text("serial_number").notNull().unique(),
  purchaseDate: timestamp("purchase_date"),
  warrantyExpiration: timestamp("warranty_expiration"),
  status: equipmentStatusEnum("status").notNull().default("active"),
  maintenanceNotes: text("maintenance_notes"),
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
  vendorName: text("vendor_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serviceHistory = pgTable("service_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  equipmentId: uuid("equipment_id")
    .notNull()
    .references(() => equipment.id, { onDelete: "cascade" }),
  serviceDate: timestamp("service_date").notNull(),
  serviceType: serviceTypeEnum("service_type").notNull(),
  description: text("description").notNull(),
  technicianName: text("technician_name"),
  cost: numeric("cost", { precision: 10, scale: 2 }),
  nextServiceDate: timestamp("next_service_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
