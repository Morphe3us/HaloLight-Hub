import { pgTable, text, uuid, timestamp, pgEnum, integer, boolean, jsonb } from "drizzle-orm/pg-core";

export const aiDocCategoryEnum = pgEnum("ai_doc_category", [
  "faq",
  "troubleshooting",
  "printer_manual",
  "camera_manual",
  "software_guide",
  "business_guide",
  "pricing_guide",
  "event_guide",
  "product_guide",
  "academy_lesson",
  "support_article",
]);

export const aiDocStatusEnum = pgEnum("ai_doc_status", [
  "draft",
  "indexed",
  "needs_review",
  "archived",
]);

export const aiKnowledgeDocuments = pgTable("ai_knowledge_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  language: text("language").notNull().default("en"),
  category: aiDocCategoryEnum("category").notNull(),
  productModel: text("product_model"),
  sourceUrl: text("source_url"),
  content: text("content").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  aiActive: boolean("ai_active").notNull().default(true),
  lastIndexedAt: timestamp("last_indexed_at"),
  status: aiDocStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const aiKnowledgeChunks = pgTable("ai_knowledge_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => aiKnowledgeDocuments.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiKnowledgeTags = pgTable("ai_knowledge_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => aiKnowledgeDocuments.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
