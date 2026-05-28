import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  numeric,
  json,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const eventStatusEnum = pgEnum("event_status", [
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  eventDate: timestamp("event_date").notNull(),
  location: text("location"),
  type: text("type"),
  status: eventStatusEnum("status").notNull().default("upcoming"),
  notes: text("notes"),
  // Pipeline links
  leadId: uuid("lead_id"),
  quoteId: uuid("quote_id"),
  contractId: uuid("contract_id"),
  invoiceId: uuid("invoice_id"),
  // Client info (denormalized for operational readiness)
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),
  clientCompany: text("client_company"),
  // Service details
  eventStartTime: text("event_start_time"),
  eventEndTime: text("event_end_time"),
  packageName: text("package_name"),
  rentalDuration: text("rental_duration"),
  includedPrints: text("included_prints"),
  equipmentIds: json("equipment_ids").$type<string[]>(),
  equipmentDescription: text("equipment_description"),
  optionsList: text("options_list"),
  // Financial
  revenue: numeric("revenue", { precision: 12, scale: 2 }),
  currency: text("currency"),
  paymentStatus: text("payment_status"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
