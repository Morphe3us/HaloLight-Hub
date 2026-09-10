import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const articleStatusEnum = pgEnum("article_status", [
  "draft",
  "published",
  "archived",
]);

export const kbCategories = pgTable("kb_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  language: text("language").notNull().default("en"),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon").notNull().default("BookOpen"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const kbArticles = pgTable("kb_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => kbCategories.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  language: text("language").notNull().default("en"),
  sourceKey: text("source_key").unique(),
  sourceRevision: text("source_revision"),
  sourceHash: text("source_hash"),
  aiEligible: boolean("ai_eligible").notNull().default(false),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  status: articleStatusEnum("status").notNull().default("draft"),
  views: integer("views").notNull().default(0),
  order: integer("order").notNull().default(0),
  tags: text("tags").array(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
