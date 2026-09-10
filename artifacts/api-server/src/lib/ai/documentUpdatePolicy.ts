type DocumentState = {
  title: string;
  language: string;
  category: string;
  productModel: string | null;
  sourceUrl: string | null;
  content: string;
  tags: string[];
};

export function documentUpdatePolicy(
  existing: DocumentState,
  input: Record<string, unknown>,
):
  | { ok: true; resetApproval: boolean }
  | { ok: false; status: 400 | 409; error: string } {
  for (const field of ["title", "language", "category", "content", "status"]) {
    if (input[field] !== undefined && typeof input[field] !== "string")
      return { ok: false, status: 400, error: `Invalid ${field}` };
  }
  for (const field of ["sourceUrl", "productModel"]) {
    if (
      input[field] !== undefined &&
      input[field] !== null &&
      typeof input[field] !== "string"
    )
      return { ok: false, status: 400, error: `Invalid ${field}` };
  }
  if (input.aiActive !== undefined && typeof input.aiActive !== "boolean")
    return { ok: false, status: 400, error: "Invalid aiActive" };
  if (
    input.tags !== undefined &&
    (!Array.isArray(input.tags) ||
      !input.tags.every((tag) => typeof tag === "string"))
  )
    return { ok: false, status: 400, error: "Invalid tags" };

  const markers = existing.tags.filter((tag) => tag.startsWith("[sourceKey="));
  const linked =
    existing.sourceUrl?.startsWith("/kb/articles/") ||
    existing.sourceUrl?.startsWith("kb:");
  if (
    (markers.length > 0 || linked) &&
    input.sourceUrl !== undefined &&
    input.sourceUrl !== existing.sourceUrl
  )
    return {
      ok: false,
      status: 409,
      error: "Imported KB source linkage is immutable",
    };
  if (input.tags !== undefined && markers.length > 0) {
    const nextMarkers = (input.tags as string[]).filter((tag) =>
      tag.startsWith("[sourceKey="),
    );
    if (
      nextMarkers.length !== markers.length ||
      markers.some((marker) => !nextMarkers.includes(marker))
    )
      return {
        ok: false,
        status: 409,
        error: "Imported provenance markers are immutable",
      };
  }
  const resetApproval = (
    [
      "title",
      "language",
      "category",
      "productModel",
      "sourceUrl",
      "content",
    ] as const
  ).some(
    (field) => input[field] !== undefined && input[field] !== existing[field],
  );
  return { ok: true, resetApproval };
}
