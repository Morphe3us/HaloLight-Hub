import { pgTable, text, uuid, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const uploadCategoryEnum = pgEnum("upload_category", [
  "academy",
  "knowledge_base",
  "resources",
  "marketing",
  "contracts",
  "product_manuals",
  "ai_knowledge_base",
  "support_documentation",
]);

export const uploadVisibilityEnum = pgEnum("upload_visibility", [
  "admin_only",
  "client_visible",
  "ai_only",
  "public_resource",
]);

export const uploadStatusEnum = pgEnum("upload_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  language: text("language").notNull().default("en"),
  category: uploadCategoryEnum("category").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  visibility: uploadVisibilityEnum("visibility").notNull().default("admin_only"),
  status: uploadStatusEnum("status").notNull().default("ready"),
  relatedCourseId: text("related_course_id"),
  relatedLessonId: text("related_lesson_id"),
  relatedProduct: text("related_product"),
  description: text("description"),
  uploadedBy: text("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
