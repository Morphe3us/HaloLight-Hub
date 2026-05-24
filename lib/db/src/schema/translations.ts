import { pgTable, text, uuid, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const translationStatusEnum = pgEnum("translation_status", [
  "draft",
  "needs_review",
  "approved",
  "published",
]);

export const translationContentTypeEnum = pgEnum("translation_content_type", [
  "course",
  "module",
  "lesson",
  "kb_article",
  "resource",
  "ai_knowledge_doc",
]);

export const translationRecords = pgTable(
  "translation_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentType: translationContentTypeEnum("content_type").notNull(),
    contentId: text("content_id").notNull(),
    language: text("language").notNull(),
    status: translationStatusEnum("status").notNull().default("draft"),
    translatedTitle: text("translated_title"),
    translatedBody: text("translated_body"),
    reviewedBy: text("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("translation_records_content_lang_unique").on(
      t.contentType,
      t.contentId,
      t.language
    ),
  ]
);
