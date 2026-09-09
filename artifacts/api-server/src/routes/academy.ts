import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db,
  lessonResources,
  quizQuestions,
  userLessonProgress,
  quizAttempts,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { SubmitQuizBody, UpdateLessonProgressBody } from "@workspace/api-zod";
import { getOrCreateUser } from "../lib/userSync";
import { canAccessPublishedContent } from "../lib/academyAccess";
import { getPublishedAcademyCatalog } from "../lib/academyCatalog";
import {
  LANG_NATIVE_NAMES,
  detectModuleLang,
  filterModulesForLang,
  normalizeAcademyLang,
  resolveLocale,
  sortAcademyLessons,
} from "../lib/academyLanguage";
import {
  BunnyPlaybackConfigurationError,
  secureLessonPlayback,
  isBunnyPlaybackUrl,
  thumbnailOnlyVideoAssets,
} from "../lib/bunnySecurity";
import { localizedLessonPlayback } from "../lib/localizedPlayback";
import { verifyBunnyPlaybackProtection } from "../lib/bunnyPlaybackVerification";

const router: IRouter = Router();
router.use("/academy", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

async function getLessonAccess(lessonId: string, lang: string) {
  const catalog = await getPublishedAcademyCatalog();
  const lesson = catalog.lessons.find((item) => item.id === lessonId);
  if (!lesson) return null;

  const module = catalog.modules.find((item) => item.id === lesson.moduleId);
  const course = module
    ? catalog.courses.find((item) => item.id === module.courseId)
    : undefined;
  if (!module || !course) return null;
  const courseModulesForCourse = catalog.modules
    .filter((item) => item.courseId === course.id)
    .sort((a, b) => a.order - b.order);

  return filterModulesForLang(courseModulesForCourse, lang).some(
    (item) => item.id === module.id,
  ) ? { lesson, module, course } : null;
}

// ── GET /academy/courses ──────────────────────────────────────────────────────
router.get(
  "/academy/courses",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lang = normalizeAcademyLang(req.query.lang ?? user.language);
    const category =
      typeof req.query.category === "string" ? req.query.category : undefined;
    const level =
      typeof req.query.level === "string" ? req.query.level : undefined;

    const catalog = await getPublishedAcademyCatalog();
    const allCourses = catalog.courses.filter((course) => {
      if (category && course.category !== category) return false;
      if (level && course.level !== level) return false;
      return true;
    });

    if (allCourses.length === 0) {
      res.json({ items: [] });
      return;
    }

    const courseIds = new Set(allCourses.map((course) => course.id));
    const allModules = catalog.modules.filter((module) =>
      courseIds.has(module.courseId),
    );

    const visibleModuleIds = new Set<string>();
    const modulesByCourse = new Map<string, typeof allModules>();
    for (const mod of allModules) {
      const list = modulesByCourse.get(mod.courseId) ?? [];
      list.push(mod);
      modulesByCourse.set(mod.courseId, list);
    }
    for (const c of allCourses) {
      const mods = modulesByCourse.get(c.id) ?? [];
      filterModulesForLang(mods, lang).forEach((m) =>
        visibleModuleIds.add(m.id),
      );
    }

    const allLessonsForModules = catalog.lessons
      .filter((lesson) => visibleModuleIds.has(lesson.moduleId))
      .map((lesson) => ({
        id: lesson.id,
        moduleId: lesson.moduleId,
        durationSeconds: lesson.durationSeconds,
      }));

    const lessonsByModule = new Map<
      string,
      Array<{ id: string; durationSeconds: number }>
    >();
    for (const l of allLessonsForModules) {
      const list = lessonsByModule.get(l.moduleId) ?? [];
      list.push({ id: l.id, durationSeconds: l.durationSeconds });
      lessonsByModule.set(l.moduleId, list);
    }

    const visibleLessonIds = allLessonsForModules.map((lesson) => lesson.id);
    const progressRows =
      visibleLessonIds.length > 0
        ? await db
            .select({ lessonId: userLessonProgress.lessonId })
            .from(userLessonProgress)
            .where(
              and(
                eq(userLessonProgress.userId, user.id),
                inArray(userLessonProgress.lessonId, visibleLessonIds),
                sql`${userLessonProgress.completedAt} IS NOT NULL`,
              ),
            )
        : [];

    const completedLessonIds = new Set(progressRows.map((p) => p.lessonId));

    const items = allCourses.map((c) => {
      const mods = modulesByCourse.get(c.id) ?? [];
      const visibleMods = filterModulesForLang(mods, lang);
      const visibleLessons = visibleMods.flatMap(
        (m) => lessonsByModule.get(m.id) ?? [],
      );
      const courseVisibleLessonIds = visibleLessons.map((lesson) => lesson.id);
      const lessonCount = courseVisibleLessonIds.length;
      const completedLessons = courseVisibleLessonIds.filter((id) =>
        completedLessonIds.has(id),
      ).length;
      const totalDurationSeconds = visibleLessons.reduce(
        (sum, lesson) => sum + lesson.durationSeconds,
        0,
      );

      return {
        id: c.id,
        slug: c.slug,
        title: resolveLocale(lang, c.title),
        description: resolveLocale(lang, c.description),
        category: c.category,
        level: c.level,
        order: c.order,
        thumbnailUrl: c.thumbnailUrl,
        moduleCount: visibleMods.length,
        lessonCount,
        totalDurationSeconds,
        completedLessons,
      };
    });

    res.json({ items });
  },
);

// ── GET /academy/courses/:id ──────────────────────────────────────────────────
router.get(
  "/academy/courses/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lang = normalizeAcademyLang(req.query.lang ?? user.language);
    const courseId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const catalog = await getPublishedAcademyCatalog();
    const course = catalog.courses.find((item) => item.id === courseId);
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!canAccessPublishedContent(user, { course })) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const allModules = catalog.modules
      .filter((module) => module.courseId === courseId)
      .sort((a, b) => a.order - b.order);

    const visibleModules = filterModulesForLang(allModules, lang);

    const visibleModuleIds = visibleModules.map((mod) => mod.id);
    const visibleModuleIdSet = new Set(visibleModuleIds);
    const lessonRows = catalog.lessons.filter((lesson) =>
      visibleModuleIdSet.has(lesson.moduleId),
    );
    const visibleLessonIds = lessonRows.map((lesson) => lesson.id);
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

    const progressMap = new Map(progressRows.map((p) => [p.lessonId, p]));

    const lessonsByModule = new Map<string, typeof lessonRows>();
    for (const lesson of lessonRows) {
      const list = lessonsByModule.get(lesson.moduleId) ?? [];
      list.push(lesson);
      lessonsByModule.set(lesson.moduleId, list);
    }

    const modulesWithLessons = visibleModules.map((mod) => {
      const sortedLessons = sortAcademyLessons(lessonsByModule.get(mod.id) ?? []);

      // For language-track modules, use the native language name as the title
      const moduleLangCode = detectModuleLang(mod.title);
      const moduleTitle = moduleLangCode
        ? (LANG_NATIVE_NAMES[moduleLangCode] ?? resolveLocale(lang, mod.title))
        : resolveLocale(lang, mod.title);

      return {
        id: mod.id,
        courseId: mod.courseId,
        title: moduleTitle,
        order: mod.order,
        lessons: sortedLessons.map((l) => {
          const p = progressMap.get(l.id);
          return {
            id: l.id,
            moduleId: l.moduleId,
            title: resolveLocale(lang, l.title),
            durationSeconds: l.durationSeconds,
            order: l.order,
            isPublished: l.isPublished,
            thumbnailUrl: l.thumbnailUrl ?? null,
            videoAssets: thumbnailOnlyVideoAssets(l.videoAssets),
            completedAt: p?.completedAt?.toISOString() ?? null,
            watchPercent: p?.watchPercent ?? null,
          };
        }),
      };
    });

    const allLessons = modulesWithLessons.flatMap((m) => m.lessons);
    const lessonCount = allLessons.length;
    const completedLessons = allLessons.filter((l) => l.completedAt).length;
    const totalDurationSeconds = allLessons.reduce(
      (sum, lesson) => sum + lesson.durationSeconds,
      0,
    );

    res.json({
      id: course.id,
      slug: course.slug,
      title: resolveLocale(lang, course.title),
      description: resolveLocale(lang, course.description),
      category: course.category,
      level: course.level,
      order: course.order,
      thumbnailUrl: course.thumbnailUrl,
      completedLessons,
      lessonCount,
      totalDurationSeconds,
      modules: modulesWithLessons,
    });
  },
);

// ── GET /academy/lessons/:id ──────────────────────────────────────────────────
router.get(
  "/academy/lessons/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lang = normalizeAcademyLang(req.query.lang ?? user.language);
    const lessonId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const access = await getLessonAccess(lessonId, lang);
    if (
      !access ||
      !canAccessPublishedContent(user, access)
    ) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    const { lesson } = access;
    let playback;
    try {
      playback = secureLessonPlayback(localizedLessonPlayback(lesson, lang));
      const bunnyUrl = [playback.videoUrl, ...Object.values(playback.videoUrls ?? {}),
        ...Object.values(playback.videoAssets ?? {}).map((asset) => asset.embedUrl)]
        .find(isBunnyPlaybackUrl);
      if (bunnyUrl) await verifyBunnyPlaybackProtection(bunnyUrl);
    } catch (error) {
      if (!(error instanceof BunnyPlaybackConfigurationError)) throw error;
      req.log.warn({ lessonId }, "Bunny playback configuration is incomplete");
      res.status(503).json({ error: error.message, code: "PLAYBACK_UNAVAILABLE" });
      return;
    }

    const [resources, quizItems, progressRows] = await Promise.all([
      db
        .select()
        .from(lessonResources)
        .where(eq(lessonResources.lessonId, lessonId)),
      db
        .select()
        .from(quizQuestions)
        .where(eq(quizQuestions.lessonId, lessonId))
        .orderBy(quizQuestions.order),
      db
        .select()
        .from(userLessonProgress)
        .where(
          and(
            eq(userLessonProgress.userId, user.id),
            eq(userLessonProgress.lessonId, lessonId),
          ),
        ),
    ]);
    const [progress] = progressRows;

    res.json({
      id: lesson.id,
      moduleId: lesson.moduleId,
      title: resolveLocale(lang, lesson.title),
      videoUrl: playback.videoUrl,
      videoUrls: playback.videoUrls,
      thumbnailUrl: lesson.thumbnailUrl ?? null,
      videoAssets: playback.videoAssets,
      durationSeconds: lesson.durationSeconds,
      order: lesson.order,
      resources: resources.map((r) => ({
        id: r.id,
        lessonId: r.lessonId,
        title: resolveLocale(lang, r.title),
        type: r.type,
        url: r.url,
      })),
      quizQuestions: quizItems.map((q) => {
        const options = Array.isArray(q.options)
          ? (q.options as Array<Record<string, string>>).map((o) =>
              resolveLocale(lang, o),
            )
          : [];
        return {
          id: q.id,
          question: resolveLocale(lang, q.question),
          options,
        };
      }),
      completedAt: progress?.completedAt?.toISOString() ?? null,
      watchPercent: progress?.watchPercent ?? null,
    });
  },
);

// ── PATCH /academy/lessons/:id/progress ──────────────────────────────────────
router.patch(
  "/academy/lessons/:id/progress",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lessonId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const lang = normalizeAcademyLang(req.query.lang ?? user.language);
    const parsed = UpdateLessonProgressBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid lesson progress" });
      return;
    }
    const { watchPercent: boundedWatchPercent, completed } = parsed.data;

    const access = await getLessonAccess(lessonId, lang);
    if (
      !access ||
      !canAccessPublishedContent(user, access)
    ) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    const now = new Date();
    const completedAt = completed ? now : null;
    const [saved] = await db
      .insert(userLessonProgress)
      .values({
        userId: user.id,
        lessonId,
        watchPercent: boundedWatchPercent,
        completedAt,
      })
      .onConflictDoUpdate({
        target: [userLessonProgress.userId, userLessonProgress.lessonId],
        set: {
          watchPercent: sql`greatest(${userLessonProgress.watchPercent}, excluded.watch_percent)`,
          completedAt: sql`coalesce(${userLessonProgress.completedAt}, excluded.completed_at)`,
          updatedAt: now,
        },
      })
      .returning();

    res.json({
      lessonId,
      watchPercent: saved?.watchPercent ?? boundedWatchPercent,
      completedAt: saved?.completedAt?.toISOString() ?? null,
    });
  },
);

// ── POST /academy/lessons/:id/quiz ────────────────────────────────────────────
router.post(
  "/academy/lessons/:id/quiz",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lessonId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const lang = normalizeAcademyLang(req.query.lang ?? user.language);
    const parsed = SubmitQuizBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid quiz answers" });
      return;
    }
    const { answers } = parsed.data;

    const access = await getLessonAccess(lessonId, lang);
    if (
      !access ||
      !canAccessPublishedContent(user, access)
    ) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }

    const quizItems = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.lessonId, lessonId))
      .orderBy(quizQuestions.order);

    const total = quizItems.length;
    if (answers.length !== total || quizItems.some((question, index) =>
      answers[index] >= (Array.isArray(question.options) ? question.options.length : 0),
    )) {
      res.status(400).json({ error: "Invalid quiz answers" });
      return;
    }
    const answerDetails = quizItems.map((q, i) => ({
      questionId: q.id,
      correct: answers[i] === q.correctOption,
      selectedOption: answers[i] ?? -1,
      correctOption: q.correctOption,
    }));

    const score = answerDetails.filter((a) => a.correct).length;
    const passed = total > 0 && score / total >= 0.7;

    await db.insert(quizAttempts).values({
      userId: user.id,
      lessonId,
      score,
      total,
      passed,
      answers: answerDetails,
    });

    res.json({ score, total, passed, answers: answerDetails });
  },
);

// ── GET /academy/progress/summary ────────────────────────────────────────────
router.get(
  "/academy/progress/summary",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lang = normalizeAcademyLang(req.query.lang ?? user.language);

    const catalog = await getPublishedAcademyCatalog();
    const allCourses = catalog.courses;
    const allModules = catalog.modules;
    const allLessonsRaw = catalog.lessons;

    // Build course → module map
    const courseModulesMap = new Map<string, typeof allModules>();
    for (const mod of allModules) {
      const list = courseModulesMap.get(mod.courseId) ?? [];
      list.push(mod);
      courseModulesMap.set(mod.courseId, list);
    }

    // Collect visible module IDs for this user
    const visibleModuleIds = new Set<string>();
    for (const c of allCourses) {
      const mods = courseModulesMap.get(c.id) ?? [];
      filterModulesForLang(mods, lang).forEach((m) =>
        visibleModuleIds.add(m.id),
      );
    }

    const visibleLessons = allLessonsRaw.filter((l) =>
      visibleModuleIds.has(l.moduleId),
    );
    const visibleLessonIds = new Set(visibleLessons.map((l) => l.id));
    const allProgress =
      visibleLessonIds.size > 0
        ? await db
            .select()
            .from(userLessonProgress)
            .where(
              and(
                eq(userLessonProgress.userId, user.id),
                inArray(userLessonProgress.lessonId, Array.from(visibleLessonIds)),
              ),
            )
        : [];

    const relevantProgress = allProgress.filter((p) =>
      visibleLessonIds.has(p.lessonId),
    );
    const totalLessons = visibleLessons.length;
    const completedLessons = relevantProgress.filter(
      (p) => p.completedAt,
    ).length;
    const totalDurationSeconds = visibleLessons.reduce(
      (sum, l) => sum + l.durationSeconds,
      0,
    );
    const visibleLessonDurationById = new Map(
      visibleLessons.map((lesson) => [lesson.id, lesson.durationSeconds]),
    );
    const watchedDurationSeconds = relevantProgress.reduce((sum, p) => {
      const lessonDuration = visibleLessonDurationById.get(p.lessonId) ?? 0;
      return (
        sum +
        Math.round((lessonDuration * p.watchPercent) / 100)
      );
    }, 0);

    // Build lesson sets per module for course-completion check
    const lessonsByModule = new Map<string, string[]>();
    for (const l of visibleLessons) {
      const list = lessonsByModule.get(l.moduleId) ?? [];
      list.push(l.id);
      lessonsByModule.set(l.moduleId, list);
    }
    const progressMap = new Map(allProgress.map((p) => [p.lessonId, p]));

    let completedCourses = 0;
    for (const c of allCourses) {
      const mods = courseModulesMap.get(c.id) ?? [];
      const visible = filterModulesForLang(mods, lang);
      const courseLessonIds = visible.flatMap(
        (m) => lessonsByModule.get(m.id) ?? [],
      );
      if (
        courseLessonIds.length > 0 &&
        courseLessonIds.every((lid) => progressMap.get(lid)?.completedAt)
      ) {
        completedCourses++;
      }
    }

    const percentComplete =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    res.json({
      totalCourses: allCourses.length,
      completedCourses,
      totalLessons,
      completedLessons,
      totalDurationSeconds,
      watchedDurationSeconds,
      percentComplete,
    });
  },
);

// ── GET /academy/progress/next-lesson ────────────────────────────────────────
router.get(
  "/academy/progress/next-lesson",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await getOrCreateUser(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const lang = normalizeAcademyLang(req.query.lang ?? user.language);

    const catalog = await getPublishedAcademyCatalog();
    const allCourses = catalog.courses;
    const allModules = catalog.modules;

    // Build course → module map and collect visible module IDs
    const courseModulesMap = new Map<string, typeof allModules>();
    for (const mod of allModules) {
      const list = courseModulesMap.get(mod.courseId) ?? [];
      list.push(mod);
      courseModulesMap.set(mod.courseId, list);
    }

    const visibleModuleIds = new Set<string>();
    for (const c of allCourses) {
      const mods = courseModulesMap.get(c.id) ?? [];
      filterModulesForLang(mods, lang).forEach((m) =>
        visibleModuleIds.add(m.id),
      );
    }

    if (visibleModuleIds.size === 0) {
      res.status(404).json({ error: "No lessons available" });
      return;
    }

    const allLessonsRaw = catalog.lessons.filter((lesson) =>
      visibleModuleIds.has(lesson.moduleId),
    );

    // Group by module for smart sorting
    const lessonsByModule = new Map<string, typeof allLessonsRaw>();
    for (const l of allLessonsRaw) {
      const list = lessonsByModule.get(l.moduleId) ?? [];
      list.push(l);
      lessonsByModule.set(l.moduleId, list);
    }

    // Build globally ordered list: course order → module order → sorted lessons
    const orderedLessons: typeof allLessonsRaw = [];
    for (const c of allCourses) {
      const mods = courseModulesMap.get(c.id) ?? [];
      const visibleMods = filterModulesForLang(mods, lang);
      for (const mod of visibleMods) {
        const modLessons = lessonsByModule.get(mod.id) ?? [];
        orderedLessons.push(...sortAcademyLessons(modLessons));
      }
    }

    const orderedLessonIds = orderedLessons.map((lesson) => lesson.id);
    const allProgress =
      orderedLessonIds.length > 0
        ? await db
            .select()
            .from(userLessonProgress)
            .where(
              and(
                eq(userLessonProgress.userId, user.id),
                inArray(userLessonProgress.lessonId, orderedLessonIds),
              ),
            )
        : [];

    const completedIds = new Set(
      allProgress.filter((p) => p.completedAt).map((p) => p.lessonId),
    );
    const progressMap = new Map(allProgress.map((p) => [p.lessonId, p]));
    const moduleMap = new Map(allModules.map((m) => [m.id, m]));
    const courseMap = new Map(allCourses.map((c) => [c.id, c]));

    for (const lesson of orderedLessons) {
      if (!completedIds.has(lesson.id)) {
        const mod = moduleMap.get(lesson.moduleId);
        if (!mod) continue;
        const course = courseMap.get(mod.courseId);
        if (!course) continue;
        const p = progressMap.get(lesson.id);

        res.json({
          lessonId: lesson.id,
          lessonTitle: resolveLocale(lang, lesson.title),
          courseId: course.id,
          courseTitle: resolveLocale(lang, course.title),
          courseThumbnailUrl: course.thumbnailUrl,
          moduleTitle: resolveLocale(lang, mod.title),
          durationSeconds: lesson.durationSeconds,
          watchPercent: p?.watchPercent ?? 0,
        });
        return;
      }
    }

    // All complete — return first lesson as review prompt
    const firstLesson = orderedLessons[0];
    if (firstLesson) {
      const mod = moduleMap.get(firstLesson.moduleId);
      const course = mod ? courseMap.get(mod.courseId) : undefined;
      res.json({
        lessonId: firstLesson.id,
        lessonTitle: resolveLocale(lang, firstLesson.title),
        courseId: course?.id ?? "",
        courseTitle: resolveLocale(lang, course?.title ?? {}),
        courseThumbnailUrl: course?.thumbnailUrl ?? "",
        moduleTitle: resolveLocale(lang, mod?.title ?? {}),
        durationSeconds: firstLesson.durationSeconds,
        watchPercent: 100,
      });
      return;
    }

    res.status(404).json({ error: "No lessons available" });
  },
);

export default router;
