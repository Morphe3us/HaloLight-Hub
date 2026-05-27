import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, count } from "drizzle-orm";
import { db, onboardingStepsTable, userOnboardingProgressTable, usersTable, events } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateUser } from "../lib/userSync";

const router: IRouter = Router();

// GET /onboarding/steps
router.get("/onboarding/steps", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const steps = await db
    .select()
    .from(onboardingStepsTable)
    .orderBy(onboardingStepsTable.order);

  const progress = await db
    .select()
    .from(userOnboardingProgressTable)
    .where(eq(userOnboardingProgressTable.userId, user.id));

  const progressMap = new Map(progress.map((p) => [p.stepId, p]));

  const items = steps.map((step) => {
    const p = progressMap.get(step.id);
    return {
      ...step,
      completedAt: p?.completedAt?.toISOString() ?? null,
      skippedAt: p?.skippedAt?.toISOString() ?? null,
    };
  });

  res.json({ items });
});

// PATCH /onboarding/steps/:stepId/complete
router.patch("/onboarding/steps/:stepId/complete", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const stepId = Array.isArray(req.params.stepId) ? req.params.stepId[0] : req.params.stepId;

  const [step] = await db
    .select()
    .from(onboardingStepsTable)
    .where(eq(onboardingStepsTable.id, stepId));

  if (!step) { res.status(404).json({ error: "Step not found" }); return; }

  // ── Validate real completion conditions for required steps ─────────────────
  if (step.isRequired) {
    const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
    switch (step.key) {
      case "complete_profile": {
        if (!freshUser?.fullName?.trim() || !freshUser?.companyName?.trim()) {
          res.status(422).json({
            error: "profile_incomplete",
            message: "Please add your full name and company name in Settings before completing this step.",
          });
          return;
        }
        break;
      }
      case "set_language": {
        if (!freshUser?.language) {
          res.status(422).json({
            error: "language_not_set",
            message: "Please select your preferred language in Settings before completing this step.",
          });
          return;
        }
        break;
      }
      case "create_first_event": {
        const [{ eventCount }] = await db
          .select({ eventCount: count() })
          .from(events)
          .where(eq(events.userId, user.id));
        if (eventCount === 0) {
          res.status(422).json({
            error: "no_events",
            message: "Please create your first event before completing this step.",
          });
          return;
        }
        break;
      }
    }
  }

  const existing = await db
    .select()
    .from(userOnboardingProgressTable)
    .where(and(
      eq(userOnboardingProgressTable.userId, user.id),
      eq(userOnboardingProgressTable.stepId, stepId)
    ));

  const now = new Date();
  if (existing.length === 0) {
    await db.insert(userOnboardingProgressTable).values({
      userId: user.id,
      stepId,
      completedAt: now,
    });
  } else {
    await db.update(userOnboardingProgressTable)
      .set({ completedAt: now, skippedAt: null })
      .where(and(
        eq(userOnboardingProgressTable.userId, user.id),
        eq(userOnboardingProgressTable.stepId, stepId)
      ));
  }

  res.json({
    ...step,
    completedAt: now.toISOString(),
    skippedAt: null,
  });
});

// GET /onboarding/summary
router.get("/onboarding/summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await getOrCreateUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const steps = await db.select().from(onboardingStepsTable);
  const progress = await db
    .select()
    .from(userOnboardingProgressTable)
    .where(eq(userOnboardingProgressTable.userId, user.id));

  const completedIds = new Set(
    progress.filter((p) => p.completedAt).map((p) => p.stepId)
  );

  const totalSteps = steps.length;
  const completedSteps = completedIds.size;
  const requiredSteps = steps.filter((s) => s.isRequired).length;
  const completedRequired = steps.filter((s) => s.isRequired && completedIds.has(s.id)).length;
  const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  res.json({ totalSteps, completedSteps, requiredSteps, completedRequired, percentComplete });
});

export default router;
