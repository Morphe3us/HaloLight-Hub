import { pgTable, text, uuid, timestamp, pgEnum, numeric, integer, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const consumableCategoryEnum = pgEnum("consumable_category", [
  "paper",
  "ribbon",
  "accessory",
  "cleaning",
]);

export const consumableOrderStatusEnum = pgEnum("consumable_order_status", [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

export const consumableCatalog = pgTable("consumable_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  category: consumableCategoryEnum("category").notNull(),
  description: text("description"),
  unitType: text("unit_type").notNull().default("units"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  reorderThreshold: integer("reorder_threshold").notNull().default(2),
  compatibleModels: text("compatible_models"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const consumableStock = pgTable(
  "consumable_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => consumableCatalog.id, { onDelete: "cascade" }),
    currentQuantity: integer("current_quantity").notNull().default(0),
    estimatedDailyUsage: numeric("estimated_daily_usage", { precision: 6, scale: 2 }),
    averagePrintsPerEvent: integer("average_prints_per_event"),
    quantityUnit: text("quantity_unit"),
    averageEventsPerMonth: numeric("average_events_per_month", { precision: 8, scale: 2 }),
    lastRestockedAt: timestamp("last_restocked_at"),
    lowStockAlertEnabled: boolean("low_stock_alert_enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("consumable_stock_user_catalog_idx").on(t.userId, t.catalogItemId)],
);

export const consumableOrders = pgTable("consumable_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  catalogItemId: uuid("catalog_item_id")
    .notNull()
    .references(() => consumableCatalog.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  status: consumableOrderStatusEnum("status").notNull().default("pending"),
  orderedAt: timestamp("ordered_at").notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
