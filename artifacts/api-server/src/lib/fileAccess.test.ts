import test from "node:test";
import assert from "node:assert/strict";
import { canAccessResourceFile, canAccessUploadFile } from "./fileAccess";

test("canAccessUploadFile restricts admin-only and ai-only files to admins", () => {
  assert.equal(
    canAccessUploadFile(
      { role: "client" },
      { visibility: "admin_only", status: "ready" },
    ),
    false,
  );
  assert.equal(
    canAccessUploadFile(
      { role: "coach" },
      { visibility: "ai_only", status: "ready" },
    ),
    false,
  );
  assert.equal(
    canAccessUploadFile(
      { role: "admin" },
      { visibility: "admin_only", status: "ready" },
    ),
    true,
  );
});

test("canAccessUploadFile allows client-visible and public-resource files to signed-in users", () => {
  assert.equal(
    canAccessUploadFile(
      { role: "client" },
      { visibility: "client_visible", status: "ready" },
    ),
    true,
  );
  assert.equal(
    canAccessUploadFile(
      { role: "client" },
      { visibility: "public_resource", status: "ready" },
    ),
    true,
  );
});

test("canAccessUploadFile blocks files that are not ready", () => {
  assert.equal(
    canAccessUploadFile(
      { role: "admin" },
      { visibility: "client_visible", status: "processing" },
    ),
    false,
  );
});

test("canAccessUploadFile keeps scoped uploads admin-only until entity-level ACL exists", () => {
  assert.equal(
    canAccessUploadFile(
      { role: "client" },
      {
        visibility: "client_visible",
        status: "ready",
        relatedCourseId: "course_1",
      },
    ),
    false,
  );
  assert.equal(
    canAccessUploadFile(
      { role: "admin" },
      {
        visibility: "client_visible",
        status: "ready",
        relatedCourseId: "course_1",
      },
    ),
    true,
  );
});

test("canAccessResourceFile restricts draft resources to admins", () => {
  assert.equal(
    canAccessResourceFile({ role: "client" }, { status: "draft" }),
    false,
  );
  assert.equal(
    canAccessResourceFile({ role: "client" }, { status: "published" }),
    true,
  );
  assert.equal(
    canAccessResourceFile({ role: "admin" }, { status: "draft" }),
    true,
  );
});
