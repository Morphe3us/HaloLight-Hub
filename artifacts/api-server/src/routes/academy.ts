import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
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

function resolveLocale(lang: unknown, obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const map = obj as Record<string, string>;
  const l = typeof lang === "string" ? lang : "en";
  return map[l] ?? map["en"] ?? Object.values(map)[0] ?? "";
}

// GET /academy/courses
router.get("/academy/courses", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = req.query.lang ?? user.language ?? "en";

  const allCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.isPublished, true))
    .orderBy(courses.order);

  const moduleCountRows = await db
    .select({ courseId: courseModules.courseId, count: sql<number>`count(*)::int` })
    .from(courseModules)
    .groupBy(courseModules.courseId);

  const lessonCountRows = await db
    .select({
      courseId: courseModules.courseId,
      count: sql<number>`count(${lessons.id})::int`,
    })
    .from(lessons)
    .innerJoin(courseModules, eq(lessons.moduleId, courseModules.id))
    .groupBy(courseModules.courseId);

  const progressRows = await db
    .select({ lessonId: userLessonProgress.lessonId })
    .from(userLessonProgress)
    .where(
      and(
        eq(userLessonProgress.userId, user.id),
        sql`${userLessonProgress.completedAt} IS NOT NULL`
      )
    );

  // Build lookup maps
  const completedLessonIds = new Set(progressRows.map((p) => p.lessonId));

  // We need to know which lessons belong to which course to compute completedLessons per course
  const allLessonsWithCourse = await db
    .select({
      lessonId: lessons.id,
      courseId: courseModules.courseId,
    })
    .from(lessons)
    .innerJoin(courseModules, eq(lessons.moduleId, courseModules.id));

  const completedPerCourse = new Map<string, number>();
  for (const l of allLessonsWithCourse) {
    if (completedLessonIds.has(l.lessonId)) {
      completedPerCourse.set(l.courseId, (completedPerCourse.get(l.courseId) ?? 0) + 1);
    }
  }

  const moduleCountMap = new Map(moduleCountRows.map((r) => [r.courseId, r.count]));
  const lessonCountMap = new Map(lessonCountRows.map((r) => [r.courseId, r.count]));

  const items = allCourses.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: resolveLocale(lang, c.title),
    description: resolveLocale(lang, c.description),
    category: c.category,
    level: c.level,
    order: c.order,
    thumbnailUrl: c.thumbnailUrl,
    moduleCount: moduleCountMap.get(c.id) ?? 0,
    lessonCount: lessonCountMap.get(c.id) ?? 0,
    totalDurationSeconds: c.totalDurationSeconds,
    completedLessons: completedPerCourse.get(c.id) ?? 0,
  }));

  res.json({ items });
});

// GET /academy/courses/:id
router.get("/academy/courses/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = req.query.lang ?? user.language ?? "en";
  const courseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const modules = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(courseModules.order);

  const progressRows = await db
    .select()
    .from(userLessonProgress)
    .where(eq(userLessonProgress.userId, user.id));

  const progressMap = new Map(progressRows.map((p) => [p.lessonId, p]));

  const modulesWithLessons = await Promise.all(
    modules.map(async (mod) => {
      const lessonRows = await db
        .select()
        .from(lessons)
        .where(and(eq(lessons.moduleId, mod.id), eq(lessons.isPublished, true)))
        .orderBy(lessons.order);

      return {
        id: mod.id,
        courseId: mod.courseId,
        title: resolveLocale(lang, mod.title),
        order: mod.order,
        lessons: lessonRows.map((l) => {
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

// GET /academy/lessons/:id
router.get("/academy/lessons/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = req.query.lang ?? user.language ?? "en";
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

// PATCH /academy/lessons/:id/progress
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

// POST /academy/lessons/:id/quiz
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

// GET /academy/progress/summary
router.get("/academy/progress/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const allCourses = await db.select().from(courses).where(eq(courses.isPublished, true));
  const allModules = await db.select().from(courseModules);
  const allLessons = await db.select().from(lessons).where(eq(lessons.isPublished, true));
  const allProgress = await db
    .select()
    .from(userLessonProgress)
    .where(eq(userLessonProgress.userId, user.id));

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

  const progressMap = new Map(allProgress.map((p) => [p.lessonId, p]));

  const totalLessons = allLessons.length;
  const completedLessons = allProgress.filter((p) => p.completedAt).length;
  const totalDurationSeconds = allLessons.reduce((sum, l) => sum + l.durationSeconds, 0);
  const watchedDurationSeconds = allProgress.reduce((sum, p) => {
    const lesson = allLessons.find((l) => l.id === p.lessonId);
    return sum + Math.round(((lesson?.durationSeconds ?? 0) * p.watchPercent) / 100);
  }, 0);

  // A course is "completed" when all its lessons are completed
  let completedCourses = 0;
  for (const course of allCourses) {
    const mids = modulesByCourse.get(course.id) ?? [];
    const courseLessonIds = mids.flatMap((mid) => lessonsByModule.get(mid) ?? []);
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

// GET /academy/progress/next-lesson
router.get("/academy/progress/next-lesson", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const lang = req.query.lang ?? user.language ?? "en";

  const allCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.isPublished, true))
    .orderBy(courses.order);

  const allModules = await db.select().from(courseModules).orderBy(courseModules.order);
  const allLessons = await db
    .select()
    .from(lessons)
    .where(eq(lessons.isPublished, true))
    .orderBy(lessons.order);

  const allProgress = await db
    .select()
    .from(userLessonProgress)
    .where(eq(userLessonProgress.userId, user.id));

  const completedIds = new Set(allProgress.filter((p) => p.completedAt).map((p) => p.lessonId));
  const progressMap = new Map(allProgress.map((p) => [p.lessonId, p]));

  const moduleMap = new Map(allModules.map((m) => [m.id, m]));
  const courseMap = new Map(allCourses.map((c) => [c.id, c]));

  // Find the first incomplete lesson in order
  for (const lesson of allLessons) {
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

  // All lessons complete — return first lesson as review
  const firstLesson = allLessons[0];
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
