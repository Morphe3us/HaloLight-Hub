import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "../middlewares/supabaseAuth";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
