import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, count, gt, sql, lte, or, ne, isNotNull } from "drizzle-orm";
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
  equipment,
  consumableStock,
  consumableCatalog,
  supportTickets,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /dashboard/summary
router.get("/dashboard/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = user.language ?? "en";
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Run all queries in parallel for performance
  const [
    unreadNotifResult,
    allSteps,
    doneSteps,
    allCourses,
    allModules,
    allLessons,
    allProgress,
    upcomingCountResult,
    totalEventsCountResult,
    equipmentAlertsResult,
    openTicketsResult,
  ] = await Promise.all([
    // Unread notifications
    db
      .select({ value: count() })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false))),

    // Onboarding steps
    db.select().from(onboardingStepsTable),

    // Completed onboarding
    db
      .select()
      .from(userOnboardingProgressTable)
      .where(
        and(
          eq(userOnboardingProgressTable.userId, user.id),
          sql`${userOnboardingProgressTable.completedAt} IS NOT NULL`
        )
      ),

    // Published courses
    db.select().from(courses).where(eq(courses.isPublished, true)),

    // All modules
    db.select().from(courseModules),

    // Published lessons
    db.select().from(lessons).where(eq(lessons.isPublished, true)),

    // User lesson progress
    db.select().from(userLessonProgress).where(eq(userLessonProgress.userId, user.id)),

    // Upcoming events count
    db
      .select({ value: count() })
      .from(events)
      .where(and(eq(events.userId, user.id), eq(events.status, "upcoming"), gt(events.eventDate, now))),

    // Total events count
    db
      .select({ value: count() })
      .from(events)
      .where(eq(events.userId, user.id)),

    // Equipment alerts: warranty expiring ≤30 days OR service due ≤14 days
    db
      .select({ value: count() })
      .from(equipment)
      .where(
        and(
          eq(equipment.userId, user.id),
          ne(equipment.status, "retired"),
          or(
            and(isNotNull(equipment.warrantyExpiration), lte(equipment.warrantyExpiration, thirtyDaysOut)),
            and(isNotNull(equipment.nextMaintenanceDate), lte(equipment.nextMaintenanceDate, fourteenDaysOut))
          )
        )
      ),

    // Open support tickets (open or in_progress)
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.userId, user.id),
          or(eq(supportTickets.status, "open"), eq(supportTickets.status, "in_progress"))
        )
      ),
  ]);

  const unreadNotifications = unreadNotifResult[0]?.value ?? 0;
  const onboardingPercent =
    allSteps.length > 0 ? Math.round((doneSteps.length / allSteps.length) * 100) : 0;

  // Academy stats — language-filtered (same detection logic as academy.ts)
  const LANG_MOD_MAP: Record<string, string> = {
    "english": "en", "english language": "en",
    "french": "fr", "french language": "fr",
    "spanish": "es", "spanish language": "es",
    "german": "de", "german language": "de",
    "dutch": "nl", "dutch language": "nl",
    "italian": "it", "italian language": "it",
    "portuguese": "pt", "portuguese language": "pt",
    "polish": "pl", "polish language": "pl",
  };
  function detectLangTrack(title: unknown): string | null {
    if (!title || typeof title !== "object") return null;
    const t = ((title as Record<string, string>)["en"] ?? "").toLowerCase().trim();
    return LANG_MOD_MAP[t] ?? null;
  }

  // Build course → modules map, compute language-visible module IDs
  const courseModsByCourse = new Map<string, typeof allModules>();
  for (const mod of allModules) {
    const list = courseModsByCourse.get(mod.courseId) ?? [];
    list.push(mod);
    courseModsByCourse.set(mod.courseId, list);
  }
  const visibleModuleIds = new Set<string>();
  for (const course of allCourses) {
    const mods = courseModsByCourse.get(course.id) ?? [];
    const hasLangMods = mods.some((m) => detectLangTrack(m.title) !== null);
    if (!hasLangMods) { mods.forEach((m) => visibleModuleIds.add(m.id)); continue; }
    const langMods = mods.filter((m) => detectLangTrack(m.title) === lang);
    const chosen = langMods.length > 0 ? langMods : mods.filter((m) => detectLangTrack(m.title) === "en");
    (chosen.length > 0 ? chosen : mods).forEach((m) => visibleModuleIds.add(m.id));
  }
  const visibleLessons = allLessons.filter((l) => visibleModuleIds.has(l.moduleId));

  const completedProgressIds = new Set(
    allProgress.filter((p) => p.completedAt).map((p) => p.lessonId)
  );
  const academyLessonsCompleted = visibleLessons.filter((l) => completedProgressIds.has(l.id)).length;
  const academyTotalLessons = visibleLessons.length;

  const lessonsByModule = new Map<string, string[]>();
  for (const l of visibleLessons) {
    const list = lessonsByModule.get(l.moduleId) ?? [];
    list.push(l.id);
    lessonsByModule.set(l.moduleId, list);
  }
  let academyCoursesCompleted = 0;
  for (const course of allCourses) {
    const mids = Array.from(visibleModuleIds).filter((mid) =>
      (courseModsByCourse.get(course.id) ?? []).some((m) => m.id === mid)
    );
    const lids = mids.flatMap((mid) => lessonsByModule.get(mid) ?? []);
    if (lids.length > 0 && lids.every((lid) => completedProgressIds.has(lid))) {
      academyCoursesCompleted++;
    }
  }

  // Low-stock consumables: join stock with catalog, count rows where qty ≤ threshold
  const lowStockRows = await db
    .select({
      id: consumableStock.id,
      currentQuantity: consumableStock.currentQuantity,
      reorderThreshold: consumableCatalog.reorderThreshold,
    })
    .from(consumableStock)
    .innerJoin(consumableCatalog, eq(consumableStock.catalogItemId, consumableCatalog.id))
    .where(
      and(
        eq(consumableStock.userId, user.id),
        sql`${consumableStock.currentQuantity} <= ${consumableCatalog.reorderThreshold}`
      )
    );
  const lowStockCount = lowStockRows.length;

  // Next lesson — first incomplete lesson (within user's language track)
  const moduleMap = new Map(allModules.map((m) => [m.id, m]));
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));
  const progressMap = new Map(allProgress.map((p) => [p.lessonId, p]));

  const sortedLessons = [...visibleLessons].sort((a, b) => {
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
    upcomingEventsCount: upcomingCountResult[0]?.value ?? 0,
    totalEventsCount: totalEventsCountResult[0]?.value ?? 0,
    equipmentAlerts: equipmentAlertsResult[0]?.value ?? 0,
    lowStockCount,
    openTicketsCount: openTicketsResult[0]?.value ?? 0,
    nextLesson,
  });
});

function resolveLocale(lang: string, obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const map = obj as Record<string, string>;
  return map[lang] ?? map["en"] ?? Object.values(map)[0] ?? "";
}

export default router;
