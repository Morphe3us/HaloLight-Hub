import type { RequestHandler } from "express";
import { getAuth } from "../middlewares/supabaseAuth";
import { getOrCreateUser } from "../lib/userSync";
import { legalConsentEnabled, publishedLegalDocuments } from "../lib/userConsentPolicy";
import { userConsentStatus } from "../lib/userCompliance";

export function isConsentBootstrap(method: string, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return (method === "GET" && ["/users/me", "/users/me/consent", "/exports/personal"].includes(path)) ||
    (method === "POST" && path === "/users/me/consent");
}

export const consentGate: RequestHandler = async (req, res, next) => {
  if (!legalConsentEnabled() || isConsentBootstrap(req.method, req.path) || !getAuth(req)?.userId) {
    next();
    return;
  }
  if (!publishedLegalDocuments()) {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(503).json({ error: "Approved legal documents are not configured", code: "LEGAL_NOT_CONFIGURED" });
    return;
  }
  const user = await getOrCreateUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if ((await userConsentStatus(user.id)).required) {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(428).json({ error: "Current terms and privacy acceptance is required", code: "CONSENT_REQUIRED" });
    return;
  }
  next();
};
