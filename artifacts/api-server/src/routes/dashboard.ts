import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, count, gt, sql } from "drizzle-orm";
import {
  db,
  notificationsTable,
  onboardingStepsTable,
  userOnboardingProgressTable,
  courses,
  courseModules,
  lessons,
  userLessonProgress,
  events,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /dashboard/summary
router.get("/dashboard/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = user.language ?? "en";

  // Unread notifications
  const [{ value: unreadNotifications }] = await db
    .select({ value: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)));

  // Onboarding percent
  const allSteps = await db.select().from(onboardingStepsTable);
  const doneSteps = await db
    .select()
    .from(userOnboardingProgressTable)
    .where(
      and(
        eq(userOnboardingProgressTable.userId, user.id),
        sql`${userOnboardingProgressTable.completedAt} IS NOT NULL`
      )
    );
  const onboardingPercent =
    allSteps.length > 0 ? Math.round((doneSteps.length / allSteps.length) * 100) : 0;

  // Academy stats
  const allCourses = await db.select().from(courses).where(eq(courses.isPublished, true));
  const allModules = await db.select().from(courseModules);
  const allLessons = await db.select().from(lessons).where(eq(lessons.isPublished, true));
  const allProgress = await db
    .select()
    .from(userLessonProgress)
    .where(eq(userLessonProgress.userId, user.id));

  const completedProgressIds = new Set(
    allProgress.filter((p) => p.completedAt).map((p) => p.lessonId)
  );
  const academyLessonsCompleted = completedProgressIds.size;
  const academyTotalLessons = allLessons.length;

  const modulesByCourse = new Map<string, string[]>();
  for (const mod of allModules) {
    const list = modulesByCourse.get(mod.courseId) ?? [];
    list.push(mod.id);
    modulesByCourse.set(mod.courseId, list);
  }
  const lessonsByModule = new Map<string, string[]>();
  for (const l of allLessons) {
    const list = lessonsByModule.get(l.moduleId) ?? [];
    list.push(l.id);
    lessonsByModule.set(l.moduleId, list);
  }
  let academyCoursesCompleted = 0;
  for (const course of allCourses) {
    const mids = modulesByCourse.get(course.id) ?? [];
    const lids = mids.flatMap((mid) => lessonsByModule.get(mid) ?? []);
    if (lids.length > 0 && lids.every((lid) => completedProgressIds.has(lid))) {
      academyCoursesCompleted++;
    }
  }

  // Events
  const now = new Date();
  const [{ value: upcomingEventsCount }] = await db
    .select({ value: count() })
    .from(events)
    .where(and(eq(events.userId, user.id), eq(events.status, "upcoming"), gt(events.eventDate, now)));
  const [{ value: totalEventsCount }] = await db
    .select({ value: count() })
    .from(events)
    .where(eq(events.userId, user.id));

  // Next lesson — first incomplete lesson
  const moduleMap = new Map(allModules.map((m) => [m.id, m]));
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const progressMap = new Map(allProgress.map((p) => [p.lessonId, p]));

  const sortedLessons = [...allLessons].sort((a, b) => {
    const ma = moduleMap.get(a.moduleId);
    const mb = moduleMap.get(b.moduleId);
    const ca = ma ? courseMap.get(ma.courseId) : undefined;
    const cb = mb ? courseMap.get(mb.courseId) : undefined;
    return (ca?.order ?? 0) - (cb?.order ?? 0) || (ma?.order ?? 0) - (mb?.order ?? 0) || a.order - b.order;
  });

  let nextLesson = null;
  for (const lesson of sortedLessons) {
    if (!completedProgressIds.has(lesson.id)) {
      const mod = moduleMap.get(lesson.moduleId);
      const course = mod ? courseMap.get(mod.courseId) : undefined;
      if (!course) continue;
      const p = progressMap.get(lesson.id);
      nextLesson = {
        lessonId: lesson.id,
        lessonTitle: resolveLocale(lang, lesson.title),
        courseId: course.id,
        courseTitle: resolveLocale(lang, course.title),
        courseThumbnailUrl: course.thumbnailUrl,
        moduleTitle: resolveLocale(lang, mod!.title),
        durationSeconds: lesson.durationSeconds,
        watchPercent: p?.watchPercent ?? 0,
      };
      break;
    }
  }

  res.json({
    unreadNotifications,
    onboardingPercent,
    academyCoursesCompleted,
    academyLessonsCompleted,
    academyTotalLessons,
    upcomingEventsCount,
    totalEventsCount,
    nextLesson,
  });
});

function resolveLocale(lang: string, obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const map = obj as Record<string, string>;
  return map[lang] ?? map["en"] ?? Object.values(map)[0] ?? "";
}

export default router;
