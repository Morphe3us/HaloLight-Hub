import { pgTable, text, uuid, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userDashboardPreferences = pgTable("user_dashboard_preferences", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  widgets: jsonb("widgets").$type<Record<string, boolean>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const userConsentEvents = pgTable("user_consent_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  termsVersion: text("terms_version").notNull(),
  privacyVersion: text("privacy_version").notNull(),
  termsUrl: text("terms_url").notNull(),
  privacyUrl: text("privacy_url").notNull(),
  marketing: boolean("marketing").notNull().default(false),
  analytics: boolean("analytics").notNull().default(false),
  aiImprovement: boolean("ai_improvement").notNull().default(false),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("user_consent_events_user_date_idx").on(t.userId, t.acceptedAt)]).enableRLS();
