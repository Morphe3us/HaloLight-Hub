import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser, resolveAccountUser } from "../lib/userSync";

const router: IRouter = Router();

router.get("/users/me/access", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const user = await resolveAccountUser(req);
  if (!user) { res.status(403).json({ error: "Account cannot be provisioned" }); return; }
  const status = !user.isActive ? "disabled" : user.accessStatus;
  if (!["approved", "pending", "rejected", "disabled"].includes(status)) {
    res.status(403).json({ error: "Account access is unavailable" }); return;
  }
  res.json({ status, email: user.email });
});

router.post("/users/:id/access", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const actor = await getOrCreateUser(req);
  if (!actor || !actor.isActive || actor.accessStatus !== "approved" || actor.role !== "admin") {
    res.status(403).json({ error: "Approved administrator required" }); return;
  }
  const id = String(req.params.id);
  if (id === actor.id) { res.status(403).json({ error: "Cannot review your own account" }); return; }
  const body: unknown = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !("decision" in body) ||
      (body.decision !== "approved" && body.decision !== "rejected")) {
    res.status(400).json({ error: "Invalid decision" }); return;
  }
  const [updated] = await db.update(usersTable)
    .set({ accessStatus: body.decision, updatedAt: new Date() })
    .where(and(eq(usersTable.id, id), eq(usersTable.isActive, true),
      eq(usersTable.accessStatus, "pending"), eq(usersTable.role, "client")))
    .returning();
  if (!updated) { res.status(409).json({ error: "Account is not an active pending client" }); return; }
  res.json(updated);
});

export default router;
