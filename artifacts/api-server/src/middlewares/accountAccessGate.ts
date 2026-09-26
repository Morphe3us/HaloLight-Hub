import type { RequestHandler } from "express";
import { getAuth } from "./supabaseAuth";
import { resolveAccountUser } from "../lib/userSync";

export const accountAccessGate: RequestHandler = async (req, res, next) => {
  if (!getAuth(req)?.userId) { next(); return; }
  if (req.method === "GET" && req.path === "/users/me/access") { next(); return; }
  const user = await resolveAccountUser(req);
  if (user?.isActive && user.accessStatus === "approved") { next(); return; }
  res.setHeader("Cache-Control", "private, no-store");
  const status = !user ? "unavailable" : !user.isActive ? "disabled" : user.accessStatus;
  res.status(403).json({ error: "Account access is not approved", code: "ACCOUNT_ACCESS_REQUIRED", status });
};
