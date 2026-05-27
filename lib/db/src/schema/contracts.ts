import { pgTable, text, uuid, timestamp, pgEnum, numeric, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { leads } from "./crm";
import { quotes } from "./quotes";

export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "sent",
  "signed",
  "active",
  "expired",
  "cancelled",
]);

export const contractTemplates = pgTable("contract_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  language: text("language").notNull().default("en"),
  title: text("title").notNull(),
  category: text("category").notNull().default("general"),
  content: text("content").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
  contractNumber: text("contract_number").notNull(),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email"),
  status: contractStatusEnum("status").notNull().default("draft"),
  content: text("content").notNull().default(""),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  signedAt: timestamp("signed_at"),
  sentAt: timestamp("sent_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
