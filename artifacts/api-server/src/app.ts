import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { supabaseAuth } from "./middlewares/supabaseAuth";
import router from "./routes";
import { logger } from "./lib/logger";
import { getAllowedCorsOrigins, isCorsOriginAllowed } from "./lib/corsPolicy";
import { createApiErrorHandler, serializeApiError } from "./lib/apiErrors";
import healthRouter from "./routes/health";
import operationalReadinessRouter from "./routes/operational-readiness";
import { createFrontendHandler } from "./lib/frontend";
import { consentGate } from "./middlewares/consentGate";
import { accountAccessGate } from "./middlewares/accountAccessGate";
import accountAccessRouter from "./routes/accountAccess";
import { createBodyParsers } from "./lib/bodyLimits";
import { createApiRateLimiter, resolveTrustProxy } from "./lib/rateLimit";
import { createSecurityHeaders } from "./lib/securityHeaders";

const app: Express = express();
// req.ip must be the real client address behind the hosting reverse proxy.
app.set("trust proxy", resolveTrustProxy());

app.use(
  pinoHttp({
    logger,
    serializers: {
      err: serializeApiError,
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(createSecurityHeaders());

const allowedCorsOrigins = getAllowedCorsOrigins();
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      callback(null, isCorsOriginAllowed(origin, allowedCorsOrigins));
    },
  }),
);
// Probes must remain available without an authentication service round trip.
app.use("/api", healthRouter);
if (process.env.NODE_ENV === "production") {
  app.use(createFrontendHandler(process.env.FRONTEND_DIST_PATH || "artifacts/halolight-os/dist/public"));
}
// Strict 1mb default; only the routes listed in lib/bodyLimits accept larger JSON.
app.use(createBodyParsers());

app.use(supabaseAuth);
// After auth so authenticated traffic is counted per user rather than per IP.
app.use("/api", createApiRateLimiter());
app.use("/api", accountAccessGate);
app.use("/api", (req, res, next) => {
  if (req.method === "GET" && req.path === "/users/me/access") accountAccessRouter(req, res, next);
  else next();
});

// This exact read-only route independently requires an existing active admin.
app.use("/api", (req, res, next) => {
  if (req.method === "GET" && req.path === "/admin/operational-readiness") {
    operationalReadinessRouter(req, res, next);
  } else {
    next();
  }
});
app.use("/api", consentGate);
app.use("/api", accountAccessRouter);
app.use("/api", router);

app.use(createApiErrorHandler(logger));

export default app;
