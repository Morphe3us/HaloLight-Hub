import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const exportLogs = pgTable("export_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  exportType: text("export_type").notNull(),
  format: text("format").notNull(),
  scope: text("scope").notNull(),
  fileCount: integer("file_count").default(1),
  recordCounts: jsonb("record_counts"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
