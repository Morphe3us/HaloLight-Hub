import { pgTable, text, boolean, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    isRead: boolean("is_read").notNull().default(false),
    deliveredEmail: boolean("delivered_email").notNull().default(false),
    deliveredPush: boolean("delivered_push").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_read_idx").on(t.userId, t.isRead)],
);

export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  typeOverrides: text("type_overrides").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferencesTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
export type NotificationPreferences = typeof notificationPreferencesTable.$inferSelect;
