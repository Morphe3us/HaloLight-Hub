import { STATUS_CODES } from "node:http";
import type { ErrorRequestHandler } from "express";

export const DATABASE_UNAVAILABLE_RESPONSE = {
  error: "Service Unavailable",
  code: "DATABASE_UNAVAILABLE",
} as const;

const unavailableCodes = new Set([
  "DATABASE_UNAVAILABLE",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "28000",
  "28P01",
  "3D000",
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
]);

const unavailableMessages = new Set([
  "Query read timeout",
  "timeout expired",
  "timeout exceeded when trying to connect",
  "Connection terminated",
  "Connection terminated unexpectedly",
  "Connection terminated due to connection timeout",
  "Client has encountered a connection error and is not queryable",
  "Client was closed and is not queryable",
  "Cannot use a pool after calling end on the pool",
]);

function errorRecord(error: unknown): Record<string, unknown> | undefined {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)
    : undefined;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  const pending: unknown[] = [error];
  const seen = new Set<object>();

  while (pending.length > 0) {
    const current = errorRecord(pending.pop());
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const { code, message } = current;
    if (typeof code === "string" && unavailableCodes.has(code)) return true;
    if (typeof message === "string") {
      if (unavailableMessages.has(message)) return true;
      // XX000 is also used for unrelated SQL/internal errors; match only this outage.
      if (
        code === "XX000" &&
        /\b(?:tenant(?:\s*\/\s*user|\s+or\s+user)?|user)\b[^\r\n]*\bnot found\b/i.test(
          message,
        )
      ) {
        return true;
      }
    }

    pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors);
  }

  return false;
}

export function classifyApiError(error: unknown) {
  if (isDatabaseUnavailable(error)) {
    return { statusCode: 503, ...DATABASE_UNAVAILABLE_RESPONSE };
  }

  const record = errorRecord(error);
  const status = record?.status ?? record?.statusCode;
  if (
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 500
  ) {
    return {
      statusCode: status,
      code: "CLIENT_ERROR",
      error: STATUS_CODES[status] ?? "Bad Request",
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    error: "Internal Server Error",
  };
}

export function serializeApiError(error: unknown) {
  // pino-http's wrapped serializer keeps the original error on `raw`.
  return { code: classifyApiError(errorRecord(error)?.raw ?? error).code };
}

type ErrorLogger = {
  error: (
    fields: { code: string; statusCode: number },
    message: string,
  ) => void;
};

export function createApiErrorHandler(
  logger: ErrorLogger,
): ErrorRequestHandler {
  return (err: unknown, _req, res, next) => {
    const { statusCode, code, error } = classifyApiError(err);
    logger.error({ code, statusCode }, "API request failed");
    const safeError = Object.assign(new Error(error), {
      status: statusCode,
      code,
    });
    res.err = safeError;

    if (res.headersSent) {
      // Express must close the response, but its default handler also logs errors.
      next(safeError);
      return;
    }

    res
      .status(statusCode)
      .json(
        code === "DATABASE_UNAVAILABLE"
          ? DATABASE_UNAVAILABLE_RESPONSE
          : { error },
      );
  };
}
