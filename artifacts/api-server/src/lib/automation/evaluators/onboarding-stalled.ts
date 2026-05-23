import { db, usersTable, onboardingStepsTable, userOnboardingProgressTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateOnboardingStalled: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const stalledAfterDays = config.stalledAfterDays ?? 3;
  const completionThreshold = config.completionThreshold ?? 50;
  const cooldownHours = config.cooldownHours ?? 24;

  const cutoff = new Date(Date.now() - stalledAfterDays * 24 * 60 * 60 * 1000);

  const users = await db.select().from(usersTable)
    .where(eq(usersTable.role, "client"));

  const steps = await db.select().from(onboardingStepsTable);
  const totalSteps = steps.length || 8;

  const matches: EvalMatch[] = [];

  for (const user of users) {
    if (new Date(user.createdAt) > cutoff) continue;

    const progress = await db.select()
      .from(userOnboardingProgressTable)
      .where(eq(userOnboardingProgressTable.userId, user.id));

    const completed = progress.filter((p) => p.completedAt !== null).length;
    const pct = Math.round((completed / totalSteps) * 100);

    if (pct < completionThreshold) {
      matches.push({
        targetUserId: user.id,
        detail: {
          userName: user.fullName,
          completedSteps: completed,
          totalSteps,
          completionPct: pct,
          threshold: completionThreshold,
          daysSinceSignup: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000),
        },
      });
    }
  }

  return matches;
};
