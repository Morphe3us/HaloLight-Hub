import { db, coachingRecommendations } from "@workspace/db";
import type { ActionHandler } from "../types";

export const actionCoachingTask: ActionHandler = async (rule, match, _executionId) => {
  const { targetUserId, detail } = match;
  if (!targetUserId) return { success: false, detail: { error: "No targetUserId" } };

  const cfg = rule.actionConfig;

  const title = interpolate(
    cfg.taskTitle ?? defaultTitle(rule.triggerType),
    detail
  );
  const description = interpolate(
    cfg.taskDescription ?? defaultDescription(rule.triggerType),
    detail
  );
  const priority = detail.priority ? Number(detail.priority) : 2;

  await db.insert(coachingRecommendations).values({
    userId: targetUserId,
    type: coachingType(rule.triggerType),
    title,
    description,
    priority,
    isActioned: 0,
  });

  return {
    success: true,
    detail: { title, description, targetUserId },
  };
};

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(data[key] ?? ""));
}

function coachingType(triggerType: string): "low_onboarding" | "no_activity" | "low_academy" | "no_quotes" | "no_events" | "low_community" | "low_support_resolution" {
  const map: Record<string, "low_onboarding" | "no_activity" | "low_academy" | "no_quotes" | "no_events" | "low_community" | "low_support_resolution"> = {
    onboarding_stalled: "low_onboarding",
    inactive_user: "no_activity",
    low_academy_progress: "low_academy",
    no_quotes_created: "no_quotes",
    no_events_created: "no_events",
    coaching_recommendation_generated: "low_academy",
  };
  return map[triggerType] ?? "no_activity";
}

function defaultTitle(triggerType: string): string {
  const titles: Record<string, string> = {
    onboarding_stalled: "Help {{userName}} Complete Onboarding ({{completionPct}}%)",
    inactive_user: "Re-engage Inactive Client: {{userName}}",
    low_academy_progress: "Academy Support: {{userName}} at {{progressPct}}%",
    no_events_created: "Assist {{userName}} to Create First Event",
    no_quotes_created: "Guide {{userName}} Through Quote Creation",
    coaching_recommendation_generated: "1:1 Coaching Session Recommended: {{userName}}",
    high_performer_detected: "Recognition & Growth Plan for {{userName}}",
  };
  return titles[triggerType] ?? "Coaching Task for {{userName}}";
}

function defaultDescription(triggerType: string): string {
  const descs: Record<string, string> = {
    onboarding_stalled: "Client has completed {{completionPct}}% of onboarding after {{daysSinceSignup}} days. Schedule a call to walk them through the remaining steps.",
    inactive_user: "Client has not been active for {{daysSinceActivity}} days. Reach out via email or phone to check in and offer support.",
    low_academy_progress: "Client has completed only {{completedLessons}} of {{totalLessons}} academy lessons. Recommend specific courses or schedule a group session.",
    no_events_created: "Client has not created any events after {{daysSinceSignup}} days. Offer to help them set up their first booking.",
    no_quotes_created: "Client has not sent any quotes after {{daysSinceSignup}} days. Demo the quote creation workflow in a short call.",
    coaching_recommendation_generated: "Academy progress: {{academyProgressPct}}%. Onboarding: {{onboardingPct}}%. Recommend a 1:1 session to accelerate learning.",
    high_performer_detected: "Client created {{quotesInPeriod}} quotes and {{eventsInPeriod}} events in {{periodDays}} days. Prepare a growth plan and upsell recommendation.",
  };
  return descs[triggerType] ?? "Review the client's account and provide guidance.";
}
