import { db, automationRules, automationExecutions, automationLogs } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "../logger";

import { evaluateOnboardingStalled } from "./evaluators/onboarding-stalled";
import { evaluateInactiveUser } from "./evaluators/inactive-user";
import { evaluateLowAcademyProgress } from "./evaluators/low-academy-progress";
import { evaluateNoEvents } from "./evaluators/no-events";
import { evaluateNoQuotes } from "./evaluators/no-quotes";
import { evaluateLowStock } from "./evaluators/low-stock";
import { evaluateWarrantyExpiring } from "./evaluators/warranty-expiring";
import { evaluateHighPerformer } from "./evaluators/high-performer";
import { evaluateUpsellOpportunity } from "./evaluators/upsell-opportunity";
import { evaluateCoachingRecommendation } from "./evaluators/coaching-recommendation";

import { actionInAppNotification } from "./actions/in-app-notification";
import { actionEmailTemplate } from "./actions/email-template";
import { actionCoachingTask } from "./actions/coaching-task";
import { actionSupportFollowup } from "./actions/support-followup";
import { actionUpsellRecommendation } from "./actions/upsell-recommendation";
import { actionConsumableReorder } from "./actions/consumable-reorder";

import type { AutomationRule, AutomationTriggerType, AutomationActionType, Evaluator, ActionHandler, ActionResult, EvalMatch } from "./types";

const EVALUATORS: Record<AutomationTriggerType, Evaluator> = {
  onboarding_stalled: evaluateOnboardingStalled,
  inactive_user: evaluateInactiveUser,
  low_academy_progress: evaluateLowAcademyProgress,
  no_events_created: evaluateNoEvents,
  no_quotes_created: evaluateNoQuotes,
  low_consumable_stock: evaluateLowStock,
  warranty_expiring: evaluateWarrantyExpiring,
  high_performer_detected: evaluateHighPerformer,
  upsell_opportunity_detected: evaluateUpsellOpportunity,
  coaching_recommendation_generated: evaluateCoachingRecommendation,
};

const ACTION_HANDLERS: Record<AutomationActionType, ActionHandler> = {
  in_app_notification: actionInAppNotification,
  email_template_generation: actionEmailTemplate,
  coaching_task_creation: actionCoachingTask,
  support_follow_up: actionSupportFollowup,
  upsell_recommendation: actionUpsellRecommendation,
  consumable_reorder_recommendation: actionConsumableReorder,
};

export interface RunResult {
  executionId: string;
  rulesEvaluated: number;
  actionsFired: number;
  errors: number;
  durationMs: number;
}

/**
 * Check cooldown: returns true if an action_taken log for this
 * rule + target already exists within the cooldown window.
 */
async function isOnCooldown(
  ruleId: string,
  targetUserId: string | undefined,
  targetEntityId: string | undefined,
  cooldownHours: number
): Promise<boolean> {
  if (!targetUserId && !targetEntityId) return false;
  const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

  const existing = await db.select({ id: automationLogs.id })
    .from(automationLogs)
    .where(
      and(
        eq(automationLogs.ruleId, ruleId),
        eq(automationLogs.status, "action_taken"),
        ...(targetUserId ? [eq(automationLogs.targetUserId, targetUserId)] : []),
        gte(automationLogs.createdAt, since)
      )
    )
    .limit(1);

  return existing.length > 0;
}

/**
 * Run all enabled automation rules.
 * @param triggeredBy  "scheduled" | "manual" | userId
 */
export async function runAutomation(triggeredBy = "scheduled"): Promise<RunResult> {
  const startedAt = Date.now();

  const [execution] = await db.insert(automationExecutions).values({
    triggeredBy,
    status: "running",
  }).returning();

  const executionId = execution.id;
  let rulesEvaluated = 0;
  let actionsFired = 0;
  let errors = 0;

  try {
    const rules = await db.select()
      .from(automationRules)
      .where(eq(automationRules.isEnabled, 1));

    for (const rule of rules) {
      rulesEvaluated++;

      const evaluator = EVALUATORS[rule.triggerType as AutomationTriggerType];
      const actionHandler = ACTION_HANDLERS[rule.actionType as AutomationActionType];

      if (!evaluator || !actionHandler) {
        logger.warn({ ruleId: rule.id, triggerType: rule.triggerType }, "No evaluator/handler for rule");
        errors++;
        continue;
      }

      let matches: EvalMatch[] = [];
      try {
        matches = await evaluator(rule);
      } catch (err) {
        logger.error({ err, ruleId: rule.id }, "Evaluator error");
        errors++;
        await db.insert(automationLogs).values({
          executionId,
          ruleId: rule.id,
          ruleName: rule.name,
          triggerType: rule.triggerType,
          actionType: rule.actionType,
          status: "error",
          detail: { error: String(err) },
        });
        continue;
      }

      if (matches.length === 0) {
        await db.insert(automationLogs).values({
          executionId,
          ruleId: rule.id,
          ruleName: rule.name,
          triggerType: rule.triggerType,
          actionType: rule.actionType,
          status: "no_match",
          detail: { evaluated: true },
        });
      }

      const cooldownHours = rule.triggerConfig.cooldownHours ?? 24;

      for (const match of matches) {
        const onCooldown = await isOnCooldown(
          rule.id,
          match.targetUserId,
          match.targetEntityId,
          cooldownHours
        );

        if (onCooldown) {
          await db.insert(automationLogs).values({
            executionId,
            ruleId: rule.id,
            ruleName: rule.name,
            triggerType: rule.triggerType,
            actionType: rule.actionType,
            targetUserId: match.targetUserId ?? null,
            targetEntityId: match.targetEntityId ?? null,
            status: "skipped_cooldown",
            detail: { ...match.detail, cooldownHours },
          });
          continue;
        }

        let actionResult: ActionResult;
        try {
          actionResult = await actionHandler(rule, match, executionId);
        } catch (err) {
          logger.error({ err, ruleId: rule.id }, "Action handler error");
          errors++;
          await db.insert(automationLogs).values({
            executionId,
            ruleId: rule.id,
            ruleName: rule.name,
            triggerType: rule.triggerType,
            actionType: rule.actionType,
            targetUserId: match.targetUserId ?? null,
            targetEntityId: match.targetEntityId ?? null,
            status: "error",
            detail: { error: String(err), match: match.detail },
          });
          continue;
        }

        if (actionResult.skipped === "preference") {
          await db.insert(automationLogs).values({
            executionId, ruleId: rule.id, ruleName: rule.name,
            triggerType: rule.triggerType, actionType: rule.actionType,
            targetUserId: match.targetUserId ?? null, targetEntityId: match.targetEntityId ?? null,
            status: "skipped_preference",
            detail: { ...match.detail, actionResult: actionResult.detail },
          });
        } else if (actionResult.success) {
          actionsFired++;
          await db.insert(automationLogs).values({
            executionId,
            ruleId: rule.id,
            ruleName: rule.name,
            triggerType: rule.triggerType,
            actionType: rule.actionType,
            targetUserId: match.targetUserId ?? null,
            targetEntityId: match.targetEntityId ?? null,
            status: "action_taken",
            detail: { ...match.detail, actionResult: actionResult.detail },
          });
        } else {
          errors++;
          await db.insert(automationLogs).values({
            executionId,
            ruleId: rule.id,
            ruleName: rule.name,
            triggerType: rule.triggerType,
            actionType: rule.actionType,
            targetUserId: match.targetUserId ?? null,
            targetEntityId: match.targetEntityId ?? null,
            status: "error",
            detail: { ...match.detail, actionError: actionResult.detail },
          });
        }
      }

      // Update rule stats
      await db.update(automationRules)
        .set({
          runCount: rule.runCount + 1,
          matchCount: rule.matchCount + matches.length,
          lastRunAt: new Date(),
        })
        .where(eq(automationRules.id, rule.id));
    }

    const durationMs = Date.now() - startedAt;

    await db.update(automationExecutions)
      .set({
        finishedAt: new Date(),
        status: "completed",
        rulesEvaluated,
        actionsFired,
        errors,
      })
      .where(eq(automationExecutions.id, executionId));

    logger.info({ executionId, rulesEvaluated, actionsFired, errors, durationMs }, "Automation run complete");

    return { executionId, rulesEvaluated, actionsFired, errors, durationMs };
  } catch (err) {
    await db.update(automationExecutions)
      .set({ finishedAt: new Date(), status: "failed", rulesEvaluated, actionsFired, errors: errors + 1 })
      .where(eq(automationExecutions.id, executionId));
    logger.error({ err, executionId }, "Automation run failed");
    throw err;
  }
}

/**
 * Run a single rule in isolation (for manual trigger).
 */
export async function runSingleRule(ruleId: string, triggeredBy = "manual"): Promise<RunResult> {
  const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, ruleId));
  if (!rule) throw new Error(`Rule ${ruleId} not found`);

  const startedAt = Date.now();
  const [execution] = await db.insert(automationExecutions).values({
    triggeredBy,
    status: "running",
  }).returning();

  const executionId = execution.id;
  let actionsFired = 0;
  let errors = 0;

  const evaluator = EVALUATORS[rule.triggerType as AutomationTriggerType];
  const actionHandler = ACTION_HANDLERS[rule.actionType as AutomationActionType];

  if (!evaluator || !actionHandler) {
    await db.update(automationExecutions)
      .set({ finishedAt: new Date(), status: "failed", rulesEvaluated: 1, errors: 1 })
      .where(eq(automationExecutions.id, executionId));
    throw new Error(`No evaluator or handler for rule type: ${rule.triggerType} / ${rule.actionType}`);
  }

  const matches = await evaluator(rule).catch((err) => {
    logger.error({ err, ruleId }, "Single rule evaluator error");
    errors++;
    return [] as EvalMatch[];
  });

  for (const match of matches) {
    try {
      const result = await actionHandler(rule, match, executionId);
      if (result.skipped === "preference") {
        await db.insert(automationLogs).values({
          executionId, ruleId: rule.id, ruleName: rule.name,
          triggerType: rule.triggerType, actionType: rule.actionType,
          targetUserId: match.targetUserId ?? null, targetEntityId: match.targetEntityId ?? null,
          status: "skipped_preference",
          detail: { ...match.detail, actionResult: result.detail },
        });
      } else if (result.success) {
        actionsFired++;
        await db.insert(automationLogs).values({
          executionId,
          ruleId: rule.id,
          ruleName: rule.name,
          triggerType: rule.triggerType,
          actionType: rule.actionType,
          targetUserId: match.targetUserId ?? null,
          targetEntityId: match.targetEntityId ?? null,
          status: "action_taken",
          detail: { ...match.detail, actionResult: result.detail },
        });
      }
    } catch (err) {
      errors++;
    }
  }

  if (matches.length === 0) {
    await db.insert(automationLogs).values({
      executionId,
      ruleId: rule.id,
      ruleName: rule.name,
      triggerType: rule.triggerType,
      actionType: rule.actionType,
      status: "no_match",
      detail: { manual: true },
    });
  }

  await db.update(automationRules)
    .set({ runCount: rule.runCount + 1, matchCount: rule.matchCount + matches.length, lastRunAt: new Date() })
    .where(eq(automationRules.id, ruleId));

  const durationMs = Date.now() - startedAt;
  await db.update(automationExecutions)
    .set({ finishedAt: new Date(), status: "completed", rulesEvaluated: 1, actionsFired, errors })
    .where(eq(automationExecutions.id, executionId));

  return { executionId, rulesEvaluated: 1, actionsFired, errors, durationMs };
}
