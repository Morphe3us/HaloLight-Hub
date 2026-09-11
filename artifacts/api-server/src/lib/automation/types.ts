import type { AutomationRule, AutomationTriggerType, AutomationActionType, TriggerConfig, ActionConfig } from "@workspace/db";

export type { AutomationRule, AutomationTriggerType, AutomationActionType, TriggerConfig, ActionConfig };

export interface EvalMatch {
  targetUserId?: string;
  targetEntityId?: string;
  detail: Record<string, unknown>;
}

export type Evaluator = (
  rule: AutomationRule
) => Promise<EvalMatch[]>;

export type ActionResult = {
  success: boolean;
  skipped?: "preference";
  detail: Record<string, unknown>;
};

export type ActionHandler = (
  rule: AutomationRule,
  match: EvalMatch,
  executionId: string
) => Promise<ActionResult>;

export const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  onboarding_stalled: "Onboarding Stalled",
  inactive_user: "Inactive User",
  low_academy_progress: "Low Academy Progress",
  no_events_created: "No Events Created",
  no_quotes_created: "No Quotes Created",
  low_consumable_stock: "Low Consumable Stock",
  warranty_expiring: "Warranty Expiring",
  high_performer_detected: "High Performer Detected",
  upsell_opportunity_detected: "Upsell Opportunity Detected",
  coaching_recommendation_generated: "Coaching Recommendation Generated",
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  in_app_notification: "In-App Notification",
  email_template_generation: "Email Template",
  coaching_task_creation: "Coaching Task",
  support_follow_up: "Support Follow-Up",
  upsell_recommendation: "Upsell Recommendation",
  consumable_reorder_recommendation: "Reorder Recommendation",
};
