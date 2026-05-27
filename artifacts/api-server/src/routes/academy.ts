import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db,
  courses,
  courseModules,
  lessons,
  lessonResources,
  quizQuestions,
  userLessonProgress,
  quizAttempts,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// ── Locale helper ─────────────────────────────────────────────────────────────
function resolveLocale(lang: unknown, obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const map = obj as Record<string, string>;
  const l = typeof lang === "string" ? lang : "en";
  return map[l] ?? map["en"] ?? Object.values(map)[0] ?? "";
}

// ── Language-module detection ─────────────────────────────────────────────────
/**
 * BunnyStream imports create one module per language (e.g. "English Language",
 * "French Language", …). This map lets us detect those modules and filter by
 * the user's preferred language.
 */
const LANG_MODULE_MAP: Record<string, string> = {
  "english": "en",
  "english language": "en",
  "french": "fr",
  "french language": "fr",
  "spanish": "es",
  "spanish language": "es",
  "german": "de",
  "german language": "de",
  "dutch": "nl",
  "dutch language": "nl",
  "italian": "it",
  "italian language": "it",
  "portuguese": "pt",
  "portuguese language": "pt",
  "polish": "pl",
  "polish language": "pl",
};

const LANG_NATIVE_NAMES: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português",
};

/** Returns the language code if the module title marks it as a language track, otherwise null. */
function detectModuleLang(title: unknown): string | null {
  if (!title || typeof title !== "object") return null;
  const enTitle = ((title as Record<string, string>)["en"] ?? "").toLowerCase().trim();
  return LANG_MODULE_MAP[enTitle] ?? null;
}

/**
 * For a client user, keeps only the module(s) matching their language.
 * Falls back to English if no module exists for that language.
 * Regular (non-language-track) modules are always included.
 * Admins always see every module.
 */
function filterModulesForLang<T extends { title: unknown }>(
  mods: T[],
  lang: string,
  isAdmin: boolean
): T[] {
  if (isAdmin) return mods;

  const hasLangModules = mods.some((m) => detectModuleLang(m.title) !== null);
  if (!hasLangModules) return mods; // regular course structure – no filtering needed

  const userLangMods = mods.filter((m) => detectModuleLang(m.title) === lang);
  if (userLangMods.length > 0) return userLangMods;

  // Fallback to English
  const enMods = mods.filter((m) => detectModuleLang(m.title) === "en");
  if (enMods.length > 0) return enMods;

  return mods; // last resort
}

/**
 * Sorts lessons in logical order:
 *   Introduction / Intro  → first
 *   VIDEO 1.1, 1.2, 2.1  → numeric order (major.minor)
 *   Conclusion / Outro    → last
 * Unrecognised titles preserve their stored `order` field.
 */
function sortLessons<T extends { title: unknown; order: number }>(rows: T[]): T[] {
  const getSortKey = (l: T): number => {
    const titleMap = l.title as Record<string, string> | null;
    const t = (titleMap?.["en"] ?? "").toLowerCase().trim();
    if (/\b(introduction|intro)\b/.test(t)) return 0;
    if (/\b(conclusion|outro|final)\b/.test(t)) return 1_000_000;
    const m = t.match(/(\d+)[.\-_](\d+)/);
    if (m) return parseInt(m[1]) * 10_000 + parseInt(m[2]) * 100;
    const s = t.match(/\b(\d+)\b/);
    if (s) return parseInt(s[1]) * 10_000;
    return (l.order + 1) * 100 + 500; // preserve relative order for unknowns
  };
  return [...rows].sort((a, b) => getSortKey(a) - getSortKey(b));
}

// ── GET /academy/courses ──────────────────────────────────────────────────────
router.get("/academy/courses", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = (typeof req.query.lang === "string" ? req.query.lang : user.language) ?? "en";
  const isAdmin = user.role === "admin";

  const allCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.isPublished, true))
    .orderBy(courses.order);

  if (allCourses.length === 0) { res.json({ items: [] }); return; }

  const allModules = await db
    .select()
    .from(courseModules)
    .where(inArray(courseModules.courseId, allCourses.map((c) => c.id)))
    .orderBy(courseModules.order);

  const visibleModuleIds = new Set<string>();
  const modulesByCourse = new Map<string, typeof allModules>();
  for (const mod of allModules) {
    const list = modulesByCourse.get(mod.courseId) ?? [];
    list.push(mod);
    modulesByCourse.set(mod.courseId, list);
  }
  for (const c of allCourses) {
    const mods = modulesByCourse.get(c.id) ?? [];
    filterModulesForLang(mods, lang, isAdmin).forEach((m) => visibleModuleIds.add(m.id));
  }

  const allLessonsForModules =
    visibleModuleIds.size > 0
      ? await db
          .select({ id: lessons.id, moduleId: lessons.moduleId })
          .from(lessons)
          .where(and(inArray(lessons.moduleId, Array.from(visibleModuleIds)), eq(lessons.isPublished, true)))
      : [];

  const lessonsByModule = new Map<string, string[]>();
  for (const l of allLessonsForModules) {
    const list = lessonsByModule.get(l.moduleId) ?? [];
    list.push(l.id);
    lessonsByModule.set(l.moduleId, list);
  }

  const progressRows = await db
    .select({ lessonId: userLessonProgress.lessonId })
    .from(userLessonProgress)
    .where(and(eq(userLessonProgress.userId, user.id), sql`${userLessonProgress.completedAt} IS NOT NULL`));

  const completedLessonIds = new Set(progressRows.map((p) => p.lessonId));

  const items = allCourses.map((c) => {
    const mods = modulesByCourse.get(c.id) ?? [];
    const visibleMods = filterModulesForLang(mods, lang, isAdmin);
    const visibleLessonIds = visibleMods.flatMap((m) => lessonsByModule.get(m.id) ?? []);
    const lessonCount = visibleLessonIds.length;
    const completedLessons = visibleLessonIds.filter((id) => completedLessonIds.has(id)).length;

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
      totalDurationSeconds: c.totalDurationSeconds,
      completedLessons,
    };
  });

  res.json({ items });
});

// ── GET /academy/courses/:id ──────────────────────────────────────────────────
router.get("/academy/courses/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = (typeof req.query.lang === "string" ? req.query.lang : user.language) ?? "en";
  const isAdmin = user.role === "admin";
  const courseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const allModules = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(courseModules.order);

  const visibleModules = filterModulesForLang(allModules, lang, isAdmin);

  const progressRows = await db
    .select()
    .from(userLessonProgress)
    .where(eq(userLessonProgress.userId, user.id));

  const progressMap = new Map(progressRows.map((p) => [p.lessonId, p]));

  const modulesWithLessons = await Promise.all(
    visibleModules.map(async (mod) => {
      const lessonRows = await db
        .select()
        .from(lessons)
        .where(and(eq(lessons.moduleId, mod.id), eq(lessons.isPublished, true)));

      const sortedLessons = sortLessons(lessonRows);

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
            videoAssets: l.videoAssets ?? null,
            completedAt: p?.completedAt?.toISOString() ?? null,
            watchPercent: p?.watchPercent ?? null,
          };
        }),
      };
    })
  );

  const allLessons = modulesWithLessons.flatMap((m) => m.lessons);
  const lessonCount = allLessons.length;
  const completedLessons = allLessons.filter((l) => l.completedAt).length;

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
    totalDurationSeconds: course.totalDurationSeconds,
    modules: modulesWithLessons,
  });
});

// ── GET /academy/lessons/:id ──────────────────────────────────────────────────
router.get("/academy/lessons/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = (typeof req.query.lang === "string" ? req.query.lang : user.language) ?? "en";
  const lessonId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }

  const resources = await db
    .select()
    .from(lessonResources)
    .where(eq(lessonResources.lessonId, lessonId));

  const quizItems = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.lessonId, lessonId))
    .orderBy(quizQuestions.order);

  const [progress] = await db
    .select()
    .from(userLessonProgress)
    .where(
      and(
        eq(userLessonProgress.userId, user.id),
        eq(userLessonProgress.lessonId, lessonId)
      )
    );

  res.json({
    id: lesson.id,
    moduleId: lesson.moduleId,
    title: resolveLocale(lang, lesson.title),
    videoUrl: lesson.videoUrl,
    videoUrls: lesson.videoUrls ?? null,
    thumbnailUrl: lesson.thumbnailUrl ?? null,
    videoAssets: lesson.videoAssets ?? null,
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
        ? (q.options as Array<Record<string, string>>).map((o) => resolveLocale(lang, o))
        : [];
      return {
        id: q.id,
        question: resolveLocale(lang, q.question),
        options,
        correctOption: q.correctOption,
      };
    }),
    completedAt: progress?.completedAt?.toISOString() ?? null,
    watchPercent: progress?.watchPercent ?? null,
  });
});

// ── PATCH /academy/lessons/:id/progress ──────────────────────────────────────
router.patch("/academy/lessons/:id/progress", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lessonId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { watchPercent, completed } = req.body as { watchPercent: number; completed?: boolean };

  const [existing] = await db
    .select()
    .from(userLessonProgress)
    .where(
      and(
        eq(userLessonProgress.userId, user.id),
        eq(userLessonProgress.lessonId, lessonId)
      )
    );

  const completedAt = completed ? new Date() : (existing?.completedAt ?? null);
  const now = new Date();

  if (!existing) {
    await db.insert(userLessonProgress).values({
      userId: user.id,
      lessonId,
      watchPercent,
      completedAt,
    });
  } else {
    await db
      .update(userLessonProgress)
      .set({ watchPercent, completedAt, updatedAt: now })
      .where(
        and(
          eq(userLessonProgress.userId, user.id),
          eq(userLessonProgress.lessonId, lessonId)
        )
      );
  }

  res.json({
    lessonId,
    watchPercent,
    completedAt: completedAt?.toISOString() ?? null,
  });
});

// ── POST /academy/lessons/:id/quiz ────────────────────────────────────────────
router.post("/academy/lessons/:id/quiz", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lessonId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { answers } = req.body as { answers: number[] };

  const quizItems = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.lessonId, lessonId))
    .orderBy(quizQuestions.order);

  const total = quizItems.length;
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
});

// ── GET /academy/progress/summary ────────────────────────────────────────────
router.get("/academy/progress/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = (typeof req.query.lang === "string" ? req.query.lang : user.language) ?? "en";
  const isAdmin = user.role === "admin";

  const allCourses = await db.select().from(courses).where(eq(courses.isPublished, true));
  const allModules = await db.select().from(courseModules);
  const allLessonsRaw = await db.select().from(lessons).where(eq(lessons.isPublished, true));
  const allProgress = await db
    .select()
    .from(userLessonProgress)
    .where(eq(userLessonProgress.userId, user.id));

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
    filterModulesForLang(mods, lang, isAdmin).forEach((m) => visibleModuleIds.add(m.id));
  }

  const visibleLessons = allLessonsRaw.filter((l) => visibleModuleIds.has(l.moduleId));
  const visibleLessonIds = new Set(visibleLessons.map((l) => l.id));

  const relevantProgress = allProgress.filter((p) => visibleLessonIds.has(p.lessonId));
  const totalLessons = visibleLessons.length;
  const completedLessons = relevantProgress.filter((p) => p.completedAt).length;
  const totalDurationSeconds = visibleLessons.reduce((sum, l) => sum + l.durationSeconds, 0);
  const watchedDurationSeconds = relevantProgress.reduce((sum, p) => {
    const lesson = visibleLessons.find((l) => l.id === p.lessonId);
    return sum + Math.round(((lesson?.durationSeconds ?? 0) * p.watchPercent) / 100);
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
    const visible = filterModulesForLang(mods, lang, isAdmin);
    const courseLessonIds = visible.flatMap((m) => lessonsByModule.get(m.id) ?? []);
    if (courseLessonIds.length > 0 && courseLessonIds.every((lid) => progressMap.get(lid)?.completedAt)) {
      completedCourses++;
    }
  }

  const percentComplete = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  res.json({
    totalCourses: allCourses.length,
    completedCourses,
    totalLessons,
    completedLessons,
    totalDurationSeconds,
    watchedDurationSeconds,
    percentComplete,
  });
});

// ── GET /academy/progress/next-lesson ────────────────────────────────────────
router.get("/academy/progress/next-lesson", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = (typeof req.query.lang === "string" ? req.query.lang : user.language) ?? "en";
  const isAdmin = user.role === "admin";

  const allCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.isPublished, true))
    .orderBy(courses.order);

  const allModules = await db.select().from(courseModules).orderBy(courseModules.order);

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
    filterModulesForLang(mods, lang, isAdmin).forEach((m) => visibleModuleIds.add(m.id));
  }

  if (visibleModuleIds.size === 0) {
    res.status(404).json({ error: "No lessons available" });
    return;
  }

  const allLessonsRaw = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.isPublished, true), inArray(lessons.moduleId, Array.from(visibleModuleIds))));

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
    const visibleMods = filterModulesForLang(mods, lang, isAdmin);
    for (const mod of visibleMods) {
      const modLessons = lessonsByModule.get(mod.id) ?? [];
      orderedLessons.push(...sortLessons(modLessons));
    }
  }

  const allProgress = await db
    .select()
    .from(userLessonProgress)
    .where(eq(userLessonProgress.userId, user.id));

  const completedIds = new Set(allProgress.filter((p) => p.completedAt).map((p) => p.lessonId));
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
});

export default router;
