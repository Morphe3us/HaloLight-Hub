import { Router, type IRouter, type Request, type Response } from "express";
import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import {
  consumableCatalog,
  consumableStock,
  db,
  equipment,
  events,
  contracts,
  invoices,
  leads,
  notificationsTable,
  quotes,
  onboardingStepsTable,
  supportTickets,
  userLessonProgress,
  userOnboardingProgressTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getPublishedAcademyCatalog } from "../lib/academyCatalog";
import {
  filterModulesForLang,
  normalizeAcademyLang,
  resolveLocale,
  sortAcademyLessons,
} from "../lib/academyLanguage";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function scalarCount(query: SQLWrapper) {
  return sql<number>`${query}`.mapWith(Number);
}

router.get(
  "/dashboard/summary",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lang = normalizeAcademyLang(req.query.lang ?? user.language);
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // One count statement uses one pool slot, independently of catalog loading.
    const [countsResult, catalog] = await Promise.all([
      db
        .select({
          unreadNotifications: scalarCount(
            db
              .select({ value: count() })
              .from(notificationsTable)
              .where(
                and(
                  eq(notificationsTable.userId, user.id),
                  eq(notificationsTable.isRead, false),
                ),
              ),
          ),
          allSteps: scalarCount(
            db.select({ value: count() }).from(onboardingStepsTable),
          ),
          doneSteps: scalarCount(
            db
              .select({ value: count() })
              .from(userOnboardingProgressTable)
              .where(
                and(
                  eq(userOnboardingProgressTable.userId, user.id),
                  sql`${userOnboardingProgressTable.completedAt} IS NOT NULL`,
                ),
              ),
          ),
          upcomingEventsCount: scalarCount(
            db
              .select({ value: count() })
              .from(events)
              .where(
                and(
                  eq(events.userId, user.id),
                  eq(events.status, "upcoming"),
                  gt(events.eventDate, now),
                ),
              ),
          ),
          totalEventsCount: scalarCount(
            db
              .select({ value: count() })
              .from(events)
              .where(eq(events.userId, user.id)),
          ),
          equipmentAlerts: scalarCount(
            db
              .select({ value: count() })
              .from(equipment)
              .where(
                and(
                  eq(equipment.userId, user.id),
                  ne(equipment.status, "retired"),
                  or(
                    and(
                      isNotNull(equipment.warrantyExpiration),
                      lte(equipment.warrantyExpiration, thirtyDaysOut),
                    ),
                    and(
                      isNotNull(equipment.nextMaintenanceDate),
                      lte(equipment.nextMaintenanceDate, fourteenDaysOut),
                    ),
                  ),
                ),
              ),
          ),
          lowStockCount: scalarCount(
            db
              .select({ value: count() })
              .from(consumableStock)
              .innerJoin(
                consumableCatalog,
                eq(consumableStock.catalogItemId, consumableCatalog.id),
              )
              .where(
                and(
                  eq(consumableStock.userId, user.id),
                  sql`${consumableStock.currentQuantity} <= ${consumableCatalog.reorderThreshold}`,
                ),
              ),
          ),
          openTicketsCount: scalarCount(
            db
              .select({ value: count() })
              .from(supportTickets)
              .where(
                and(
                  eq(supportTickets.userId, user.id),
                  or(
                    eq(supportTickets.status, "open"),
                    eq(supportTickets.status, "in_progress"),
                  ),
                ),
              ),
          ),
          leadsCount: scalarCount(
            db
              .select({ value: count() })
              .from(leads)
              .where(eq(leads.userId, user.id)),
          ),
          quotesCount: scalarCount(
            db
              .select({ value: count() })
              .from(quotes)
              .where(eq(quotes.userId, user.id)),
          ),
          contractsCount: scalarCount(
            db
              .select({ value: count() })
              .from(contracts)
              .where(eq(contracts.userId, user.id)),
          ),
          invoicesCount: scalarCount(
            db
              .select({ value: count() })
              .from(invoices)
              .where(eq(invoices.userId, user.id)),
          ),
        })
        .from(sql`(select 1) as dashboard_counts`),
      getPublishedAcademyCatalog(),
    ]);

    const allCourses = catalog.courses;
    const allModules = catalog.modules;
    const allLessons = catalog.lessons;
    const courseModsByCourse = new Map<string, typeof allModules>();
    for (const mod of allModules) {
      const list = courseModsByCourse.get(mod.courseId) ?? [];
      list.push(mod);
      courseModsByCourse.set(mod.courseId, list);
    }

    const visibleModuleIds = new Set<string>();
    for (const course of allCourses) {
      filterModulesForLang(courseModsByCourse.get(course.id) ?? [], lang).forEach(
        (module) => visibleModuleIds.add(module.id),
      );
    }

    const visibleLessons = allLessons.filter((lesson) =>
      visibleModuleIds.has(lesson.moduleId),
    );
    const visibleLessonIds = visibleLessons.map((lesson) => lesson.id);
    const progressRows =
      visibleLessonIds.length > 0
        ? await db
            .select()
            .from(userLessonProgress)
            .where(
              and(
                eq(userLessonProgress.userId, user.id),
                inArray(userLessonProgress.lessonId, visibleLessonIds),
              ),
            )
        : [];

    const completedLessonIds = new Set(
      progressRows
        .filter((progress) => progress.completedAt)
        .map((progress) => progress.lessonId),
    );
    const lessonsByModule = new Map<string, typeof visibleLessons>();
    for (const lesson of visibleLessons) {
      const list = lessonsByModule.get(lesson.moduleId) ?? [];
      list.push(lesson);
      lessonsByModule.set(lesson.moduleId, list);
    }

    let academyCoursesCompleted = 0;
    for (const course of allCourses) {
      const visibleModules = filterModulesForLang(
        courseModsByCourse.get(course.id) ?? [],
        lang,
      );
      const courseLessonIds = visibleModules.flatMap((module) =>
        (lessonsByModule.get(module.id) ?? []).map((lesson) => lesson.id),
      );
      if (
        courseLessonIds.length > 0 &&
        courseLessonIds.every((lessonId) => completedLessonIds.has(lessonId))
      ) {
        academyCoursesCompleted++;
      }
    }

    const moduleMap = new Map(allModules.map((module) => [module.id, module]));
    const courseMap = new Map(allCourses.map((course) => [course.id, course]));
    const progressMap = new Map(
      progressRows.map((progress) => [progress.lessonId, progress]),
    );
    const orderedLessons = allCourses.flatMap((course) =>
      filterModulesForLang(courseModsByCourse.get(course.id) ?? [], lang).flatMap(
        (module) => sortAcademyLessons(lessonsByModule.get(module.id) ?? []),
      ),
    );

    let nextLesson = null;
    for (const lesson of orderedLessons) {
      if (completedLessonIds.has(lesson.id)) continue;
      const module = moduleMap.get(lesson.moduleId);
      const course = module ? courseMap.get(module.courseId) : undefined;
      if (!module || !course) continue;
      const progress = progressMap.get(lesson.id);
      nextLesson = {
        lessonId: lesson.id,
        lessonTitle: resolveLocale(lang, lesson.title),
        courseId: course.id,
        courseTitle: resolveLocale(lang, course.title),
        courseThumbnailUrl: course.thumbnailUrl,
        moduleTitle: resolveLocale(lang, module.title),
        durationSeconds: lesson.durationSeconds,
        watchPercent: progress?.watchPercent ?? 0,
      };
      break;
    }

    const counts = countsResult[0];
    const allStepsCount = counts?.allSteps ?? 0;
    const doneStepsCount = counts?.doneSteps ?? 0;

    res.json({
      unreadNotifications: counts?.unreadNotifications ?? 0,
      onboardingPercent:
        allStepsCount > 0
          ? Math.round((doneStepsCount / allStepsCount) * 100)
          : 0,
      academyCoursesCompleted,
      academyLessonsCompleted: completedLessonIds.size,
      academyTotalLessons: visibleLessons.length,
      upcomingEventsCount: counts?.upcomingEventsCount ?? 0,
      totalEventsCount: counts?.totalEventsCount ?? 0,
      equipmentAlerts: counts?.equipmentAlerts ?? 0,
      lowStockCount: counts?.lowStockCount ?? 0,
      openTicketsCount: counts?.openTicketsCount ?? 0,
      leadsCount: counts?.leadsCount ?? 0,
      quotesCount: counts?.quotesCount ?? 0,
      contractsCount: counts?.contractsCount ?? 0,
      invoicesCount: counts?.invoicesCount ?? 0,
      nextLesson,
    });
  },
);

export default router;
