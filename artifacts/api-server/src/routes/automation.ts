import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, count, gte } from "drizzle-orm";
import { db, automationRules, automationExecutions, automationLogs } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";
import { runAutomation, runSingleRule } from "../lib/automation/engine";

const router: IRouter = Router();

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (user.role !== "admin") { res.status(403).json({ error: "Admin only" }); return false; }
  return true;
}

// ─── GET /automation/stats ────────────────────────────────────────────────────

router.get("/automation/stats", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [totalRules] = await db.select({ count: count() }).from(automationRules);
  const [enabledRules] = await db.select({ count: count() })
    .from(automationRules).where(eq(automationRules.isEnabled, 1));
  const [todayExecutions] = await db.select({ count: count() })
    .from(automationExecutions).where(gte(automationExecutions.startedAt, today));
  const [totalExecutions] = await db.select({ count: count() }).from(automationExecutions);
  const [actionsTodayResult] = await db.select({ count: count() })
    .from(automationLogs)
    .where(and(eq(automationLogs.status, "action_taken"), gte(automationLogs.createdAt, today)));
  const [totalActionsResult] = await db.select({ count: count() })
    .from(automationLogs).where(eq(automationLogs.status, "action_taken"));
  const [errorsTodayResult] = await db.select({ count: count() })
    .from(automationLogs)
    .where(and(eq(automationLogs.status, "error"), gte(automationLogs.createdAt, today)));

  res.json({
    totalRules: Number(totalRules?.count ?? 0),
    enabledRules: Number(enabledRules?.count ?? 0),
    todayExecutions: Number(todayExecutions?.count ?? 0),
    totalExecutions: Number(totalExecutions?.count ?? 0),
    actionsToday: Number(actionsTodayResult?.count ?? 0),
    totalActions: Number(totalActionsResult?.count ?? 0),
    errorsToday: Number(errorsTodayResult?.count ?? 0),
  });
});

// ─── GET /automation/rules ────────────────────────────────────────────────────

router.get("/automation/rules", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;
  const rules = await db.select().from(automationRules).orderBy(automationRules.createdAt);
  res.json({ items: rules, total: rules.length });
});

// ─── POST /automation/rules ───────────────────────────────────────────────────

router.post("/automation/rules", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const { name, description, triggerType, actionType, triggerConfig, actionConfig, isEnabled } =
    req.body as Record<string, unknown>;

  if (!name || !triggerType || !actionType) {
    res.status(400).json({ error: "name, triggerType, and actionType are required" });
    return;
  }

  const [rule] = await db.insert(automationRules).values({
    name: String(name),
    description: String(description ?? ""),
    triggerType: String(triggerType) as never,
    actionType: String(actionType) as never,
    triggerConfig: (triggerConfig as object) ?? {},
    actionConfig: (actionConfig as object) ?? {},
    isEnabled: isEnabled === false ? 0 : 1,
  }).returning();

  res.status(201).json(rule);
});

// ─── GET /automation/rules/:id ────────────────────────────────────────────────

router.get("/automation/rules/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;
  const id = String(req.params.id);
  const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, id));
  if (!rule) { res.status(404).json({ error: "Not found" }); return; }

  const recentLogs = await db.select().from(automationLogs)
    .where(eq(automationLogs.ruleId, id))
    .orderBy(desc(automationLogs.createdAt))
    .limit(20);

  res.json({ ...rule, recentLogs });
});

// ─── PATCH /automation/rules/:id ─────────────────────────────────────────────

router.patch("/automation/rules/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;
  const id = String(req.params.id);
  const [existing] = await db.select().from(automationRules).where(eq(automationRules.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { name, description, triggerConfig, actionConfig, isEnabled } = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (description !== undefined) updates.description = String(description);
  if (triggerConfig !== undefined) updates.triggerConfig = triggerConfig;
  if (actionConfig !== undefined) updates.actionConfig = actionConfig;
  if (isEnabled !== undefined) updates.isEnabled = isEnabled ? 1 : 0;

  const [updated] = await db.update(automationRules)
    .set(updates as never)
    .where(eq(automationRules.id, id))
    .returning();

  res.json(updated);
});

// ─── DELETE /automation/rules/:id ────────────────────────────────────────────

router.delete("/automation/rules/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;
  const id = String(req.params.id);
  await db.delete(automationRules).where(eq(automationRules.id, id));
  res.status(204).end();
});

// ─── POST /automation/rules/:id/trigger ──────────────────────────────────────

router.post("/automation/rules/:id/trigger", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

  const id = String(req.params.id);
  try {
    const result = await runSingleRule(id, user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ─── GET /automation/executions ───────────────────────────────────────────────

router.get("/automation/executions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);

  const items = await db.select().from(automationExecutions)
    .orderBy(desc(automationExecutions.startedAt))
    .limit(limit).offset(offset);

  const [total] = await db.select({ count: count() }).from(automationExecutions);

  res.json({ items, total: Number(total?.count ?? 0) });
});

// ─── GET /automation/executions/:id ──────────────────────────────────────────

router.get("/automation/executions/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const id = String(req.params.id);
  const [execution] = await db.select().from(automationExecutions)
    .where(eq(automationExecutions.id, id));
  if (!execution) { res.status(404).json({ error: "Not found" }); return; }

  const logs = await db.select().from(automationLogs)
    .where(eq(automationLogs.executionId, id))
    .orderBy(desc(automationLogs.createdAt));

  res.json({ ...execution, logs });
});

// ─── GET /automation/logs ─────────────────────────────────────────────────────

router.get("/automation/logs", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);
  const ruleId = req.query.ruleId ? String(req.query.ruleId) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  const conditions = [
    ...(ruleId ? [eq(automationLogs.ruleId, ruleId)] : []),
    ...(status ? [eq(automationLogs.status, status)] : []),
  ];

  const query = db.select().from(automationLogs);
  const items = conditions.length > 0
    ? await query.where(and(...conditions as [ReturnType<typeof eq>])).orderBy(desc(automationLogs.createdAt)).limit(limit).offset(offset)
    : await query.orderBy(desc(automationLogs.createdAt)).limit(limit).offset(offset);

  const [total] = await db.select({ count: count() }).from(automationLogs);

  res.json({ items, total: Number(total?.count ?? 0) });
});

// ─── POST /automation/run ─────────────────────────────────────────────────────

router.post("/automation/run", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "admin") { res.status(403).json({ error: "Admin only" }); return; }

  try {
    const result = await runAutomation(user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
