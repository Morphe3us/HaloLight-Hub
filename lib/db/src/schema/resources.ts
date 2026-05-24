import { pgTable, text, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const resourceCategoryEnum = pgEnum("resource_category", [
  "pdf",
  "marketing",
  "template",
  "contract",
  "checklist",
  "guide",
]);

export const resourceStatusEnum = pgEnum("resource_status", [
  "draft",
  "published",
]);

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  category: resourceCategoryEnum("category").notNull(),
  language: text("language").notNull().default("en"),
  fileUrl: text("file_url").notNull().default(""),
  description: text("description"),
  status: resourceStatusEnum("status").notNull().default("draft"),
  authorId: text("author_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
