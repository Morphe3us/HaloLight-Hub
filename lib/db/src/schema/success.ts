import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const successTierEnum = pgEnum("success_tier", ["at_risk", "developing", "healthy", "champion"]);
export const coachingTypeEnum = pgEnum("coaching_type", ["low_onboarding", "no_activity", "low_academy", "no_quotes", "no_events", "low_community", "low_support_resolution"]);
export const upsellTypeEnum = pgEnum("upsell_type", ["second_booth", "additional_products", "consumables", "premium_coaching", "partnership"]);
export const confidenceEnum = pgEnum("confidence_level", ["low", "medium", "high"]);

export const customerSuccessScores = pgTable("customer_success_scores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique(),
  score: integer("score").notNull().default(0),
  tier: successTierEnum("tier").notNull().default("at_risk"),
  loginScore: integer("login_score").notNull().default(0),
  onboardingScore: integer("onboarding_score").notNull().default(0),
  academyScore: integer("academy_score").notNull().default(0),
  eventsScore: integer("events_score").notNull().default(0),
  quotesScore: integer("quotes_score").notNull().default(0),
  invoicesScore: integer("invoices_score").notNull().default(0),
  communityScore: integer("community_score").notNull().default(0),
  supportScore: integer("support_score").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const coachingRecommendations = pgTable("coaching_recommendations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  type: coachingTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: integer("priority").notNull().default(3),
  isActioned: integer("is_actioned").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const upsellOpportunities = pgTable("upsell_opportunities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  type: upsellTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  confidence: confidenceEnum("confidence").notNull().default("medium"),
  estimatedValue: integer("estimated_value"),
  isActioned: integer("is_actioned").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CustomerSuccessScore = typeof customerSuccessScores.$inferSelect;
export type CoachingRecommendation = typeof coachingRecommendations.$inferSelect;
export type UpsellOpportunity = typeof upsellOpportunities.$inferSelect;
