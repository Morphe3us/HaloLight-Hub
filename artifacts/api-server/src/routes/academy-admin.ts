import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db, courses, courseModules, lessons,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

function requireAdmin(user: { role: string } | null | undefined, res: Response): boolean {
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

async function buildAdminCourse(course: typeof courses.$inferSelect) {
  const modulesWithLessons = await db
    .select({
      moduleId: courseModules.id,
      moduleTitle: courseModules.title,
      moduleOrder: courseModules.order,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      lessonOrder: lessons.order,
      lessonDuration: lessons.durationSeconds,
      lessonPublished: lessons.isPublished,
      lessonVideoUrl: lessons.videoUrl,
      lessonDescription: lessons.description,
      lessonNotes: lessons.notes,
    })
    .from(courseModules)
    .leftJoin(lessons, eq(lessons.moduleId, courseModules.id))
    .where(eq(courseModules.courseId, course.id))
    .orderBy(courseModules.order, lessons.order);

  const moduleMap = new Map<string, {
    id: string; courseId: string; title: unknown; order: number;
    lessons: Array<{ id: string; moduleId: string; title: unknown; description: unknown; videoUrl: string; durationSeconds: number; order: number; isPublished: boolean; notes: string | null }>;
  }>();

  for (const row of modulesWithLessons) {
    if (!moduleMap.has(row.moduleId)) {
      moduleMap.set(row.moduleId, {
        id: row.moduleId,
        courseId: course.id,
        title: row.moduleTitle,
        order: row.moduleOrder,
        lessons: [],
      });
    }
    if (row.lessonId) {
      moduleMap.get(row.moduleId)!.lessons.push({
        id: row.lessonId,
        moduleId: row.moduleId,
        title: row.lessonTitle,
        description: row.lessonDescription,
        videoUrl: row.lessonVideoUrl ?? "",
        durationSeconds: row.lessonDuration ?? 0,
        order: row.lessonOrder ?? 0,
        isPublished: row.lessonPublished ?? true,
        notes: row.lessonNotes,
      });
    }
  }

  const moduleList = Array.from(moduleMap.values());
  const lessonCount = moduleList.reduce((s, m) => s + m.lessons.length, 0);

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    category: course.category,
    level: course.level,
    thumbnailUrl: course.thumbnailUrl,
    isPublished: course.isPublished,
    isFeatured: course.isFeatured,
    order: course.order,
    totalDurationSeconds: course.totalDurationSeconds,
    instructorName: course.instructorName,
    estimatedDuration: course.estimatedDuration,
    moduleCount: moduleList.length,
    lessonCount,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    modules: moduleList,
  };
}

// GET /admin/academy/courses
router.get("/admin/academy/courses", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { q, status } = req.query as Record<string, string>;

  let allCourses = await db.select().from(courses).orderBy(courses.order, desc(courses.createdAt));

  if (status === "published") allCourses = allCourses.filter(c => c.isPublished);
  if (status === "draft") allCourses = allCourses.filter(c => !c.isPublished);
  if (q) {
    const lower = q.toLowerCase();
    allCourses = allCourses.filter(c => {
      const titles = Object.values(c.title as Record<string, string>).join(" ").toLowerCase();
      return titles.includes(lower) || c.category.toLowerCase().includes(lower);
    });
  }

  const items = await Promise.all(allCourses.map(buildAdminCourse));
  res.json({ items, total: items.length });
});

// POST /admin/academy/courses
router.post("/admin/academy/courses", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { title, description, category, level, thumbnailUrl, isPublished, isFeatured, instructorName, estimatedDuration } = req.body as {
    title?: Record<string, string>;
    description?: Record<string, string>;
    category?: string;
    level?: string;
    thumbnailUrl?: string;
    isPublished?: boolean;
    isFeatured?: boolean;
    instructorName?: string;
    estimatedDuration?: string;
  };

  if (!title || !description || !category || !level) {
    res.status(400).json({ error: "title, description, category, and level are required" });
    return;
  }

  const slug = `course-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [maxOrderRow] = await db.select({ max: sql<number>`coalesce(max("order"), 0)` }).from(courses);
  const nextOrder = (maxOrderRow?.max ?? 0) + 1;

  const [course] = await db.insert(courses).values({
    slug,
    title,
    description,
    category,
    level: (level as "beginner" | "intermediate" | "advanced") ?? "beginner",
    thumbnailUrl: thumbnailUrl ?? "",
    isPublished: isPublished ?? false,
    isFeatured: isFeatured ?? false,
    instructorName: instructorName ?? null,
    estimatedDuration: estimatedDuration ?? null,
    order: nextOrder,
  }).returning();

  res.status(201).json(await buildAdminCourse(course!));
});

// GET /admin/academy/courses/:id
router.get("/admin/academy/courses/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const [course] = await db.select().from(courses).where(eq(courses.id, String(req.params.id)));
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  res.json(await buildAdminCourse(course));
});

// PUT /admin/academy/courses/:id
router.put("/admin/academy/courses/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { title, description, category, level, thumbnailUrl, isPublished, isFeatured, instructorName, estimatedDuration, order } = req.body as {
    title?: Record<string, string>;
    description?: Record<string, string>;
    category?: string;
    level?: string;
    thumbnailUrl?: string;
    isPublished?: boolean;
    isFeatured?: boolean;
    instructorName?: string;
    estimatedDuration?: string;
    order?: number;
  };

  const updates: Partial<typeof courses.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (category !== undefined) updates.category = category;
  if (level !== undefined) updates.level = level as "beginner" | "intermediate" | "advanced";
  if (thumbnailUrl !== undefined) updates.thumbnailUrl = thumbnailUrl;
  if (isPublished !== undefined) updates.isPublished = isPublished;
  if (isFeatured !== undefined) updates.isFeatured = isFeatured;
  if (instructorName !== undefined) updates.instructorName = instructorName;
  if (estimatedDuration !== undefined) updates.estimatedDuration = estimatedDuration;
  if (order !== undefined) updates.order = order;

  const [updated] = await db.update(courses).set(updates).where(eq(courses.id, String(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "Course not found" }); return; }

  res.json(await buildAdminCourse(updated));
});

// DELETE /admin/academy/courses/:id
router.delete("/admin/academy/courses/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  await db.delete(courses).where(eq(courses.id, String(req.params.id)));
  res.status(204).send();
});

// POST /admin/academy/courses/:id/duplicate
router.post("/admin/academy/courses/:id/duplicate", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const [original] = await db.select().from(courses).where(eq(courses.id, String(req.params.id)));
  if (!original) { res.status(404).json({ error: "Course not found" }); return; }

  const [maxOrderRow] = await db.select({ max: sql<number>`coalesce(max("order"), 0)` }).from(courses);
  const nextOrder = (maxOrderRow?.max ?? 0) + 1;
  const slug = `${original.slug}-copy-${Date.now()}`;

  const [dupCourse] = await db.insert(courses).values({
    slug,
    title: { ...(original.title as object), en: `${(original.title as Record<string, string>).en ?? ""} (Copy)` },
    description: original.description,
    category: original.category,
    level: original.level,
    thumbnailUrl: original.thumbnailUrl,
    isPublished: false,
    isFeatured: false,
    instructorName: original.instructorName,
    estimatedDuration: original.estimatedDuration,
    order: nextOrder,
  }).returning();

  // Duplicate modules and lessons
  const originalModules = await db.select().from(courseModules).where(eq(courseModules.courseId, original.id)).orderBy(courseModules.order);
  for (const mod of originalModules) {
    const [dupMod] = await db.insert(courseModules).values({
      courseId: dupCourse!.id,
      title: mod.title,
      order: mod.order,
    }).returning();

    const originalLessons = await db.select().from(lessons).where(eq(lessons.moduleId, mod.id)).orderBy(lessons.order);
    for (const lesson of originalLessons) {
      await db.insert(lessons).values({
        moduleId: dupMod!.id,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.videoUrl,
        durationSeconds: lesson.durationSeconds,
        order: lesson.order,
        isPublished: false,
        notes: lesson.notes,
      });
    }
  }

  res.status(201).json(await buildAdminCourse(dupCourse!));
});

// POST /admin/academy/modules
router.post("/admin/academy/modules", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { courseId, title, order } = req.body as { courseId?: string; title?: Record<string, string>; order?: number };
  if (!courseId || !title) { res.status(400).json({ error: "courseId and title are required" }); return; }

  const [maxRow] = await db.select({ max: sql<number>`coalesce(max("order"), 0)` }).from(courseModules).where(eq(courseModules.courseId, courseId));
  const [mod] = await db.insert(courseModules).values({
    courseId,
    title,
    order: order ?? (maxRow?.max ?? 0) + 1,
  }).returning();

  res.status(201).json({ id: mod!.id, courseId: mod!.courseId, title: mod!.title, order: mod!.order, lessons: [] });
});

// PUT /admin/academy/modules/:id
router.put("/admin/academy/modules/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { title, order } = req.body as { title?: Record<string, string>; order?: number };
  const updates: Partial<typeof courseModules.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (order !== undefined) updates.order = order;

  const [updated] = await db.update(courseModules).set(updates).where(eq(courseModules.id, String(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "Module not found" }); return; }

  const moduleLessons = await db.select().from(lessons).where(eq(lessons.moduleId, updated.id)).orderBy(lessons.order);
  res.json({ id: updated.id, courseId: updated.courseId, title: updated.title, order: updated.order, lessons: moduleLessons });
});

// DELETE /admin/academy/modules/:id
router.delete("/admin/academy/modules/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  await db.delete(courseModules).where(eq(courseModules.id, String(req.params.id)));
  res.status(204).send();
});

// POST /admin/academy/lessons
router.post("/admin/academy/lessons", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { moduleId, title, description, videoUrl, durationSeconds, isPublished, notes } = req.body as {
    moduleId?: string; title?: Record<string, string>; description?: Record<string, string>;
    videoUrl?: string; durationSeconds?: number; isPublished?: boolean; notes?: string;
  };
  if (!moduleId || !title) { res.status(400).json({ error: "moduleId and title are required" }); return; }

  const [maxRow] = await db.select({ max: sql<number>`coalesce(max("order"), 0)` }).from(lessons).where(eq(lessons.moduleId, moduleId));
  const [lesson] = await db.insert(lessons).values({
    moduleId,
    title,
    description: description ?? null,
    videoUrl: videoUrl ?? "",
    durationSeconds: durationSeconds ?? 0,
    order: (maxRow?.max ?? 0) + 1,
    isPublished: isPublished ?? false,
    notes: notes ?? null,
  }).returning();

  res.status(201).json({
    id: lesson!.id, moduleId: lesson!.moduleId, title: lesson!.title, description: lesson!.description,
    videoUrl: lesson!.videoUrl, durationSeconds: lesson!.durationSeconds, order: lesson!.order,
    isPublished: lesson!.isPublished, notes: lesson!.notes,
  });
});

// PUT /admin/academy/lessons/:id
router.put("/admin/academy/lessons/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  const { title, description, videoUrl, durationSeconds, isPublished, notes, order } = req.body as {
    title?: Record<string, string>; description?: Record<string, string>;
    videoUrl?: string; durationSeconds?: number; isPublished?: boolean; notes?: string; order?: number;
  };

  const updates: Partial<typeof lessons.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (videoUrl !== undefined) updates.videoUrl = videoUrl;
  if (durationSeconds !== undefined) updates.durationSeconds = durationSeconds;
  if (isPublished !== undefined) updates.isPublished = isPublished;
  if (notes !== undefined) updates.notes = notes;
  if (order !== undefined) updates.order = order;

  const [updated] = await db.update(lessons).set(updates).where(eq(lessons.id, String(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "Lesson not found" }); return; }

  res.json({
    id: updated.id, moduleId: updated.moduleId, title: updated.title, description: updated.description,
    videoUrl: updated.videoUrl, durationSeconds: updated.durationSeconds, order: updated.order,
    isPublished: updated.isPublished, notes: updated.notes,
  });
});

// DELETE /admin/academy/lessons/:id
router.delete("/admin/academy/lessons/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!requireAdmin(user, res)) return;

  await db.delete(lessons).where(eq(lessons.id, String(req.params.id)));
  res.status(204).send();
});

export default router;
