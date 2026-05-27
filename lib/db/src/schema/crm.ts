import { pgTable, text, uuid, timestamp, pgEnum, numeric, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "website",
  "referral",
  "social_media",
  "trade_show",
  "cold_outreach",
  "inbound_call",
  "other",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "note",
  "call",
  "email",
  "meeting",
  "status_change",
  "quote_sent",
  "contract_sent",
  "invoice_sent",
]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  source: leadSourceEnum("source").notNull().default("other"),
  status: leadStatusEnum("status").notNull().default("new"),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  address: text("address"),
  eventType: text("event_type"),
  expectedEventDate: timestamp("expected_event_date"),
  assignedTo: text("assigned_to"),
  pipelineStage: text("pipeline_stage").notNull().default("lead"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leadActivities = pgTable("lead_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: activityTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
