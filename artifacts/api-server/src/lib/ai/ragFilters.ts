export function filterPublishedAcademyCourseRows<
  T extends { isPublished: boolean },
>(rows: T[]): T[] {
  return rows.filter((row) => row.isPublished);
}
