import { and, eq, getTableColumns } from "drizzle-orm";
import { courseModules, courses, db, lessons } from "@workspace/db";

export type PublishedAcademyCatalog = {
  courses: Array<typeof courses.$inferSelect>;
  modules: Array<typeof courseModules.$inferSelect>;
  lessons: Array<typeof lessons.$inferSelect>;
};

const DEFAULT_TTL_MS = 60_000;
let cachedCatalog: { expiresAt: number; data: PublishedAcademyCatalog } | null =
  null;
let inFlightCatalog: Promise<PublishedAcademyCatalog> | null = null;
let cacheGeneration = 0;

function cacheTtlMs(): number {
  const raw = process.env.ACADEMY_CATALOG_CACHE_TTL_MS;
  if (!raw?.trim()) return DEFAULT_TTL_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_TTL_MS;
}

export function clearAcademyCatalogCache(): void {
  cacheGeneration++;
  cachedCatalog = null;
  inFlightCatalog = null;
}

async function loadPublishedAcademyCatalog(): Promise<PublishedAcademyCatalog> {
  const [courseRows, moduleRows, lessonRows] = await Promise.all([
    db
      .select()
      .from(courses)
      .where(eq(courses.isPublished, true))
      .orderBy(courses.order),
    db
      .select(getTableColumns(courseModules))
      .from(courseModules)
      .innerJoin(courses, eq(courseModules.courseId, courses.id))
      .where(eq(courses.isPublished, true))
      .orderBy(courseModules.order),
    db
      .select(getTableColumns(lessons))
      .from(lessons)
      .innerJoin(courseModules, eq(lessons.moduleId, courseModules.id))
      .innerJoin(courses, eq(courseModules.courseId, courses.id))
      .where(and(eq(lessons.isPublished, true), eq(courses.isPublished, true)))
      .orderBy(lessons.order),
  ]);

  // Separate queries can see different snapshots; retain only connected content.
  const courseIds = new Set(courseRows.map((course) => course.id));
  const visibleModules = moduleRows.filter((module) =>
    courseIds.has(module.courseId),
  );
  const moduleIds = new Set(visibleModules.map((module) => module.id));
  return {
    courses: courseRows,
    modules: visibleModules,
    lessons: lessonRows.filter((lesson) => moduleIds.has(lesson.moduleId)),
  };
}

export async function getPublishedAcademyCatalog(): Promise<PublishedAcademyCatalog> {
  for (;;) {
    if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
      return cachedCatalog.data;
    }
    const generation = cacheGeneration;
    if (!inFlightCatalog) {
      const pending = loadPublishedAcademyCatalog()
        .then((data) => {
          if (generation === cacheGeneration) {
            cachedCatalog = { data, expiresAt: Date.now() + cacheTtlMs() };
          }
          return data;
        })
        .finally(() => {
          if (inFlightCatalog === pending) inFlightCatalog = null;
        });
      inFlightCatalog = pending;
    }

    const data = await inFlightCatalog;
    // Invalidated waiters must reload too, not just avoid repopulating the cache.
    if (generation === cacheGeneration) return data;
  }
}
