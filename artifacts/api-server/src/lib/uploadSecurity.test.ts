import test from "node:test";
import assert from "node:assert/strict";
import {
  contentDispositionForFile,
  safeDownloadName,
  validateStoredFileUrl,
  validateUploadedFile,
} from "./uploadSecurity";

const originalNodeEnv = process.env.NODE_ENV;

test.afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test("validateUploadedFile allows known safe PDF uploads", () => {
  assert.deepEqual(
    validateUploadedFile({
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\ncontent"),
    }),
    { ok: true, mimeType: "application/pdf" },
  );
});

test("validateUploadedFile rejects scriptable active content", () => {
  assert.deepEqual(
    validateUploadedFile({
      fileName: "attack.html",
      mimeType: "text/html",
      buffer: Buffer.from("<script>alert(1)</script>"),
    }),
    { ok: false, error: "Unsupported file type" },
  );
  assert.deepEqual(
    validateUploadedFile({
      fileName: "note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("<iframe src='x'></iframe>"),
    }),
    { ok: false, error: "Active content is not allowed" },
  );
});

test("validateUploadedFile rejects mismatched magic bytes", () => {
  assert.deepEqual(
    validateUploadedFile({
      fileName: "image.png",
      mimeType: "image/png",
      buffer: Buffer.from("not-a-png"),
    }),
    { ok: false, error: "File content does not match its type" },
  );
});

test("contentDispositionForFile forces office files to attachment", () => {
  assert.equal(
    contentDispositionForFile({
      fileName: "deck.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    "attachment",
  );
  assert.equal(
    contentDispositionForFile({
      fileName: "brief.pdf",
      mimeType: "application/pdf",
    }),
    "inline",
  );
});

test("safeDownloadName strips path separators and dangerous quotes", () => {
  assert.equal(safeDownloadName('../bad"name.pdf'), "bad_name.pdf");
});

test("validateStoredFileUrl allows HTTPS and internal file URLs only in production", () => {
  process.env.NODE_ENV = "production";

  assert.deepEqual(validateStoredFileUrl("https://example.com/file.pdf"), {
    ok: true,
    url: "https://example.com/file.pdf",
  });
  assert.deepEqual(validateStoredFileUrl("/api/files/user/file.pdf"), {
    ok: true,
    url: "/api/files/user/file.pdf",
  });
  assert.equal(validateStoredFileUrl("javascript:alert(1)").ok, false);
  assert.equal(
    validateStoredFileUrl("data:text/html,<script></script>").ok,
    false,
  );
  assert.equal(validateStoredFileUrl("http://example.com/file.pdf").ok, false);
});

test("validateStoredFileUrl permits HTTP only in explicit development", () => {
  process.env.NODE_ENV = "development";

  assert.deepEqual(validateStoredFileUrl("http://localhost:8080/file.pdf"), {
    ok: true,
    url: "http://localhost:8080/file.pdf",
  });
});
