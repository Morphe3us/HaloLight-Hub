import { db, automationRules } from "@workspace/db";

const DEFAULT_RULES = [
  {
    name: "Onboarding Stalled Alert",
    description:
      "Notifies clients who haven't completed onboarding within 3 days and creates a coaching task.",
    triggerType: "onboarding_stalled" as const,
    actionType: "in_app_notification" as const,
    triggerConfig: {
      stalledAfterDays: 3,
      completionThreshold: 50,
      cooldownHours: 48,
    },
    actionConfig: {
      notificationTitle: "Complete Your Onboarding",
      notificationBody:
        "You've completed {{completionPct}}% of your onboarding. Finish the remaining steps to unlock all HaloLight features.",
      notificationLink: "/onboarding",
    },
    isEnabled: 1,
  },
  {
    name: "Inactive User Re-Engagement",
    description:
      "Sends re-engagement notification to users who haven't been active for 7+ days.",
    triggerType: "inactive_user" as const,
    actionType: "email_template_generation" as const,
    triggerConfig: { inactiveDays: 7, cooldownHours: 72 },
    actionConfig: {
      emailSubject: "We miss you, {{userName}} — here's what's new",
    },
    isEnabled: 1,
  },
  {
    name: "Low Academy Progress Coaching",
    description:
      "Creates a coaching task when a client's academy progress falls below 25%.",
    triggerType: "low_academy_progress" as const,
    actionType: "coaching_task_creation" as const,
    triggerConfig: { progressThreshold: 25, cooldownHours: 168 },
    actionConfig: {
      taskTitle: "Academy Support: {{userName}} at {{progressPct}}%",
    },
    isEnabled: 1,
  },
  {
    name: "No Events Created Nudge",
    description:
      "Notifies clients who haven't created any events 7 days after signing up.",
    triggerType: "no_events_created" as const,
    actionType: "in_app_notification" as const,
    triggerConfig: { noEventsAfterDays: 7, cooldownHours: 48 },
    actionConfig: {
      notificationTitle: "Create Your First Event",
      notificationLink: "/events",
    },
    isEnabled: 1,
  },
  {
    name: "No Quotes Created Follow-Up",
    description:
      "Opens a support follow-up ticket when a client hasn't sent any quotes 7 days in.",
    triggerType: "no_quotes_created" as const,
    actionType: "support_follow_up" as const,
    triggerConfig: { noQuotesAfterDays: 7, cooldownHours: 72 },
    actionConfig: {
      taskTitle: "Support: Quote Workflow Setup for {{userName}}",
      taskPriority: "medium",
    },
    isEnabled: 1,
  },
  {
    name: "Low Consumable Stock Reorder Alert",
    description:
      "Triggers a reorder recommendation when consumable stock falls below 14 days remaining.",
    triggerType: "low_consumable_stock" as const,
    actionType: "consumable_reorder_recommendation" as const,
    triggerConfig: { daysRemainingThreshold: 14, cooldownHours: 24 },
    actionConfig: {},
    isEnabled: 1,
  },
  {
    name: "Warranty Expiry Warning",
    description:
      "Sends a notification and creates a support ticket when equipment warranty expires within 30 days.",
    triggerType: "warranty_expiring" as const,
    actionType: "in_app_notification" as const,
    triggerConfig: { daysWarning: 30, cooldownHours: 72 },
    actionConfig: {
      notificationTitle: "Warranty Expiring Soon",
      notificationBody:
        "The warranty on {{productModel}} expires in {{daysUntilExpiry}} days. Review your coverage options.",
      notificationLink: "/equipment",
    },
    isEnabled: 1,
  },
  {
    name: "High Performer Recognition",
    description:
      "Recognises top performers and creates a growth coaching task.",
    triggerType: "high_performer_detected" as const,
    actionType: "coaching_task_creation" as const,
    triggerConfig: {
      minQuotes: 5,
      minEvents: 3,
      periodDays: 30,
      cooldownHours: 168,
    },
    actionConfig: {
      taskTitle: "Recognition & Growth Plan for {{userName}}",
      taskPriority: "low",
    },
    isEnabled: 1,
  },
  {
    name: "Upsell Opportunity Detection",
    description:
      "Identifies clients with strong upsell signals and creates a revenue recommendation.",
    triggerType: "upsell_opportunity_detected" as const,
    actionType: "upsell_recommendation" as const,
    triggerConfig: { minEquipmentCount: 2, minQuotes: 3, cooldownHours: 336 },
    actionConfig: {},
    isEnabled: 1,
  },
  {
    name: "Coaching Recommendation Engine",
    description:
      "Generates coaching recommendations for clients who completed onboarding but have low academy progress.",
    triggerType: "coaching_recommendation_generated" as const,
    actionType: "coaching_task_creation" as const,
    triggerConfig: {
      progressThreshold: 50,
      completionThreshold: 60,
      cooldownHours: 168,
    },
    actionConfig: {
      taskTitle: "1:1 Coaching Session Recommended: {{userName}}",
    },
    isEnabled: 1,
  },
];

async function seed() {
  const existing = await db.select().from(automationRules);
  if (existing.length >= DEFAULT_RULES.length) {
    console.log(
      `Automation rules already seeded (${existing.length} rules found)`,
    );
    return;
  }

  await db.delete(automationRules);

  for (const rule of DEFAULT_RULES) {
    await db.insert(automationRules).values(rule as never);
  }

  console.log(`Seeded ${DEFAULT_RULES.length} automation rules`);
}

seed()
  .catch(console.error)
  .finally(() => process.exit(0));
