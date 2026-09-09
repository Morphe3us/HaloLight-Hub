type ApiErrorLike = {
  status?: unknown;
  message?: unknown;
  name?: unknown;
  data?: unknown;
};

function plainMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  // Proxy HTML, JSON fragments and transport diagnostics are not user-facing copy.
  if (
    !message || message.length > 500 ||
    /<|>|&(?:lt|gt|#0*60|#x0*3c);/i.test(message) ||
    /^[\[{]/.test(message) ||
    /^HTTP\s+\d+\b/i.test(message) ||
    /^(?:Failed to parse response|Unexpected token|Unexpected end of JSON|Failed to fetch|Load failed|NetworkError)/i.test(message)
  ) return null;
  return message;
}

function bodyMessage(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  for (const key of ["error", "message", "detail", "error_description", "title"]) {
    const message = plainMessage(record[key]);
    if (message) return message;
  }
  return null;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const candidate = error as ApiErrorLike;
  if (candidate.name === "ResponseParseError" || candidate.name === "SyntaxError") return fallback;
  const body = bodyMessage(candidate.data);
  if (body) return body;
  const message = typeof candidate.message === "string"
    ? candidate.message.replace(/^HTTP\s+\d{3}\b[^:\r\n]*:\s*/i, "")
    : null;
  return plainMessage(message) ?? fallback;
}

export function academyErrorMessage(error: unknown, translate: (key: string) => string): string {
  const data = error && typeof error === "object" ? (error as ApiErrorLike).data : null;
  const code = data && typeof data === "object" ? (data as Record<string, unknown>).code : null;
  if (code === "PLAYBACK_UNAVAILABLE") return translate("academy.playback_unavailable");
  if (code === "DATABASE_UNAVAILABLE") return translate("academy.database_unavailable");
  // Public Academy pages never expose server configuration or database diagnostics.
  return translate("academy.error_message");
}

export function apiErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as ApiErrorLike).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}
