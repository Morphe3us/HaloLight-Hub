import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  numeric,
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
  contractId: uuid("contract_id"),
  leadId: uuid("lead_id"),
  quoteId: uuid("quote_id"),
  revenue: numeric("revenue", { precision: 12, scale: 2 }),
  currency: text("currency"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
