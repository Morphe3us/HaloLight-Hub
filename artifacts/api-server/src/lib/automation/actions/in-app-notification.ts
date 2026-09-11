import { createOrdinaryNotification } from "../../createOrdinaryNotification";
import type { ActionHandler } from "../types";

export const actionInAppNotification: ActionHandler = async (rule, match, _executionId) => {
  const { targetUserId, detail } = match;
  if (!targetUserId) return { success: false, detail: { error: "No targetUserId" } };

  const cfg = rule.actionConfig;
  const userName = String(detail.userName ?? "");

  const title = interpolate(cfg.notificationTitle ?? defaultTitle(rule.triggerType), detail);
  const body = interpolate(cfg.notificationBody ?? defaultBody(rule.triggerType, detail), detail);
  const link = cfg.notificationLink ?? defaultLink(rule.triggerType);

  const notificationCreated = await createOrdinaryNotification({
    userId: targetUserId,
    type: `automation_${rule.triggerType}`,
    title,
    body,
    link: link ?? null,
    isRead: false,
    deliveredEmail: false,
    deliveredPush: false,
  });

  if (!notificationCreated) return { success: true, skipped: "preference", detail: { notificationCreated: false, reason: "in_app_disabled" } };
  return { success: true, detail: { title, body, link, userName, notificationCreated } };
};

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(data[key] ?? ""));
}

function defaultTitle(triggerType: string): string {
  const titles: Record<string, string> = {
    onboarding_stalled: "Complete Your Onboarding",
    inactive_user: "We Miss You!",
    low_academy_progress: "Continue Your Academy Training",
    no_events_created: "Create Your First Event",
    no_quotes_created: "Send Your First Quote",
    low_consumable_stock: "Low Stock Alert: {{catalogName}}",
    warranty_expiring: "Warranty Expiring Soon",
    high_performer_detected: "Congratulations — You're a Top Performer!",
    upsell_opportunity_detected: "Exclusive Opportunity for Your Business",
    coaching_recommendation_generated: "A Coaching Session Is Recommended",
  };
  return titles[triggerType] ?? "HaloLight Update";
}

function defaultBody(triggerType: string, detail: Record<string, unknown>): string {
  const bodies: Record<string, string> = {
    onboarding_stalled: `You've completed {{completionPct}}% of your onboarding. Finish the remaining steps to unlock all features.`,
    inactive_user: `You haven't been active for {{daysSinceActivity}} days. Log in to keep your business moving.`,
    low_academy_progress: `You've completed {{completedLessons}} of {{totalLessons}} lessons. Keep going to grow your skills!`,
    no_events_created: `It's been {{daysSinceSignup}} days since you joined — create your first event to get started.`,
    no_quotes_created: `Start sending quotes to grow your revenue. Your first quote is just a few clicks away.`,
    low_consumable_stock: `{{catalogName}} is running low — only {{daysRemaining}} days of stock remaining. Consider reordering.`,
    warranty_expiring: `The warranty on {{productModel}} expires in {{daysUntilExpiry}} days. Plan for coverage or replacement.`,
    high_performer_detected: `You've created {{quotesInPeriod}} quotes and {{eventsInPeriod}} events in the last {{periodDays}} days. Outstanding work!`,
    upsell_opportunity_detected: `Based on your activity, you may be ready for {{suggestedProduct}}. Reach out to your coach to learn more.`,
    coaching_recommendation_generated: `Your academy progress is at {{academyProgressPct}}%. A coaching session can help you accelerate.`,
  };
  return interpolate(bodies[triggerType] ?? "You have a new update from HaloLight.", detail);
}

function defaultLink(triggerType: string): string | null {
  const links: Record<string, string> = {
    onboarding_stalled: "/onboarding",
    inactive_user: "/dashboard",
    low_academy_progress: "/academy",
    no_events_created: "/events",
    no_quotes_created: "/quotes",
    low_consumable_stock: "/consumables",
    warranty_expiring: "/equipment",
    high_performer_detected: "/dashboard",
    upsell_opportunity_detected: "/support",
    coaching_recommendation_generated: "/support",
  };
  return links[triggerType] ?? null;
}
