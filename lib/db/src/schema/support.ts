import { pgTable, text, uuid, timestamp, pgEnum, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

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
