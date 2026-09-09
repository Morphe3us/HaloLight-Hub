import path from "node:path";
import { isExplicitDevelopment } from "./env";

const MIME_BY_EXTENSION: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
  ".txt": ["text/plain"],
  ".csv": ["text/csv", "application/csv"],
  ".doc": ["application/msword"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ".zip": ["application/zip", "application/x-zip-compressed"],
};

const MAGIC_CHECKS: Record<string, (buffer: Buffer) => boolean> = {
  "application/pdf": (buffer) =>
    buffer.subarray(0, 5).toString("ascii") === "%PDF-",
  "image/png": (buffer) =>
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47,
  "image/jpeg": (buffer) =>
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff,
  "image/gif": (buffer) => {
    const prefix = buffer.subarray(0, 6).toString("ascii");
    return prefix === "GIF87a" || prefix === "GIF89a";
  },
  "image/webp": (buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP",
  "application/zip": (buffer) =>
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08),
};

const ZIP_BASED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const SAFE_INLINE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/csv",
]);

const ACTIVE_CONTENT_PATTERN =
  /<\s*(script|html|iframe|object|embed|svg|body|link|meta)\b|javascript\s*:|on[a-z]+\s*=/i;

export function normalizeMimeType(mimeType?: string | null): string {
  return (mimeType ?? "application/octet-stream")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export function getAllowedUploadMimeType(
  fileName: string,
  mimeType?: string | null,
): string | null {
  const ext = path.extname(fileName).toLowerCase();
  const normalized = normalizeMimeType(mimeType);
  const allowed = MIME_BY_EXTENSION[ext];
  if (!allowed) return null;
  if (allowed.includes(normalized)) return normalized;
  if (ZIP_BASED_MIME_TYPES.has(normalized) && allowed.includes(normalized)) {
    return normalized;
  }
  return null;
}

export function validateUploadedFile(options: {
  fileName: string;
  mimeType?: string | null;
  buffer: Buffer;
}): { ok: true; mimeType: string } | { ok: false; error: string } {
  const mimeType = getAllowedUploadMimeType(options.fileName, options.mimeType);
  if (!mimeType) {
    return { ok: false, error: "Unsupported file type" };
  }

  const textPrefix = options.buffer.subarray(0, 4096).toString("utf8");
  if (ACTIVE_CONTENT_PATTERN.test(textPrefix)) {
    return { ok: false, error: "Active content is not allowed" };
  }

  const magicMime = ZIP_BASED_MIME_TYPES.has(mimeType)
    ? "application/zip"
    : mimeType === "application/x-zip-compressed"
      ? "application/zip"
      : mimeType;
  const magicCheck = MAGIC_CHECKS[magicMime];
  if (magicCheck && !magicCheck(options.buffer)) {
    return { ok: false, error: "File content does not match its type" };
  }

  return { ok: true, mimeType };
}

export function contentDispositionForFile(options: {
  fileName?: string | null;
  mimeType?: string | null;
}): "inline" | "attachment" {
  const mimeType = normalizeMimeType(options.mimeType);
  if (!SAFE_INLINE_MIME_TYPES.has(mimeType)) return "attachment";
  return "inline";
}

export function safeDownloadName(fileName?: string | null): string {
  const base = path
    .basename(fileName ?? "file")
    .replace(/[\r\n"]/g, "_")
    .trim();
  return base || "file";
}

export function validateStoredFileUrl(
  value: unknown,
): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "File URL is required" };
  }

  const url = value.trim();
  if (/[\r\n]/.test(url)) {
    return { ok: false, error: "File URL is invalid" };
  }

  if (url.startsWith("/api/files/")) {
    return { ok: true, url };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return { ok: true, url: parsed.href };
    if (parsed.protocol === "http:" && isExplicitDevelopment()) {
      return { ok: true, url: parsed.href };
    }
  } catch {
    // Fall through to the shared error below.
  }

  return {
    ok: false,
    error: "File URL must be an HTTPS URL or an internal /api/files path",
  };
}
