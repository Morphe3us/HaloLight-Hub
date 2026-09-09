import test from "node:test";
import assert from "node:assert/strict";
import { canAccessPublishedContent } from "./academyAccess";

test("canAccessPublishedContent blocks unpublished courses on public routes", () => {
  assert.equal(
    canAccessPublishedContent(
      { role: "client" },
      { course: { isPublished: false } },
    ),
    false,
  );
  assert.equal(
    canAccessPublishedContent(
      { role: "admin" },
      { course: { isPublished: false } },
    ),
    false,
  );
});

test("canAccessPublishedContent blocks unpublished lessons on public routes", () => {
  assert.equal(
    canAccessPublishedContent(
      { role: "client" },
      { course: { isPublished: true }, lesson: { isPublished: false } },
    ),
    false,
  );
  assert.equal(
    canAccessPublishedContent(
      { role: "admin" },
      { course: { isPublished: true }, lesson: { isPublished: false } },
    ),
    false,
  );
  assert.equal(
    canAccessPublishedContent(
      { role: "client" },
      { course: { isPublished: true }, lesson: { isPublished: true } },
    ),
    true,
  );
});

test("publication checks apply to every role and require both lesson and course", () => {
  for (const role of ["client", "admin", "coach", "sales_rep"]) {
    for (const coursePublished of [true, false]) {
      assert.equal(
        canAccessPublishedContent(
          { role },
          { course: { isPublished: coursePublished } },
        ),
        coursePublished,
      );
      for (const lessonPublished of [true, false]) {
        assert.equal(
          canAccessPublishedContent(
            { role },
            {
              course: { isPublished: coursePublished },
              lesson: { isPublished: lessonPublished },
            },
          ),
          coursePublished && lessonPublished,
        );
      }
    }
  }
});
