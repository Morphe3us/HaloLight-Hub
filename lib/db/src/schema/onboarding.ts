import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const onboardingStepsTable = pgTable("onboarding_steps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  order: integer("order").notNull(),
  isRequired: boolean("is_required").notNull().default(true),
  category: text("category").notNull().default("general"),
  pointsReward: integer("points_reward").notNull().default(10),
});

export const userOnboardingProgressTable = pgTable("user_onboarding_progress", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  stepId: text("step_id").notNull().references(() => onboardingStepsTable.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  skippedAt: timestamp("skipped_at", { withTimezone: true }),
});

export const insertOnboardingStepSchema = createInsertSchema(onboardingStepsTable).omit({
  id: true,
});

export const insertUserOnboardingProgressSchema = createInsertSchema(userOnboardingProgressTable).omit({
  id: true,
});

export type InsertOnboardingStep = z.infer<typeof insertOnboardingStepSchema>;
export type OnboardingStep = typeof onboardingStepsTable.$inferSelect;
export type UserOnboardingProgress = typeof userOnboardingProgressTable.$inferSelect;
