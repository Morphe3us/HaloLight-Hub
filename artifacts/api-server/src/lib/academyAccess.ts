type RoleUser = { role: string };

type PublishedContent = {
  lesson?: { isPublished: boolean };
  course: { isPublished: boolean };
};

export function canAccessPublishedContent(
  _user: RoleUser,
  item: PublishedContent,
): boolean {
  return item.course.isPublished && (item.lesson?.isPublished ?? true);
}
