import { pgTable, text, uuid, timestamp, pgEnum, integer, index, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type SupportAttachment = { id: string; key: string; fileName: string; mimeType: string; size: number };

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "waiting_on_client",
  "resolved",
  "closed",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const ticketCategoryEnum = pgEnum("ticket_category", [
  "billing",
  "technical",
  "general",
  "feature_request",
  "bug_report",
]);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    assignedTo: text("assigned_to").references(() => usersTable.id, { onDelete: "set null" }),
    ticketNumber: text("ticket_number").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    category: ticketCategoryEnum("category").notNull().default("general"),
    equipmentModel: text("equipment_model"),
    serialNumber: text("serial_number"),
    attachments: jsonb("attachments").$type<SupportAttachment[]>().notNull().default([]),
    resolvedAt: timestamp("resolved_at"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("support_tickets_user_status_idx").on(t.userId, t.status)],
);

export const supportTicketReplies = pgTable("support_ticket_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isStaff: integer("is_staff").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supportTicketMailOutbox = pgTable("support_ticket_mail_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().unique().references(() => supportTickets.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
}).enableRLS();

export const supportTicketMailHistory = pgTable("support_ticket_mail_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  outboxId: uuid("outbox_id").notNull().references(() => supportTicketMailOutbox.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  attempt: integer("attempt").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("support_ticket_mail_history_ticket_idx").on(t.ticketId, t.createdAt)]).enableRLS();
