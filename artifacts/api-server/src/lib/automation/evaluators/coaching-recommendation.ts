import { db, usersTable, userLessonProgress, lessons, userOnboardingProgressTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateCoachingRecommendation: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const progressThreshold = config.progressThreshold ?? 50;
  const completionThreshold = config.completionThreshold ?? 60;

  const allLessons = await db.select({ id: lessons.id }).from(lessons);
  const totalLessons = allLessons.length;
  if (totalLessons === 0) return [];

  const users = await db.select().from(usersTable).where(eq(usersTable.role, "client"));
  const matches: EvalMatch[] = [];

  for (const user of users) {
    // Only target users who have started onboarding
    const onboardingProgress = await db.select()
      .from(userOnboardingProgressTable)
      .where(eq(userOnboardingProgressTable.userId, user.id));

    if (onboardingProgress.length === 0) continue;

    const completedOnboarding = onboardingProgress.filter((p) => p.completedAt !== null).length;
    const onboardingPct = Math.round((completedOnboarding / 8) * 100);
    if (onboardingPct < completionThreshold) continue;

    const progress = await db.select()
      .from(userLessonProgress)
      .where(eq(userLessonProgress.userId, user.id));

    const completedLessons = progress.filter((p) => p.completedAt !== null).length;
    const academyPct = Math.round((completedLessons / totalLessons) * 100);

    if (academyPct < progressThreshold) {
      matches.push({
        targetUserId: user.id,
        detail: {
          userName: user.fullName,
          academyProgressPct: academyPct,
          onboardingPct,
          completedLessons,
          totalLessons,
          recommendedAction: "Schedule 1:1 coaching session to accelerate academy progress",
        },
      });
    }
  }

  return matches;
};
