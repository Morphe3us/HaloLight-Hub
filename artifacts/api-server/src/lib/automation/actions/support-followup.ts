import { db, supportTickets } from "@workspace/db";
import type { ActionHandler } from "../types";

export const actionSupportFollowup: ActionHandler = async (rule, match, _executionId) => {
  const { targetUserId, detail } = match;
  if (!targetUserId) return { success: false, detail: { error: "No targetUserId" } };

  const cfg = rule.actionConfig;
  const priority = (cfg.taskPriority ?? defaultPriority(rule.triggerType)) as "low" | "medium" | "high";

  const subject = interpolate(
    cfg.taskTitle ?? defaultSubject(rule.triggerType),
    detail
  );
  const description = interpolate(defaultDescription(rule.triggerType), detail);

  const ticketNumber = `AUTO-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  await db.insert(supportTickets).values({
    userId: targetUserId,
    ticketNumber,
    title: subject,
    description,
    status: "open",
    priority,
    category: "general",
  });

  return {
    success: true,
    detail: { ticketNumber, subject, priority, targetUserId },
  };
};

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(data[key] ?? ""));
}

function defaultPriority(triggerType: string): "low" | "medium" | "high" {
  const map: Record<string, "low" | "medium" | "high"> = {
    low_consumable_stock: "high",
    warranty_expiring: "high",
    inactive_user: "medium",
    onboarding_stalled: "medium",
  };
  return map[triggerType] ?? "low";
}

function defaultSubject(triggerType: string): string {
  const subjects: Record<string, string> = {
    onboarding_stalled: "Follow-up: Onboarding Support for {{userName}}",
    inactive_user: "Check-in: Account Inactive for {{daysSinceActivity}} Days",
    low_academy_progress: "Academy Progress Review: {{userName}}",
    no_events_created: "Support: No Events Created — {{userName}}",
    no_quotes_created: "Support: Quote Workflow Setup for {{userName}}",
    low_consumable_stock: "Urgent: {{catalogName}} Stock Running Low",
    warranty_expiring: "Action Required: Warranty Expiring — {{productModel}}",
    upsell_opportunity_detected: "Growth Opportunity: {{userName}}",
  };
  return subjects[triggerType] ?? "Automated Follow-Up: {{userName}}";
}

function defaultDescription(triggerType: string): string {
  const descs: Record<string, string> = {
    onboarding_stalled: "Automated trigger: {{userName}} has stalled at {{completionPct}}% onboarding completion after {{daysSinceSignup}} days. Follow up to offer assistance.",
    inactive_user: "Automated trigger: {{userName}} has been inactive for {{daysSinceActivity}} days. Reach out to re-engage.",
    low_consumable_stock: "Automated trigger: {{catalogName}} ({{sku}}) has only {{daysRemaining}} days of stock remaining for {{userName}}. Assist with reorder.",
    warranty_expiring: "Automated trigger: {{productModel}} warranty expires in {{daysUntilExpiry}} days for {{userName}}. Discuss coverage options.",
    upsell_opportunity_detected: "Automated trigger: {{userName}} has {{equipmentCount}} equipment units and shows strong engagement signals. Explore {{suggestedProduct}}.",
  };
  return descs[triggerType] ?? `Automated follow-up triggered by rule: ${triggerType}. Review client account and take action.`;
}
