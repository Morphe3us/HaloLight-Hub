import { db, usersTable, lessons, userLessonProgress } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import type { Evaluator, EvalMatch } from "../types";

export const evaluateLowAcademyProgress: Evaluator = async (rule) => {
  const config = rule.triggerConfig;
  const progressThreshold = config.progressThreshold ?? 25;

  const allLessons = await db.select({ id: lessons.id }).from(lessons);
  const totalLessons = allLessons.length;
  if (totalLessons === 0) return [];

  const users = await db.select().from(usersTable).where(eq(usersTable.role, "client"));
  const matches: EvalMatch[] = [];

  for (const user of users) {
    const completed = await db.select()
      .from(userLessonProgress)
      .where(eq(userLessonProgress.userId, user.id));

    const completedCount = completed.filter((p) => p.completedAt !== null).length;
    const pct = Math.round((completedCount / totalLessons) * 100);

    if (pct < progressThreshold) {
      matches.push({
        targetUserId: user.id,
        detail: {
          userName: user.fullName,
          completedLessons: completedCount,
          totalLessons,
          progressPct: pct,
          threshold: progressThreshold,
        },
      });
    }
  }

  return matches;
};
