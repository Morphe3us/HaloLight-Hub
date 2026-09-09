import test from "node:test";
import assert from "node:assert/strict";
import { filterPublishedAcademyCourseRows } from "./ragFilters";

test("filterPublishedAcademyCourseRows excludes unpublished academy sources", () => {
  assert.deepEqual(
    filterPublishedAcademyCourseRows([
      { id: "published", isPublished: true },
      { id: "draft", isPublished: false },
    ]),
    [{ id: "published", isPublished: true }],
  );
});
