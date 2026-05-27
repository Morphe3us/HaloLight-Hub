import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const courseLevelEnum = pgEnum("course_level", [
  "beginner",
  "intermediate",
  "advanced",
]);

export const lessonResourceTypeEnum = pgEnum("lesson_resource_type", [
  "pdf",
  "link",
  "download",
  "video",
]);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: jsonb("title").notNull(),
  description: jsonb("description").notNull(),
  category: text("category").notNull(),
  level: courseLevelEnum("level").notNull().default("beginner"),
  thumbnailUrl: text("thumbnail_url").notNull().default(""),
  order: integer("order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  totalDurationSeconds: integer("total_duration_seconds").notNull().default(0),
  instructorName: text("instructor_name"),
  isFeatured: boolean("is_featured").notNull().default(false),
  estimatedDuration: text("estimated_duration"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const courseModules = pgTable("course_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: jsonb("title").notNull(),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => courseModules.id, { onDelete: "cascade" }),
  title: jsonb("title").notNull(),
  description: jsonb("description"),
  videoUrl: text("video_url").notNull().default(""),
  videoUrls: jsonb("video_urls").$type<Record<string, string>>(),
  thumbnailUrl: text("thumbnail_url"),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  order: integer("order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lessonResources = pgTable("lesson_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  title: jsonb("title").notNull(),
  type: lessonResourceTypeEnum("type").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const quizQuestions = pgTable("quiz_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  question: jsonb("question").notNull(),
  options: jsonb("options").notNull(),
  correctOption: integer("correct_option").notNull(),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userLessonProgress = pgTable("user_lesson_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  watchPercent: integer("watch_percent").notNull().default(0),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  passed: boolean("passed").notNull(),
  answers: jsonb("answers").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
