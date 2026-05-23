import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// Trigger types
export type AutomationTriggerType =
  | "onboarding_stalled"
  | "inactive_user"
  | "low_academy_progress"
  | "no_events_created"
  | "no_quotes_created"
  | "low_consumable_stock"
  | "warranty_expiring"
  | "high_performer_detected"
  | "upsell_opportunity_detected"
  | "coaching_recommendation_generated";

// Action types
export type AutomationActionType =
  | "in_app_notification"
  | "email_template_generation"
  | "coaching_task_creation"
  | "support_follow_up"
  | "upsell_recommendation"
  | "consumable_reorder_recommendation";

export type TriggerConfig = {
  stalledAfterDays?: number;
  completionThreshold?: number;
  inactiveDays?: number;
  progressThreshold?: number;
  noEventsAfterDays?: number;
  noQuotesAfterDays?: number;
  daysRemainingThreshold?: number;
  daysWarning?: number;
  minQuotes?: number;
  minEvents?: number;
  periodDays?: number;
  minEquipmentCount?: number;
  cooldownHours?: number;
};

export type ActionConfig = {
  notificationTitle?: string;
  notificationBody?: string;
  notificationLink?: string;
  emailSubject?: string;
  emailBodyTemplate?: string;
  taskTitle?: string;
  taskDescription?: string;
  taskPriority?: "low" | "medium" | "high";
};

export const automationRules = pgTable("automation_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  triggerType: text("trigger_type").$type<AutomationTriggerType>().notNull(),
  actionType: text("action_type").$type<AutomationActionType>().notNull(),
  triggerConfig: jsonb("trigger_config").$type<TriggerConfig>().notNull().default({}),
  actionConfig: jsonb("action_config").$type<ActionConfig>().notNull().default({}),
  isEnabled: integer("is_enabled").notNull().default(1),
  runCount: integer("run_count").notNull().default(0),
  matchCount: integer("match_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const automationExecutions = pgTable("automation_executions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  triggeredBy: text("triggered_by").notNull().default("scheduled"),
  rulesEvaluated: integer("rules_evaluated").notNull().default(0),
  actionsFired: integer("actions_fired").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  status: text("status").notNull().default("running"),
});

export const automationLogs = pgTable("automation_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  executionId: text("execution_id").notNull(),
  ruleId: text("rule_id").notNull(),
  ruleName: text("rule_name").notNull(),
  triggerType: text("trigger_type").$type<AutomationTriggerType>().notNull(),
  actionType: text("action_type").$type<AutomationActionType>().notNull(),
  targetUserId: text("target_user_id"),
  targetEntityId: text("target_entity_id"),
  status: text("status").notNull().default("matched"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type AutomationLog = typeof automationLogs.$inferSelect;
