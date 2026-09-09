type RoleUser = { role: string };

type UploadLike = {
  visibility: "admin_only" | "client_visible" | "ai_only" | "public_resource";
  status: string;
  relatedCourseId?: string | null;
  relatedLessonId?: string | null;
  relatedProduct?: string | null;
};

type ResourceLike = {
  status: string;
};

export function canAccessUploadFile(
  user: RoleUser,
  upload: UploadLike,
): boolean {
  if (upload.status !== "ready") return false;

  const restricted =
    upload.visibility === "admin_only" || upload.visibility === "ai_only";
  if (restricted) return user.role === "admin";

  const isScoped =
    Boolean(upload.relatedCourseId) ||
    Boolean(upload.relatedLessonId) ||
    Boolean(upload.relatedProduct);
  if (isScoped) return user.role === "admin";

  return true;
}

export function canAccessResourceFile(
  user: RoleUser,
  resource: ResourceLike,
): boolean {
  return resource.status === "published" || user.role === "admin";
}
