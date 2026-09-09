import pino from "pino";
import { serializeApiError } from "./apiErrors";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: serializeApiError },
  hooks: {
    logMethod(args, method) {
      const fields = args[0];
      if (
        args[1] === undefined &&
        (fields instanceof Error ||
          (fields &&
            typeof fields === "object" &&
            "err" in fields &&
            fields.err &&
            (!("msg" in fields) || fields.msg === undefined)))
      ) {
        // Pino otherwise copies err.message into msg before running serializers.
        args[1] = "Operation failed";
      }
      method.apply(this, args);
    },
  },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
