import { Router, type IRouter } from "express";
import { getAuth } from "../middlewares/supabaseAuth";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { operationalReadiness } from "../lib/operationalReadiness";

const router: IRouter = Router();

router.get("/admin/operational-readiness", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const authId = getAuth(req)?.userId;
  if (!authId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [user] = await db.select({ role: usersTable.role, isActive: usersTable.isActive })
      .from(usersTable).where(eq(usersTable.authId, authId)).limit(1);
    if (!user || !user.isActive || user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    res.json(operationalReadiness(process.env));
  } catch {
    res.status(503).json({ error: "Operational readiness unavailable" });
  }
});

export default router;
